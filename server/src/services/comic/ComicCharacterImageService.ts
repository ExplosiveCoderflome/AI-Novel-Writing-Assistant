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

function extractVisualDesc(visualAnchor: string | null | undefined): string {
  if (!visualAnchor?.trim()) return "";
  try {
    const parsed = JSON.parse(visualAnchor) as Record<string, unknown>;
    if (typeof parsed.description === "string") return parsed.description;
    if (typeof parsed.hint === "string") return parsed.hint;
    return JSON.stringify(parsed);
  } catch { return visualAnchor; }
}

function buildSheetPrompt(character: {
  name: string;
  persona?: string | null;
  visualAnchor?: string | null;
}): string {
  const visualDesc = extractVisualDesc(character.visualAnchor);
  const lines: string[] = [
    "professional character design reference sheet, single image",
    "LEFT THIRD: close-up portrait of the character's face (frontal view, detailed facial features, natural expression)",
    "RIGHT TWO-THIRDS: full-body character turnaround showing three views side by side — front view, side view (90-degree profile), back view",
    "all four views depict the SAME character with IDENTICAL costume, hairstyle, and color scheme",
    "white background, clean studio lighting, no text or watermarks",
    "manga/webtoon illustration style, clean line art, vibrant colors",
  ];
  if (character.persona) lines.push(`character personality: ${character.persona}`);
  if (visualDesc) lines.push(`appearance: ${visualDesc}`);
  lines.push("consistent character design, high quality illustration");
  return lines.join(", ");
}

function buildExpressionPrompt(character: {
  name: string;
  persona?: string | null;
  visualAnchor?: string | null;
}): string {
  const visualDesc = extractVisualDesc(character.visualAnchor);
  const lines: string[] = [
    "professional manga character expression sheet, single 1536x1024 horizontal image",
    "six evenly spaced portrait busts in one row, same character, same hairstyle, same costume, same color palette",
    "expressions from left to right: neutral calm, happy smile, angry glare, sad sorrow, surprised shock, cold indifferent",
    "front-facing face and upper shoulders, high facial consistency, clean white background, no text labels, no watermark",
    "manga/webtoon illustration style, clean line art, vibrant colors",
  ];
  if (character.persona) lines.push(`character personality: ${character.persona}`);
  if (visualDesc) lines.push(`appearance: ${visualDesc}`);
  lines.push("consistent character face, reusable comic production reference");
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
  ): Promise<CharacterSheetData> {
    const character = await prisma.comicCharacter.findUnique({ where: { id: charId } });
    if (!character) throw new AppError(`未找到漫画角色：${charId}`, 404);
    if (!isImageProviderSupported(provider)) throw new AppError(`图片 Provider ${provider} 暂不支持。`, 400);

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
      const prompt = buildSheetPrompt(character);

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
    const character = await prisma.comicCharacter.findUnique({ where: { id: charId } });
    if (!character) throw new AppError(`未找到漫画角色：${charId}`, 404);
    if (!isImageProviderSupported(provider)) throw new AppError(`图片 Provider ${provider} 暂不支持。`, 400);

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
      const prompt = buildExpressionPrompt(character);
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
