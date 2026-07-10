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
import { filterImageGenerationReferences, runImageGeneration, safeJsonParse } from "../image/runtime";
import { buildGenderLockPrompt, resolveComicStyleKeywords } from "./comicStylePrompt";

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
  characterGender?: string | null;
  characterVisualAnchor?: string | null;
  isRefAvailable: boolean;
  styleKeywords: string;
}): string {
  const { assetType, name, description, characterName, characterGender, characterVisualAnchor, isRefAvailable, styleKeywords } = params;
  const genderLock = buildGenderLockPrompt(characterGender, characterName);

  const typeLabels: Record<CharacterAssetType, string> = {
    costume: "costume design reference sheet",
    weapon: "weapon design reference sheet",
    item: "item / prop design reference sheet",
    vehicle: "vehicle design reference sheet",
    ability: "ability / skill visual effect design reference sheet",
    other: "visual asset design reference sheet",
  };

  const lines: string[] = [];
  if (genderLock) lines.push(genderLock);
  lines.push(
    `professional ${typeLabels[assetType]}`,
    `for character: ${characterName}`,
    `asset name: ${name}`,
  );

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

  // ── AI 生成（prepare / generate 共享 buildContext） ──────────────────────

  private async buildAssetGenerationContext(assetId: string) {
    const asset = await prisma.comicCharacterAsset.findUnique({
      where: { id: assetId },
      include: {
        character: { select: { id: true, name: true, gender: true, visualAnchor: true, sheetData: true } },
        project: { select: { stylePreset: true } },
      },
    });
    if (!asset) throw new AppError(`资产不存在：${assetId}`, 404);

    const refImagePaths = await resolveSheetRefPaths(asset.characterId);
    const prompt = buildAssetPrompt({
      assetType: asset.assetType as CharacterAssetType,
      name: asset.name,
      description: asset.description ?? undefined,
      characterName: asset.character.name,
      characterGender: asset.character.gender,
      characterVisualAnchor: asset.character.visualAnchor,
      isRefAvailable: refImagePaths.length > 0,
      styleKeywords: resolveComicStyleKeywords(asset.project.stylePreset),
    });

    // 参考素材元数据（前端预览缩略图用）
    const referenceImages: import("../image/runtime").GeneratedReferenceImageMeta[] = [];
    const sheetState = safeJsonParse<{ status?: string }>(asset.character.sheetData, {});
    if (sheetState.status === "done") {
      referenceImages.push({
        kind: "character_sheet",
        label: `${asset.character.name} · 三视图`,
        url: `/api/comic/character-images/${asset.character.id}/sheet`,
      });
    }

    const adapter: import("../image/runtime").ImageTargetAdapter<AssetImageData> = {
      kind: `comic.character-asset:${assetId}`,
      loadState: async () => safeJsonParse<AssetImageData>(asset.imageData, { status: "idle" }),
      saveState: async (next) => {
        await prisma.comicCharacterAsset.update({ where: { id: assetId }, data: { imageData: JSON.stringify(next) } });
      },
      diskPath: (ext) => path.join(assetDir(assetId), `asset.${ext}`),
      publicUrl: () => assetImageUrl(assetId),
      buildExtraDoneState: () => ({ origin: "generated" as const }),
    };

    return {
      adapter,
      prompt,
      refImagePaths,
      referenceImages,
      size: "1024x1024" as const,
      title: `生成${asset.assetType === "costume" ? "服装" : asset.assetType === "weapon" ? "武器" : "资产"}：${asset.name}`,
    };
  }

  /** 预览即将发送给图像模型的全部素材（不消耗 token） */
  async prepareAssetImage(assetId: string, provider?: string): Promise<import("../image/runtime").ImageGenerationPreview> {
    const ctx = await this.buildAssetGenerationContext(assetId);
    return {
      kind: ctx.adapter.kind,
      title: ctx.title,
      prompt: ctx.prompt,
      referenceImages: ctx.referenceImages,
      provider: provider ?? "openai",
      size: ctx.size,
    };
  }

  async generateAssetImage(
    assetId: string,
    provider?: string,
    overrides?: import("../image/runtime").ImageGenerationOverrides,
  ): Promise<void> {
    const ctx = await this.buildAssetGenerationContext(assetId);
    const refs = filterImageGenerationReferences({
      refImagePaths: ctx.refImagePaths,
      referenceImages: ctx.referenceImages,
      excludedReferenceImageUrls: overrides?.excludedReferenceImageUrls,
    });
    await runImageGeneration(ctx.adapter, {
      provider: overrides?.providerOverride ?? provider,
      prompt: overrides?.promptOverride ?? ctx.prompt,
      size: overrides?.sizeOverride ?? ctx.size,
      refImagePaths: refs.refImagePaths,
      referenceImages: refs.referenceImages && refs.referenceImages.length > 0 ? refs.referenceImages : undefined,
    });
  }

  // ── 文件服务 ──────────────────────────────────────────────────────────────

  async serveAssetImage(assetId: string): Promise<{ filePath: string; mimeType: string }> {
    const resolved = await resolveAssetFile(assetId);
    if (!resolved) throw new AppError(`资产图片未找到：${assetId}`, 404);
    return resolved;
  }
}

export const comicCharacterAssetService = new ComicCharacterAssetService();
