/**
 * DramaCharacterImageService
 * 为短剧角色生成「角色设计稿」：一张横版图同时包含面部特写 + 正/侧/背三视图。
 * 对齐行业标准角色参考图规范，一次生成、全视角一致、作为视频生成的视觉锚点。
 *
 * 设计原则：
 * - 仅依赖平台级图片能力（provider.ts），不导入 novel 业务服务。
 * - 图片存储于 drama-characters/{charId}/ 独立目录，通过专用端点服务。
 * - characterSheetData 存角色设计稿（主）；portraitData/threeViewData 保留后备兼容。
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

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type CharacterImageStatus = "idle" | "generating" | "done" | "error";

export interface CharacterSheetData {
  status: CharacterImageStatus;
  /** 角色设计稿公开 URL（面部特写 + 三视图合图） */
  url?: string;
  prompt?: string;
  generatedAt?: string;
  error?: string;
}

export interface PortraitData {
  status: CharacterImageStatus;
  url?: string;
  prompt?: string;
  generatedAt?: string;
  error?: string;
}

export type ThreeViewName = "front" | "side" | "back";

export interface ThreeViewItem {
  view: ThreeViewName;
  status: CharacterImageStatus;
  url?: string;
  prompt?: string;
  generatedAt?: string;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const DRAMA_IMAGES_DIR = "drama-characters";
const DEFAULT_PROVIDER = "openai" as const;

function dramaCharacterDir(charId: string): string {
  return path.join(resolveGeneratedImagesRoot(), DRAMA_IMAGES_DIR, charId);
}

async function saveImageToDisk(imageUrl: string, destPath: string): Promise<void> {
  await fs.mkdir(path.dirname(destPath), { recursive: true });

  if (imageUrl.startsWith("data:")) {
    const [, base64Payload = ""] = imageUrl.split(",", 2);
    const buffer = Buffer.from(base64Payload, "base64");
    await fs.writeFile(destPath, buffer);
  } else {
    const resp = await fetch(imageUrl);
    if (!resp.ok) {
      throw new Error(`Failed to fetch generated image (${resp.status}): ${imageUrl}`);
    }
    const buffer = Buffer.from(await resp.arrayBuffer());
    await fs.writeFile(destPath, buffer);
  }
}

function inferExtension(imageUrl: string): string {
  if (imageUrl.startsWith("data:image/jpeg")) return "jpg";
  if (imageUrl.startsWith("data:image/webp")) return "webp";
  try {
    const ext = path.extname(new URL(imageUrl).pathname).replace(".", "").toLowerCase();
    return ext || "png";
  } catch {
    return "png";
  }
}

function extractVisualDesc(visualAnchor: string | null | undefined): string {
  if (!visualAnchor?.trim()) return "";
  try {
    const parsed = JSON.parse(visualAnchor) as Record<string, unknown>;
    return typeof parsed.description === "string" ? parsed.description : JSON.stringify(parsed);
  } catch {
    return visualAnchor;
  }
}

/**
 * 构建「角色设计稿」提示词：
 * 单张横版图 = 左侧面部特写（1/3） + 右侧全身三视图正/侧/背（2/3）
 */
function buildCharacterSheetPrompt(character: {
  name: string;
  archetype?: string | null;
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
    "cinematic quality, photorealistic, 8K detail",
  ];

  if (character.archetype) lines.push(`character archetype: ${character.archetype}`);
  if (character.persona) lines.push(`character trait: ${character.persona}`);
  if (visualDesc) lines.push(`appearance: ${visualDesc}`);

  lines.push("Asian face, vertical short drama style, professional costume design");

  return lines.join(", ");
}

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

export class DramaCharacterImageService {
  /**
   * 生成角色设计稿（主方法）：
   * 一张横版图 = 左侧面部特写 + 右侧全身正/侧/背三视图。
   * 回填到 portraitData（兼容旧字段，视频生成读这个字段取参考图 URL）。
   */
  async generateCharacterSheet(
    characterId: string,
    provider = DEFAULT_PROVIDER,
  ): Promise<CharacterSheetData> {
    const character = await prisma.dramaCharacter.findUnique({
      where: { id: characterId },
    });
    if (!character) {
      throw new AppError(`未找到短剧角色：${characterId}`, 404);
    }
    if (!isImageProviderSupported(provider)) {
      throw new AppError(`图片 Provider ${provider} 暂不支持。`, 400);
    }

    // 标记 generating（同时写入 portraitData 供视频生成链路读取）
    const generatingData: CharacterSheetData = { status: "generating" };
    await prisma.dramaCharacter.update({
      where: { id: characterId },
      data: {
        portraitData: JSON.stringify(generatingData),
      },
    });

    try {
      const model = await resolveImageModel(provider);
      const prompt = buildCharacterSheetPrompt(character);

      const result = await generateImagesByProvider({
        sceneType: "character",
        provider,
        model,
        prompt,
        size: "1536x1024", // 横版 3:2，容纳面部特写 + 三视图
        count: 1,
      });

      const imageUrl = result.images[0]?.url;
      if (!imageUrl) throw new Error("图片生成结果为空。");

      const ext = inferExtension(imageUrl);
      const fileName = `character-sheet.${ext}`;
      const localPath = path.join(dramaCharacterDir(characterId), fileName);
      await saveImageToDisk(imageUrl, localPath);

      const publicUrl = `/api/drama/character-images/${characterId}/character-sheet`;
      const doneData: CharacterSheetData = {
        status: "done",
        url: publicUrl,
        prompt,
        generatedAt: new Date().toISOString(),
      };

      // 回填到 portraitData（视频生成链路读这个字段）
      await prisma.dramaCharacter.update({
        where: { id: characterId },
        data: { portraitData: JSON.stringify(doneData) },
      });

      return doneData;
    } catch (err) {
      const errorData: CharacterSheetData = {
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      };
      await prisma.dramaCharacter.update({
        where: { id: characterId },
        data: { portraitData: JSON.stringify(errorData) },
      });
      throw err;
    }
  }

  /**
   * @deprecated 使用 generateCharacterSheet() 替代。
   * 保留以避免旧调用报错，内部转发到 generateCharacterSheet。
   */
  async generatePortrait(
    characterId: string,
    provider = DEFAULT_PROVIDER,
  ): Promise<PortraitData> {
    return this.generateCharacterSheet(characterId, provider);
  }

  /**
   * @deprecated 使用 generateCharacterSheet() 替代。
   * 三视图已合并进角色设计稿，此方法返回空数组作为兼容占位。
   */
  async generateThreeView(
    characterId: string,
    provider = DEFAULT_PROVIDER,
  ): Promise<ThreeViewItem[]> {
    // 三视图现在在设计稿里，直接生成设计稿并返回占位
    await this.generateCharacterSheet(characterId, provider);
    return [];
  }

  async getImageStatus(characterId: string): Promise<{
    portrait: PortraitData;
    threeView: ThreeViewItem[];
  }> {
    const character = await prisma.dramaCharacter.findUnique({
      where: { id: characterId },
      select: { portraitData: true, threeViewData: true },
    });
    if (!character) {
      throw new AppError(`未找到短剧角色：${characterId}`, 404);
    }

    const portrait: PortraitData = character.portraitData
      ? (JSON.parse(character.portraitData) as PortraitData)
      : { status: "idle" };

    const threeView: ThreeViewItem[] = character.threeViewData
      ? (JSON.parse(character.threeViewData) as ThreeViewItem[])
      : [];

    return { portrait, threeView };
  }

  /**
   * 解析角色设计稿本地文件路径（供 HTTP 端点读文件使用）。
   */
  async resolveExistingImagePath(
    characterId: string,
    type: "portrait" | "character-sheet" | `three-view-${"front" | "side" | "back"}`,
  ): Promise<{ filePath: string; mimeType: string } | null> {
    const dir = dramaCharacterDir(characterId);

    // character-sheet 和 portrait 都指向同一文件
    const fileBase = (type === "portrait" || type === "character-sheet")
      ? "character-sheet"
      : type;

    const exts: Array<[string, string]> = [
      ["png", "image/png"],
      ["jpg", "image/jpeg"],
      ["webp", "image/webp"],
    ];
    for (const [ext, mime] of exts) {
      const fp = path.join(dir, `${fileBase}.${ext}`);
      try {
        await fs.access(fp);
        return { filePath: fp, mimeType: mime };
      } catch {
        // not found, try next
      }
    }
    return null;
  }
}

export const dramaCharacterImageService = new DramaCharacterImageService();
