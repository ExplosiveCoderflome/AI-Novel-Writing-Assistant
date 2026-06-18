/**
 * ComicCharacterAssetService
 * 角色可选视觉资产的 CRUD + AI 生成 + 上传。
 *
 * 资产类型：costume | weapon | item | vehicle | ability | other
 * imageData JSON：{ status, url, prompt, provider, generatedAt, error, origin:"generated"|"uploaded" }
 * 图片存储：generated-images/comic-character-assets/{assetId}/asset.{ext}
 * HTTP 端点：/api/comic/character-assets/:assetId/image
 */
import fs from "fs/promises";
import path from "path";

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

export type AssetImageStatus = "idle" | "generating" | "done" | "error";
export type CharacterAssetType = "costume" | "weapon" | "item" | "vehicle" | "ability" | "other";

export interface AssetImageData {
  status: AssetImageStatus;
  url?: string;
  prompt?: string;
  provider?: string;
  generatedAt?: string;
  error?: string;
  origin?: "generated" | "uploaded";
}

export interface CreateAssetInput {
  characterId: string;
  projectId: string;
  assetType: CharacterAssetType;
  name: string;
  description?: string;
  sortOrder?: number;
}

export interface UpdateAssetInput {
  name?: string;
  description?: string;
  sortOrder?: number;
  assetType?: CharacterAssetType;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ASSETS_DIR = "comic-character-assets";
const DEFAULT_PROVIDER: LLMProvider = "openai";
const IMAGE_EXTS: Array<[string, string]> = [
  ["png", "image/png"],
  ["jpg", "image/jpeg"],
  ["webp", "image/webp"],
];

function assetDir(assetId: string): string {
  return path.join(resolveGeneratedImagesRoot(), ASSETS_DIR, assetId);
}

export function assetImageUrl(assetId: string): string {
  return `/api/comic/character-assets/${assetId}/image`;
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

/** 找已存盘的资产图路径 */
export async function resolveAssetFile(assetId: string): Promise<{ filePath: string; mimeType: string } | null> {
  const dir = assetDir(assetId);
  for (const [ext, mimeType] of IMAGE_EXTS) {
    const candidate = path.join(dir, `asset.${ext}`);
    try {
      await fs.access(candidate);
      return { filePath: candidate, mimeType };
    } catch { /* 继续 */ }
  }
  return null;
}

/** 从三视图 sheetData 构建参考图路径列表 */
async function resolveSheetRefPaths(characterId: string): Promise<string[]> {
  const char = await prisma.comicCharacter.findUnique({
    where: { id: characterId },
    select: { sheetData: true },
  });
  if (!char) return [];
  const sheet = safeJsonParse<{ status?: string }>(char.sheetData, {});
  if (sheet.status !== "done") return [];

  // 复用 ComicCharacterImageService 的存储规范
  const sheetsRoot = path.join(resolveGeneratedImagesRoot(), "comic-characters", characterId);
  const IMAGE_EXTS_LOCAL: Array<[string]> = [["png"], ["jpg"], ["webp"]];
  for (const [ext] of IMAGE_EXTS_LOCAL) {
    const candidate = path.join(sheetsRoot, `character-sheet.${ext}`);
    try {
      await fs.access(candidate);
      return [candidate];
    } catch { /* 继续 */ }
  }
  return [];
}

function buildAssetPrompt(params: {
  assetType: CharacterAssetType;
  name: string;
  description?: string;
  characterName: string;
  characterVisualAnchor?: string | null;
  isRefAvailable: boolean;
  styleKeywords: string;
}): string {
  const { assetType, name, description, characterName, characterVisualAnchor, isRefAvailable, styleKeywords } = params;

  const typeLabels: Record<CharacterAssetType, string> = {
    costume: "costume design reference sheet",
    weapon: "weapon design reference sheet",
    item: "item / prop design reference sheet",
    vehicle: "vehicle design reference sheet",
    ability: "ability / skill visual effect design reference sheet",
    other: "visual asset design reference sheet",
  };

  const lines: string[] = [
    `professional ${typeLabels[assetType]}`,
    `for character: ${characterName}`,
    `asset name: ${name}`,
  ];

  if (description) lines.push(`design description: ${description}`);

  if (assetType === "costume") {
    lines.push(
      "show full-body front view, side view, and back view of the costume",
      "consistent fabric details, color palette swatch in corner",
      "white background, clean studio lighting",
    );
  } else if (assetType === "weapon") {
    lines.push(
      "show the weapon from multiple angles: front, side, detail close-up",
      "precise proportions, material texture visible",
      "white background, clean studio lighting",
    );
  } else {
    lines.push(
      "show the asset from front and at least one additional angle",
      "white background, clean studio lighting",
    );
  }

  if (isRefAvailable) {
    lines.push("use the provided character reference sheet to match style and color palette");
  }

  if (characterVisualAnchor) {
    try {
      const parsed = JSON.parse(characterVisualAnchor) as Record<string, unknown>;
      const desc = typeof parsed.description === "string" ? parsed.description : "";
      if (desc) lines.push(`character style hint: ${desc}`);
    } catch { /* ignore */ }
  }

  lines.push(`${styleKeywords}, high quality`);
  return lines.join(", ");
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class ComicCharacterAssetService {
  // ── CRUD ──────────────────────────────────────────────────────────────────

  async createAsset(input: CreateAssetInput) {
    const char = await prisma.comicCharacter.findUnique({
      where: { id: input.characterId },
      select: { id: true, projectId: true },
    });
    if (!char) throw new AppError(`角色不存在：${input.characterId}`, 404);
    if (char.projectId !== input.projectId) throw new AppError("角色与项目不匹配", 400);

    return prisma.comicCharacterAsset.create({
      data: {
        characterId: input.characterId,
        projectId: input.projectId,
        assetType: input.assetType,
        name: input.name.trim(),
        description: input.description?.trim() ?? null,
        sortOrder: input.sortOrder ?? 0,
        imageData: JSON.stringify({ status: "idle" } satisfies AssetImageData),
      },
    });
  }

  async listAssets(characterId: string) {
    return prisma.comicCharacterAsset.findMany({
      where: { characterId },
      orderBy: [{ assetType: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    });
  }

  async listByProject(projectId: string) {
    return prisma.comicCharacterAsset.findMany({
      where: { projectId },
      orderBy: [{ characterId: "asc" }, { assetType: "asc" }, { sortOrder: "asc" }],
    });
  }

  async getAsset(assetId: string) {
    const asset = await prisma.comicCharacterAsset.findUnique({ where: { id: assetId } });
    if (!asset) throw new AppError(`资产不存在：${assetId}`, 404);
    return asset;
  }

  async updateAsset(assetId: string, input: UpdateAssetInput) {
    await this.getAsset(assetId);
    return prisma.comicCharacterAsset.update({
      where: { id: assetId },
      data: {
        ...(input.name !== undefined && { name: input.name.trim() }),
        ...(input.description !== undefined && { description: input.description.trim() || null }),
        ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
        ...(input.assetType !== undefined && { assetType: input.assetType }),
      },
    });
  }

  async deleteAsset(assetId: string) {
    await this.getAsset(assetId);
    // 清理磁盘
    try {
      await fs.rm(assetDir(assetId), { recursive: true, force: true });
    } catch { /* 忽略：文件可能从未生成 */ }
    return prisma.comicCharacterAsset.delete({ where: { id: assetId } });
  }

  // ── 图片上传 ──────────────────────────────────────────────────────────────

  async uploadAssetImage(assetId: string, fileBuffer: Buffer, mimeType: string): Promise<{ url: string }> {
    const asset = await this.getAsset(assetId);
    const ext = mimeType === "image/jpeg" ? "jpg" : mimeType === "image/webp" ? "webp" : "png";
    const dir = assetDir(assetId);
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, `asset.${ext}`);
    await fs.writeFile(filePath, fileBuffer);

    const url = assetImageUrl(assetId);
    const imageData: AssetImageData = {
      status: "done",
      url,
      origin: "uploaded",
      generatedAt: new Date().toISOString(),
    };
    await prisma.comicCharacterAsset.update({
      where: { id: assetId },
      data: { imageData: JSON.stringify(imageData) },
    });
    return { url };
  }

  // ── AI 生成 ───────────────────────────────────────────────────────────────

  async generateAssetImage(assetId: string, provider?: string): Promise<void> {
    const asset = await prisma.comicCharacterAsset.findUnique({
      where: { id: assetId },
      include: {
        character: { select: { id: true, name: true, visualAnchor: true, sheetData: true } },
        project: { select: { stylePreset: true } },
      },
    });
    if (!asset) throw new AppError(`资产不存在：${assetId}`, 404);

    const llmProvider = (provider ?? DEFAULT_PROVIDER) as LLMProvider;
    if (!isImageProviderSupported(llmProvider)) {
      throw new AppError(`图片 Provider ${llmProvider} 暂不支持。`, 400);
    }

    // 三视图参考图（已完成才用）
    const refImagePaths = await resolveSheetRefPaths(asset.characterId);

    // 标记 generating
    const generatingData: AssetImageData = { status: "generating", provider: llmProvider };
    await prisma.comicCharacterAsset.update({
      where: { id: assetId },
      data: { imageData: JSON.stringify(generatingData) },
    });

    try {
      const model = await resolveImageModel(llmProvider);
      const prompt = buildAssetPrompt({
        assetType: asset.assetType as CharacterAssetType,
        name: asset.name,
        description: asset.description ?? undefined,
        characterName: asset.character.name,
        characterVisualAnchor: asset.character.visualAnchor,
        isRefAvailable: refImagePaths.length > 0,
        styleKeywords: resolveComicStyleKeywords(asset.project.stylePreset),
      });

      console.log(`[comic.asset] generating asset=${assetId} type=${asset.assetType} name=${asset.name}`);

      const result = await generateImagesByProvider({
        sceneType: "chapter_illustration",
        provider: llmProvider,
        model,
        prompt,
        refImagePaths: refImagePaths,
        size: "1024x1024",
        count: 1,
      });

      const rawUrl = result.images?.[0]?.url;
      if (!rawUrl || typeof rawUrl !== "string") {
        throw new Error("生图结果无效：未返回图片 URL");
      }

      const ext = inferExtension(rawUrl);
      const filePath = path.join(assetDir(assetId), `asset.${ext}`);
      await saveImageToDisk(rawUrl, filePath);

      const url = assetImageUrl(assetId);
      const doneData: AssetImageData = {
        status: "done",
        url,
        prompt,
        provider: llmProvider,
        generatedAt: new Date().toISOString(),
        origin: "generated",
      };
      await prisma.comicCharacterAsset.update({
        where: { id: assetId },
        data: { imageData: JSON.stringify(doneData) },
      });
    } catch (err) {
      const errData: AssetImageData = {
        status: "error",
        provider: llmProvider,
        error: err instanceof Error ? err.message : String(err),
      };
      await prisma.comicCharacterAsset.update({
        where: { id: assetId },
        data: { imageData: JSON.stringify(errData) },
      });
      throw err;
    }
  }

  // ── 文件服务 ──────────────────────────────────────────────────────────────

  async serveAssetImage(assetId: string): Promise<{ filePath: string; mimeType: string }> {
    const resolved = await resolveAssetFile(assetId);
    if (!resolved) throw new AppError(`资产图片未找到：${assetId}`, 404);
    return resolved;
  }
}

export const comicCharacterAssetService = new ComicCharacterAssetService();
