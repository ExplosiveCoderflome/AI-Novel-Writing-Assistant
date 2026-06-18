/**
 * ComicCharacterImageService
 * 为漫画角色生成「角色设计稿」：一张横版图同时包含面部特写 + 正/侧/背三视图。
 * 对齐 DramaCharacterImageService 的能力和存储规范。
 *
 * sheetData 结构：{ status, version, url, prompt, provider, generatedAt, error, history[] }
 * 图片存储：generated-images/comic-characters/{charId}/character-sheet.{ext}
 * HTTP 端点：/api/comic/character-images/:charId/sheet
 */
import fs from "fs/promises";
import path from "path";
import sharp from "sharp";

import { prisma } from "../../db/prisma";
import { AppError } from "../../middleware/errorHandler";
import { resolveGeneratedImagesRoot } from "../../runtime/appPaths";
import {
  generateImagesByProvider,
  isImageProviderSupported,
  resolveImageModel,
} from "../image/provider";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { resolveComicStyleKeywords } from "./comicStylePrompt";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CharacterSheetStatus = "idle" | "generating" | "done" | "error";

export interface CharacterSheetHistoryItem {
  version: number;
  url?: string;
  prompt?: string;
  provider?: string;
  generatedAt?: string;
}

export interface CharacterSheetData {
  status: CharacterSheetStatus;
  version?: number;
  url?: string;
  prompt?: string;
  provider?: string;
  generatedAt?: string;
  error?: string;
  history?: CharacterSheetHistoryItem[];
  assets?: {
    expression?: CharacterExpressionData;
  };
}

export interface GenerateCharacterSheetOptions {
  prompt?: string;
  useCurrentImageAsReference?: boolean;
  lockAppearance?: boolean;
  appearanceOverride?: string;
}

export type CharacterExpressionStatus = CharacterSheetStatus;
export type CharacterExpressionId = "neutral" | "happy" | "angry" | "sad" | "surprised" | "cold";

export interface CharacterExpressionData {
  status: CharacterExpressionStatus;
  version?: number;
  url?: string;
  prompt?: string;
  provider?: string;
  generatedAt?: string;
  error?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const COMIC_CHARS_DIR = "comic-characters";
const DEFAULT_PROVIDER: LLMProvider = "openai";
const IMAGE_EXTS: Array<[string, string]> = [
  ["png", "image/png"],
  ["jpg", "image/jpeg"],
  ["webp", "image/webp"],
];
const EXPRESSION_ORDER: CharacterExpressionId[] = ["neutral", "happy", "angry", "sad", "surprised", "cold"];
const EXPRESSION_LABELS: Record<CharacterExpressionId, string> = {
  neutral: "正常",
  happy: "开心",
  angry: "愤怒",
  sad: "悲伤",
  surprised: "惊讶",
  cold: "冷漠",
};

function comicCharacterDir(charId: string): string {
  return path.join(resolveGeneratedImagesRoot(), COMIC_CHARS_DIR, charId);
}

function sheetUrl(charId: string): string {
  return `/api/comic/character-images/${charId}/sheet`;
}

function expressionUrl(charId: string): string {
  return `/api/comic/character-images/${charId}/expression`;
}

function archivedSheetUrl(charId: string, version: number): string {
  return `/api/comic/character-images/${charId}/sheet/v${version}`;
}

function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

async function saveImageToDisk(imageUrl: string, destPath: string): Promise<void> {
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  if (imageUrl.startsWith("data:")) {
    const [, b64 = ""] = imageUrl.split(",", 2);
    await fs.writeFile(destPath, Buffer.from(b64, "base64"));
  } else {
    const resp = await fetch(imageUrl);
    if (!resp.ok) throw new Error(`图片下载失败 (${resp.status}): ${imageUrl}`);
    await fs.writeFile(destPath, Buffer.from(await resp.arrayBuffer()));
  }
}

function inferExtension(url: string): string {
  if (url.startsWith("data:image/jpeg")) return "jpg";
  if (url.startsWith("data:image/webp")) return "webp";
  try {
    const ext = path.extname(new URL(url).pathname).replace(".", "").toLowerCase();
    return ext || "png";
  } catch { return "png"; }
}

function readVersion(data: CharacterSheetData): number {
  const v = Number(data.version);
  return Number.isFinite(v) && v > 0 ? Math.round(v) : data.status === "done" ? 1 : 0;
}

function readExpressionVersion(data: CharacterExpressionData | undefined): number {
  const v = Number(data?.version);
  return Number.isFinite(v) && v > 0 ? Math.round(v) : data?.status === "done" ? 1 : 0;
}

/**
 * 取脸型强覆盖描述（visualSpec.faceShapeOverride）。
 * 当用户希望强压脸型但不想删 appearance 里的人设描述（如反派"五官锐利"）时使用。
 * 生图 prompt 里以 FINAL OVERRIDE 形式追加，权重高于 appearance。
 */
function extractFaceShapeOverride(visualAnchor: string | null | undefined): string {
  if (!visualAnchor?.trim()) return "";
  try {
    const parsed = JSON.parse(visualAnchor) as Record<string, unknown>;
    const spec = parsed.visualSpec as Record<string, unknown> | undefined;
    if (spec && typeof spec.faceShapeOverride === "string") return spec.faceShapeOverride.trim();
  } catch { /* ignore */ }
  return "";
}

/**
 * 取角色外貌描述。
 * 优先级：visualSpec.appearance（完整版，含脸型/体格/服饰/标志细节）
 *       > description（40 字精简版）
 *       > hint
 * 三视图/表情稿/资产图都该用完整版，把"外貌锁定"做实而不是只放氛围词。
 */
function extractVisualDesc(visualAnchor: string | null | undefined): string {
  if (!visualAnchor?.trim()) return "";
  try {
    const parsed = JSON.parse(visualAnchor) as Record<string, unknown>;
    const spec = parsed.visualSpec as Record<string, unknown> | undefined;
    if (spec && typeof spec.appearance === "string" && spec.appearance.trim()) {
      const signatures = typeof spec.signatureFeatures === "string" ? spec.signatureFeatures.trim() : "";
      // 完整外貌 + 标志特征（若与 appearance 不重叠）
      if (signatures && !spec.appearance.includes(signatures)) {
        return `${spec.appearance}，${signatures}`;
      }
      return spec.appearance;
    }
    if (typeof parsed.description === "string") return parsed.description;
    if (typeof parsed.hint === "string") return parsed.hint;
    return JSON.stringify(parsed);
  } catch { return visualAnchor; }
}

function buildSheetPrompt(character: {
  name: string;
  persona?: string | null;
  visualAnchor?: string | null;
}, styleKeywords: string): string {
  const visualDesc = extractVisualDesc(character.visualAnchor);
  const faceOverride = extractFaceShapeOverride(character.visualAnchor);
  // 关键顺序：先布局 → 强制外貌锚定 → 脸型 FINAL OVERRIDE（若有）→ 画风
  const lines: string[] = [
    "professional character design reference sheet, single image",
    "LEFT THIRD: close-up portrait of the character's face (frontal view, detailed facial features, natural expression)",
    "RIGHT TWO-THIRDS: full-body character turnaround showing three views side by side — front view, side view (90-degree profile), back view",
    "all four views depict the SAME character with IDENTICAL costume, hairstyle, and color scheme",
  ];
  if (visualDesc) {
    lines.push(
      `THIS SPECIFIC CHARACTER must have the following exact appearance: ${visualDesc}`,
      "the face shape, eye shape, brow shape, nose, mouth, age range, body proportion and signature features above are mandatory and MUST be faithfully rendered",
      "do NOT replace facial features with generic idealized beauty template; preserve the character's unique bone structure and identity even if it deviates from the default style",
    );
  }
  if (faceOverride) {
    // 脸型 FINAL OVERRIDE：权重高于 appearance，显式压制冲突词
    lines.push(
      `*** FINAL FACE SHAPE OVERRIDE (highest priority, ignore conflicting words in appearance above) ***: ${faceOverride}`,
      "if the appearance description contains words like sharp/pointy/triangular/angular jaw/cheekbone that conflict with this override, the OVERRIDE wins for face/jaw/cheek shape; sharp features may remain ONLY in eye gaze or expression, NEVER in bone structure",
    );
  }
  if (character.persona) lines.push(`character personality (affects expression but NOT facial structure): ${character.persona}`);
  lines.push(
    "white background, clean studio lighting, no text or watermarks",
    styleKeywords,
    "consistent character design, high quality illustration",
  );
  return lines.join(", ");
}

function buildAppearanceLockPrompt(character: {
  name: string;
  visualAnchor?: string | null;
}, appearanceOverride?: string): string {
  const visualDesc = appearanceOverride?.trim() || extractVisualDesc(character.visualAnchor);
  if (!visualDesc) return "";
  const faceOverride = extractFaceShapeOverride(character.visualAnchor);
  const parts = [
    "CHARACTER IDENTITY LOCK (highest priority)",
    `name: ${character.name}`,
    `mandatory appearance: ${visualDesc}`,
    "the face shape, eye shape, brow, nose, mouth, age and body proportion above MUST be preserved exactly",
    "do NOT drift toward generic idealized beauty template; this character has a unique bone structure that defines their identity",
    "keep identical face, hairstyle, body type, costume colors, and signature features across all views",
  ];
  if (faceOverride) {
    parts.push(
      `*** FACE SHAPE FINAL OVERRIDE: ${faceOverride} (this overrides any conflicting sharp/pointy descriptions in appearance for bone structure; sharpness may remain in gaze only)`,
    );
  }
  return parts.join(", ");
}

function buildTunedSheetPrompt(
  character: {
    name: string;
    visualAnchor?: string | null;
  },
  prompt: string,
  lockAppearance: boolean,
  appearanceOverride?: string,
): string {
  const trimmedPrompt = prompt.trim();
  if (!lockAppearance) return trimmedPrompt;

  const visualDesc = appearanceOverride?.trim() || extractVisualDesc(character.visualAnchor);
  if (!visualDesc || trimmedPrompt.includes(visualDesc)) return trimmedPrompt;

  const appearanceLock = buildAppearanceLockPrompt(character, appearanceOverride);
  return appearanceLock ? `${trimmedPrompt}\n\n${appearanceLock}` : trimmedPrompt;
}

function buildExpressionPrompt(character: {
  name: string;
  persona?: string | null;
  visualAnchor?: string | null;
}, styleKeywords: string): string {
  const visualDesc = extractVisualDesc(character.visualAnchor);
  const faceOverride = extractFaceShapeOverride(character.visualAnchor);
  const lines: string[] = [
    "professional manga character expression sheet, single 1536x1024 horizontal image",
    "six evenly spaced portrait busts in one row, same character, same hairstyle, same costume, same color palette",
    "expressions from left to right: neutral calm, happy smile, angry glare, sad sorrow, surprised shock, cold indifferent",
    "front-facing face and upper shoulders, high facial consistency, clean white background, no text labels, no watermark",
  ];
  if (visualDesc) {
    lines.push(
      `THIS SPECIFIC CHARACTER must have the following exact appearance: ${visualDesc}`,
      "preserve the character's unique face shape, eye shape and bone structure across all six expressions; only the expression changes, NOT the underlying identity",
      "do NOT replace facial features with generic idealized beauty template",
    );
  }
  if (faceOverride) {
    lines.push(
      `*** FINAL FACE SHAPE OVERRIDE (highest priority, ignore conflicting words in appearance above) ***: ${faceOverride}`,
      "if conflicting sharp/pointy features appear in appearance above, they apply ONLY to gaze/expression, NEVER to bone structure",
    );
  }
  if (character.persona) lines.push(`personality flavor for expressions: ${character.persona}`);
  lines.push(styleKeywords, "consistent character face, reusable comic production reference");
  return lines.join(", ");
}

async function removeOldAssetFiles(charId: string, basename: string, keepExt: string): Promise<void> {
  const dir = comicCharacterDir(charId);
  for (const [ext] of IMAGE_EXTS) {
    if (ext === keepExt) continue;
    await fs.unlink(path.join(dir, `${basename}.${ext}`)).catch(() => {});
  }
}

async function resolveAssetFile(
  charId: string,
  basename: string,
): Promise<{ filePath: string; mimeType: string } | null> {
  const dir = comicCharacterDir(charId);
  for (const [ext, mimeType] of IMAGE_EXTS) {
    const filePath = path.join(dir, `${basename}.${ext}`);
    try { await fs.access(filePath); return { filePath, mimeType }; } catch { /* try next */ }
  }
  return null;
}

async function ensureDerivedDir(charId: string): Promise<string> {
  const dir = path.join(comicCharacterDir(charId), "derived");
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

async function isDerivedFresh(sourcePath: string, derivedPath: string): Promise<boolean> {
  try {
    const [sourceStat, derivedStat] = await Promise.all([fs.stat(sourcePath), fs.stat(derivedPath)]);
    return derivedStat.mtimeMs >= sourceStat.mtimeMs;
  } catch {
    return false;
  }
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class ComicCharacterImageService {
  async generateCharacterSheet(
    charId: string,
    provider: LLMProvider = DEFAULT_PROVIDER,
    options: GenerateCharacterSheetOptions = {},
  ): Promise<CharacterSheetData> {
    const character = await prisma.comicCharacter.findUnique({
      where: { id: charId },
      include: { project: { select: { stylePreset: true } } },
    });
    if (!character) throw new AppError(`未找到漫画角色：${charId}`, 404);
    if (!isImageProviderSupported(provider)) throw new AppError(`图片 Provider ${provider} 暂不支持。`, 400);

    const styleKeywords = resolveComicStyleKeywords(character.project.stylePreset);
    const existing = safeJsonParse<CharacterSheetData>(character.sheetData, { status: "idle" });
    const history: CharacterSheetHistoryItem[] = Array.isArray(existing.history) ? existing.history : [];

    // 归档当前设计稿
    const archived = await this.archiveCurrent(charId, existing);
    const nextHistory = archived ? [...history, archived].slice(-5) : history;
    const nextVersion = existing.status === "done" ? readVersion(existing) + 1 : Math.max(1, readVersion(existing) || 1);

    const generatingData: CharacterSheetData = {
      ...existing,
      status: "generating",
      provider,
      version: nextVersion,
      history: nextHistory,
    };
    await prisma.comicCharacter.update({ where: { id: charId }, data: { sheetData: JSON.stringify(generatingData) } });

    try {
      const model = await resolveImageModel(provider);
      const prompt = options.prompt?.trim()
        ? buildTunedSheetPrompt(character, options.prompt, options.lockAppearance !== false, options.appearanceOverride)
        : buildSheetPrompt(character, styleKeywords);
      const currentReference = options.useCurrentImageAsReference
        ? await this.resolveSheetFile(charId)
        : null;

      const result = await generateImagesByProvider({
        sceneType: "character",
        provider,
        model,
        prompt,
        size: "1536x1024",
        count: 1,
        refImagePaths: currentReference ? [currentReference.filePath] : undefined,
      });

      const imageUrl = result.images[0]?.url;
      if (!imageUrl) throw new Error("图片生成结果为空。");

      const ext = inferExtension(imageUrl);
      const localPath = path.join(comicCharacterDir(charId), `character-sheet.${ext}`);
      await saveImageToDisk(imageUrl, localPath);
      await removeOldAssetFiles(charId, "character-sheet", ext);

      const doneData: CharacterSheetData = {
        ...existing,
        status: "done",
        version: nextVersion,
        url: sheetUrl(charId),
        prompt,
        provider,
        generatedAt: new Date().toISOString(),
        history: nextHistory,
      };
      await prisma.comicCharacter.update({ where: { id: charId }, data: { sheetData: JSON.stringify(doneData) } });
      return doneData;
    } catch (err) {
      const errorData: CharacterSheetData = {
        ...existing,
        status: "error",
        provider,
        version: nextVersion,
        error: err instanceof Error ? err.message : String(err),
        history: nextHistory,
      };
      await prisma.comicCharacter.update({ where: { id: charId }, data: { sheetData: JSON.stringify(errorData) } });
      throw err;
    }
  }

  async getSheetData(charId: string): Promise<CharacterSheetData> {
    const character = await prisma.comicCharacter.findUnique({ where: { id: charId }, select: { sheetData: true } });
    if (!character) throw new AppError(`未找到漫画角色：${charId}`, 404);
    return safeJsonParse<CharacterSheetData>(character.sheetData, { status: "idle" });
  }

  async resolveSheetFile(charId: string): Promise<{ filePath: string; mimeType: string } | null> {
    return resolveAssetFile(charId, "character-sheet");
  }

  async generateExpressionSheet(
    charId: string,
    provider: LLMProvider = DEFAULT_PROVIDER,
  ): Promise<CharacterExpressionData> {
    const character = await prisma.comicCharacter.findUnique({
      where: { id: charId },
      include: { project: { select: { stylePreset: true } } },
    });
    if (!character) throw new AppError(`未找到漫画角色：${charId}`, 404);
    if (!isImageProviderSupported(provider)) throw new AppError(`图片 Provider ${provider} 暂不支持。`, 400);

    const styleKeywords = resolveComicStyleKeywords(character.project.stylePreset);
    const existing = safeJsonParse<CharacterSheetData>(character.sheetData, { status: "idle" });
    const existingExpression = existing.assets?.expression;
    const nextVersion = existingExpression?.status === "done"
      ? readExpressionVersion(existingExpression) + 1
      : Math.max(1, readExpressionVersion(existingExpression) || 1);

    const generatingExpression: CharacterExpressionData = { status: "generating", provider, version: nextVersion };
    await prisma.comicCharacter.update({
      where: { id: charId },
      data: {
        sheetData: JSON.stringify({
          ...existing,
          status: existing.status ?? "idle",
          assets: { ...(existing.assets ?? {}), expression: generatingExpression },
        }),
      },
    });

    try {
      const model = await resolveImageModel(provider);
      const prompt = buildExpressionPrompt(character, styleKeywords);
      const result = await generateImagesByProvider({
        sceneType: "character",
        provider,
        model,
        prompt,
        size: "1536x1024",
        count: 1,
      });

      const imageUrl = result.images[0]?.url;
      if (!imageUrl) throw new Error("图片生成结果为空。");

      const ext = inferExtension(imageUrl);
      const localPath = path.join(comicCharacterDir(charId), `character-expression.${ext}`);
      await saveImageToDisk(imageUrl, localPath);
      await removeOldAssetFiles(charId, "character-expression", ext);

      const doneExpression: CharacterExpressionData = {
        status: "done",
        version: nextVersion,
        url: expressionUrl(charId),
        prompt,
        provider,
        generatedAt: new Date().toISOString(),
      };
      const latest = await prisma.comicCharacter.findUnique({ where: { id: charId }, select: { sheetData: true } });
      const latestData = safeJsonParse<CharacterSheetData>(latest?.sheetData, existing);
      await prisma.comicCharacter.update({
        where: { id: charId },
        data: {
          sheetData: JSON.stringify({
            ...latestData,
            status: latestData.status ?? "idle",
            assets: { ...(latestData.assets ?? {}), expression: doneExpression },
          }),
        },
      });
      return doneExpression;
    } catch (err) {
      const errorExpression: CharacterExpressionData = {
        status: "error",
        provider,
        version: nextVersion,
        error: err instanceof Error ? err.message : String(err),
      };
      const latest = await prisma.comicCharacter.findUnique({ where: { id: charId }, select: { sheetData: true } });
      const latestData = safeJsonParse<CharacterSheetData>(latest?.sheetData, existing);
      await prisma.comicCharacter.update({
        where: { id: charId },
        data: {
          sheetData: JSON.stringify({
            ...latestData,
            status: latestData.status ?? "idle",
            assets: { ...(latestData.assets ?? {}), expression: errorExpression },
          }),
        },
      });
      throw err;
    }
  }

  async getExpressionData(charId: string): Promise<CharacterExpressionData> {
    const character = await prisma.comicCharacter.findUnique({ where: { id: charId }, select: { sheetData: true } });
    if (!character) throw new AppError(`未找到漫画角色：${charId}`, 404);
    const data = safeJsonParse<CharacterSheetData>(character.sheetData, { status: "idle" });
    return data.assets?.expression ?? { status: "idle" };
  }

  async resolveExpressionFile(charId: string): Promise<{ filePath: string; mimeType: string } | null> {
    return resolveAssetFile(charId, "character-expression");
  }

  async resolveFaceRegionFile(charId: string): Promise<{ filePath: string; mimeType: string } | null> {
    const sheet = await this.resolveSheetFile(charId);
    if (!sheet) return null;
    const derivedDir = await ensureDerivedDir(charId);
    const facePath = path.join(derivedDir, "character-face.png");
    if (!(await isDerivedFresh(sheet.filePath, facePath))) {
      const meta = await sharp(sheet.filePath).metadata();
      if (!meta.width || !meta.height) return null;
      const width = Math.max(1, Math.floor(meta.width / 3));
      await sharp(sheet.filePath)
        .extract({ left: 0, top: 0, width, height: meta.height })
        .png()
        .toFile(facePath);
    }
    return { filePath: facePath, mimeType: "image/png" };
  }

  async resolveExpressionRegionFile(
    charId: string,
    expression: CharacterExpressionId,
  ): Promise<{ filePath: string; mimeType: string } | null> {
    const expressionSheet = await this.resolveExpressionFile(charId);
    if (!expressionSheet) return null;
    const expressionIndex = EXPRESSION_ORDER.indexOf(expression);
    if (expressionIndex < 0) return null;
    const derivedDir = await ensureDerivedDir(charId);
    const regionPath = path.join(derivedDir, `character-expression-${expression}.png`);
    if (!(await isDerivedFresh(expressionSheet.filePath, regionPath))) {
      const meta = await sharp(expressionSheet.filePath).metadata();
      if (!meta.width || !meta.height) return null;
      const slotWidth = Math.max(1, Math.floor(meta.width / EXPRESSION_ORDER.length));
      const left = expressionIndex * slotWidth;
      const width = expressionIndex === EXPRESSION_ORDER.length - 1
        ? meta.width - left
        : slotWidth;
      await sharp(expressionSheet.filePath)
        .extract({ left, top: 0, width: Math.max(1, width), height: meta.height })
        .png()
        .toFile(regionPath);
    }
    return { filePath: regionPath, mimeType: "image/png" };
  }

  async resolveArchivedSheetFile(charId: string, version: number): Promise<{ filePath: string; mimeType: string } | null> {
    const dir = comicCharacterDir(charId);
    for (const [ext, mimeType] of IMAGE_EXTS) {
      const filePath = path.join(dir, `character-sheet.v${version}.${ext}`);
      try { await fs.access(filePath); return { filePath, mimeType }; } catch { /* try next */ }
    }
    return null;
  }

  private async archiveCurrent(charId: string, data: CharacterSheetData): Promise<CharacterSheetHistoryItem | null> {
    if (data.status !== "done") return null;
    const version = readVersion(data);
    if (!version) return null;
    const resolved = await this.resolveSheetFile(charId);
    const item: CharacterSheetHistoryItem = { version, prompt: data.prompt, provider: data.provider, generatedAt: data.generatedAt };
    if (!resolved) return item;
    const ext = path.extname(resolved.filePath).replace(".", "").toLowerCase() || "png";
    const archivePath = path.join(comicCharacterDir(charId), `character-sheet.v${version}.${ext}`);
    await fs.copyFile(resolved.filePath, archivePath);
    return { ...item, url: archivedSheetUrl(charId, version) };
  }
}

export function isCharacterExpressionId(value: unknown): value is CharacterExpressionId {
  return typeof value === "string" && (EXPRESSION_ORDER as string[]).includes(value);
}

export function describeCharacterExpression(value: CharacterExpressionId): string {
  return EXPRESSION_LABELS[value];
}

export const comicCharacterImageService = new ComicCharacterImageService();
