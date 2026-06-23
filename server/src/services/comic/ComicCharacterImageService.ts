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
  filterImageGenerationReferences,
  runImageGeneration,
  safeJsonParse,
  type ImageTargetAdapter,
} from "../image/runtime";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { buildGenderLockPrompt, resolveComicStyleKeywords } from "./comicStylePrompt";

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
  referenceImages?: import("../image/runtime").GeneratedReferenceImageMeta[];
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
  gender?: string | null;
  persona?: string | null;
  visualAnchor?: string | null;
}, styleKeywords: string): string {
  const visualDesc = extractVisualDesc(character.visualAnchor);
  const faceOverride = extractFaceShapeOverride(character.visualAnchor);
  const genderLock = buildGenderLockPrompt(character.gender, character.name);
  // 关键顺序：性别锁 → 布局 → 强制外貌锚定 → 脸型 FINAL OVERRIDE（若有）→ 画风
  const lines: string[] = [];
  if (genderLock) lines.push(genderLock);
  lines.push(
    "professional character design reference sheet, single image",
    "LEFT THIRD: close-up portrait of the character's face (frontal view, detailed facial features, natural expression)",
    "RIGHT TWO-THIRDS: full-body character turnaround showing three views side by side — front view, side view (90-degree profile), back view",
    "all four views depict the SAME character with IDENTICAL costume, hairstyle, and color scheme",
  );
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
  gender?: string | null;
  visualAnchor?: string | null;
}, appearanceOverride?: string): string {
  const visualDesc = appearanceOverride?.trim() || extractVisualDesc(character.visualAnchor);
  if (!visualDesc) return "";
  const faceOverride = extractFaceShapeOverride(character.visualAnchor);
  const genderLock = buildGenderLockPrompt(character.gender, character.name);
  const parts = [
    "CHARACTER IDENTITY LOCK (highest priority)",
    `name: ${character.name}`,
    `mandatory appearance: ${visualDesc}`,
  ];
  if (genderLock) parts.push(genderLock);
  parts.push(
    "the face shape, eye shape, brow, nose, mouth, age and body proportion above MUST be preserved exactly",
    "do NOT drift toward generic idealized beauty template; this character has a unique bone structure that defines their identity",
    "keep identical face, hairstyle, body type, costume colors, and signature features across all views",
  );
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
  gender?: string | null;
  persona?: string | null;
  visualAnchor?: string | null;
}, styleKeywords: string): string {
  const visualDesc = extractVisualDesc(character.visualAnchor);
  const faceOverride = extractFaceShapeOverride(character.visualAnchor);
  const genderLock = buildGenderLockPrompt(character.gender, character.name);
  const lines: string[] = [];
  if (genderLock) lines.push(genderLock);
  lines.push(
    "professional manga character expression sheet, single 1536x1024 horizontal image",
    "six evenly spaced portrait busts in one row, same character, same hairstyle, same costume, same color palette",
    "expressions from left to right: neutral calm, happy smile, angry glare, sad sorrow, surprised shock, cold indifferent",
    "front-facing face and upper shoulders, high facial consistency, clean white background, no text labels, no watermark",
  );
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
  private async buildCharacterSheetGenerationContext(
    charId: string,
    options: GenerateCharacterSheetOptions = {},
  ) {
    const character = await prisma.comicCharacter.findUnique({
      where: { id: charId },
      include: { project: { select: { stylePreset: true } } },
    });
    if (!character) throw new AppError(`未找到漫画角色：${charId}`, 404);

    const styleKeywords = resolveComicStyleKeywords(character.project.stylePreset);
    const prompt = options.prompt?.trim()
      ? buildTunedSheetPrompt(character, options.prompt, options.lockAppearance !== false, options.appearanceOverride)
      : buildSheetPrompt(character, styleKeywords);
    const currentReference = options.useCurrentImageAsReference
      ? await this.resolveSheetFile(charId)
      : null;

    const archiveCurrentSheet = async (current: CharacterSheetData): Promise<CharacterSheetHistoryItem | null> => {
      if (current.status !== "done") return null;
      const version = readVersion(current);
      if (!version) return null;
      const resolved = await this.resolveSheetFile(charId);
      const item: CharacterSheetHistoryItem = {
        version,
        prompt: current.prompt,
        provider: current.provider,
        generatedAt: current.generatedAt,
      };
      if (!resolved) return item;
      const ext = path.extname(resolved.filePath).replace(".", "").toLowerCase() || "png";
      const archivePath = path.join(comicCharacterDir(charId), `character-sheet.v${version}.${ext}`);
      await fs.copyFile(resolved.filePath, archivePath);
      return { ...item, url: archivedSheetUrl(charId, version) };
    };

    const adapter: ImageTargetAdapter<CharacterSheetData> = {
      kind: `comic.character.sheet:${charId}`,
      loadState: async () => safeJsonParse<CharacterSheetData>(character.sheetData, { status: "idle" }),
      saveState: async (next) => {
        await prisma.comicCharacter.update({ where: { id: charId }, data: { sheetData: JSON.stringify(next) } });
      },
      diskPath: (ext) => path.join(comicCharacterDir(charId), `character-sheet.${ext}`),
      publicUrl: () => sheetUrl(charId),
      cleanupOtherExts: (keepExt) => removeOldAssetFiles(charId, "character-sheet", keepExt),
      versioning: {
        enabled: true,
        maxHistory: 5,
        archiveCurrent: archiveCurrentSheet,
      },
    };

    const referenceImages: import("../image/runtime").GeneratedReferenceImageMeta[] = currentReference
      ? [{ kind: "character_sheet", label: `${character.name} · 当前三视图`, url: sheetUrl(charId) }]
      : [];

    return {
      adapter,
      prompt,
      refImagePaths: currentReference ? [currentReference.filePath] : undefined,
      referenceImages,
      size: "1536x1024" as const,
      title: `${options.prompt?.trim() ? "微调" : "生成"}三视图：${character.name}`,
    };
  }

  async prepareCharacterSheet(
    charId: string,
    provider: LLMProvider = DEFAULT_PROVIDER,
    options: GenerateCharacterSheetOptions = {},
  ): Promise<import("../image/runtime").ImageGenerationPreview> {
    const ctx = await this.buildCharacterSheetGenerationContext(charId, options);
    return {
      kind: ctx.adapter.kind,
      title: ctx.title,
      prompt: ctx.prompt,
      referenceImages: ctx.referenceImages,
      provider,
      size: ctx.size,
    };
  }

  async generateCharacterSheet(
    charId: string,
    provider: LLMProvider = DEFAULT_PROVIDER,
    options: GenerateCharacterSheetOptions = {},
    overrides?: import("../image/runtime").ImageGenerationOverrides,
  ): Promise<CharacterSheetData> {
    const ctx = await this.buildCharacterSheetGenerationContext(charId, options);
    const refs = filterImageGenerationReferences({
      refImagePaths: ctx.refImagePaths,
      referenceImages: ctx.referenceImages,
      excludedReferenceImageUrls: overrides?.excludedReferenceImageUrls,
    });
    return runImageGeneration(ctx.adapter, {
      provider: overrides?.providerOverride ?? provider,
      prompt: overrides?.promptOverride ?? ctx.prompt,
      size: overrides?.sizeOverride ?? ctx.size,
      sceneType: "character",
      refImagePaths: refs.refImagePaths,
      referenceImages: refs.referenceImages && refs.referenceImages.length > 0 ? refs.referenceImages : undefined,
    });
  }

  async getSheetData(charId: string): Promise<CharacterSheetData> {
    const character = await prisma.comicCharacter.findUnique({ where: { id: charId }, select: { sheetData: true } });
    if (!character) throw new AppError(`未找到漫画角色：${charId}`, 404);
    return safeJsonParse<CharacterSheetData>(character.sheetData, { status: "idle" });
  }

  async resolveSheetFile(charId: string): Promise<{ filePath: string; mimeType: string } | null> {
    return resolveAssetFile(charId, "character-sheet");
  }

  private async buildExpressionSheetGenerationContext(
    charId: string,
  ) {
    const character = await prisma.comicCharacter.findUnique({
      where: { id: charId },
      include: { project: { select: { stylePreset: true } } },
    });
    if (!character) throw new AppError(`未找到漫画角色：${charId}`, 404);

    const styleKeywords = resolveComicStyleKeywords(character.project.stylePreset);
    const prompt = buildExpressionPrompt(character, styleKeywords);
    const sheetReference = await this.resolveSheetFile(charId);
    const referenceImages: import("../image/runtime").GeneratedReferenceImageMeta[] = sheetReference
      ? [{ kind: "character_sheet", label: `${character.name} · 三视图`, url: sheetUrl(charId) }]
      : [];

    // Expression 状态嵌在 sheetData.assets.expression；adapter 负责读写嵌套位置。
    const adapter: ImageTargetAdapter<CharacterExpressionData> = {
      kind: `comic.character.expression:${charId}`,
      loadState: async () => {
        const latest = await prisma.comicCharacter.findUnique({ where: { id: charId }, select: { sheetData: true } });
        const sheet = safeJsonParse<CharacterSheetData>(latest?.sheetData, { status: "idle" });
        return sheet.assets?.expression ?? { status: "idle" };
      },
      saveState: async (next) => {
        // 每次写入都重新读最新 sheetData 再合并，避免覆盖三视图状态
        const latest = await prisma.comicCharacter.findUnique({ where: { id: charId }, select: { sheetData: true } });
        const sheet = safeJsonParse<CharacterSheetData>(latest?.sheetData, { status: "idle" });
        const merged: CharacterSheetData = {
          ...sheet,
          status: sheet.status ?? "idle",
          assets: { ...(sheet.assets ?? {}), expression: next },
        };
        await prisma.comicCharacter.update({ where: { id: charId }, data: { sheetData: JSON.stringify(merged) } });
      },
      diskPath: (ext) => path.join(comicCharacterDir(charId), `character-expression.${ext}`),
      publicUrl: () => expressionUrl(charId),
      cleanupOtherExts: (keepExt) => removeOldAssetFiles(charId, "character-expression", keepExt),
    };

    return {
      adapter,
      prompt,
      refImagePaths: sheetReference ? [sheetReference.filePath] : undefined,
      referenceImages,
      size: "1536x1024" as const,
      title: `生成表情稿：${character.name}`,
    };
  }

  async prepareExpressionSheet(
    charId: string,
    provider: LLMProvider = DEFAULT_PROVIDER,
  ): Promise<import("../image/runtime").ImageGenerationPreview> {
    const ctx = await this.buildExpressionSheetGenerationContext(charId);
    return {
      kind: ctx.adapter.kind,
      title: ctx.title,
      prompt: ctx.prompt,
      referenceImages: ctx.referenceImages,
      provider,
      size: ctx.size,
    };
  }

  async generateExpressionSheet(
    charId: string,
    provider: LLMProvider = DEFAULT_PROVIDER,
    overrides?: import("../image/runtime").ImageGenerationOverrides,
  ): Promise<CharacterExpressionData> {
    const ctx = await this.buildExpressionSheetGenerationContext(charId);
    const refs = filterImageGenerationReferences({
      refImagePaths: ctx.refImagePaths,
      referenceImages: ctx.referenceImages,
      excludedReferenceImageUrls: overrides?.excludedReferenceImageUrls,
    });
    return runImageGeneration(ctx.adapter, {
      provider: overrides?.providerOverride ?? provider,
      prompt: overrides?.promptOverride ?? ctx.prompt,
      size: overrides?.sizeOverride ?? ctx.size,
      sceneType: "character",
      refImagePaths: refs.refImagePaths,
      referenceImages: refs.referenceImages && refs.referenceImages.length > 0 ? refs.referenceImages : undefined,
    });
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
