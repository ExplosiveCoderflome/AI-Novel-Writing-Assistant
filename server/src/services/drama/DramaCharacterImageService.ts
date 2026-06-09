/**
 * DramaCharacterImageService
 * 为短剧角色生成形象图（详图）和三视图（正面/侧面/背面）。
 *
 * 设计原则：
 * - 仅依赖平台级图片能力（provider.ts），不导入 novel 业务服务。
 * - 图片存储在独立目录 drama-characters/{charId}/，通过专用端点服务。
 * - 生成进度写回 DramaCharacter.portraitData / threeViewData（JSON 字符串）。
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

/** 将图片 URL 或 base64 data-url 写入磁盘，返回本地路径 */
async function saveImageToDisk(
  imageUrl: string,
  destPath: string,
): Promise<void> {
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

/** 解析 PNG 扩展名（默认 png） */
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

/** 构建角色形象图生成提示词 */
function buildPortraitPrompt(character: {
  name: string;
  archetype?: string | null;
  persona?: string | null;
  visualAnchor?: string | null;
}): string {
  const parts: string[] = [
    "竖屏短剧角色形象图",
    `角色名：${character.name}`,
  ];
  if (character.archetype) parts.push(`原型：${character.archetype}`);
  if (character.persona) parts.push(`人设：${character.persona}`);
  if (character.visualAnchor) {
    // visualAnchor 可能是 JSON 或纯文字
    try {
      const parsed = JSON.parse(character.visualAnchor) as Record<string, unknown>;
      const desc = typeof parsed.description === "string" ? parsed.description : JSON.stringify(parsed);
      parts.push(`外形：${desc}`);
    } catch {
      parts.push(`外形：${character.visualAnchor}`);
    }
  }
  parts.push(
    "电影级写实质感，精致五官，高清细节",
    "8K超高清，专业摄影棚打光，白色背景，全身展示",
    "亚洲面孔，现代服装风格，无文字水印",
  );
  return parts.join("，");
}

/** 构建三视图提示词（正/侧/背） */
function buildThreeViewPrompt(
  view: ThreeViewName,
  character: {
    name: string;
    archetype?: string | null;
    visualAnchor?: string | null;
  },
): string {
  const viewLabel: Record<ThreeViewName, string> = {
    front: "正面",
    side: "侧面（90度侧视）",
    back: "背面",
  };
  const parts: string[] = [
    "角色三视图",
    viewLabel[view],
    `角色名：${character.name}`,
  ];
  if (character.archetype) parts.push(`原型：${character.archetype}`);
  if (character.visualAnchor) {
    try {
      const parsed = JSON.parse(character.visualAnchor) as Record<string, unknown>;
      const desc = typeof parsed.description === "string" ? parsed.description : JSON.stringify(parsed);
      parts.push(`外形：${desc}`);
    } catch {
      parts.push(`外形：${character.visualAnchor}`);
    }
  }
  parts.push(
    "白色背景，全身展示，服装细节清晰",
    "与其他视角为同一角色，保持造型完全一致",
    "专业角色设计参考图，无文字水印",
  );
  return parts.join("，");
}

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

export class DramaCharacterImageService {
  /**
   * 生成角色形象图（详图）。
   * 立即将状态改为 generating，生成完成后回填 done。
   */
  async generatePortrait(
    characterId: string,
    provider = DEFAULT_PROVIDER,
  ): Promise<PortraitData> {
    const character = await prisma.dramaCharacter.findUnique({
      where: { id: characterId },
    });
    if (!character) {
      throw new AppError(`未找到短剧角色：${characterId}`, 404);
    }

    if (!isImageProviderSupported(provider)) {
      throw new AppError(`图片 Provider ${provider} 暂不支持。`, 400);
    }

    // 标记 generating
    const generatingData: PortraitData = { status: "generating" };
    await prisma.dramaCharacter.update({
      where: { id: characterId },
      data: { portraitData: JSON.stringify(generatingData) },
    });

    try {
      const model = await resolveImageModel(provider);
      const prompt = buildPortraitPrompt(character);

      const result = await generateImagesByProvider({
        sceneType: "character",
        provider,
        model,
        prompt,
        size: "1024x1536", // 竖屏比例
        count: 1,
      });

      const imageUrl = result.images[0]?.url;
      if (!imageUrl) {
        throw new Error("图片生成结果为空。");
      }

      // 存储到磁盘
      const ext = inferExtension(imageUrl);
      const fileName = `portrait.${ext}`;
      const localPath = path.join(dramaCharacterDir(characterId), fileName);
      await saveImageToDisk(imageUrl, localPath);

      const publicUrl = `/api/drama/character-images/${characterId}/portrait`;
      const doneData: PortraitData = {
        status: "done",
        url: publicUrl,
        prompt,
        generatedAt: new Date().toISOString(),
      };

      await prisma.dramaCharacter.update({
        where: { id: characterId },
        data: { portraitData: JSON.stringify(doneData) },
      });

      return doneData;
    } catch (err) {
      const errorData: PortraitData = {
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
   * 生成三视图（正面、侧面、背面）。
   * 逐一生成，每张完成后立即写回。
   */
  async generateThreeView(
    characterId: string,
    provider = DEFAULT_PROVIDER,
  ): Promise<ThreeViewItem[]> {
    const character = await prisma.dramaCharacter.findUnique({
      where: { id: characterId },
    });
    if (!character) {
      throw new AppError(`未找到短剧角色：${characterId}`, 404);
    }

    if (!isImageProviderSupported(provider)) {
      throw new AppError(`图片 Provider ${provider} 暂不支持。`, 400);
    }

    const views: ThreeViewName[] = ["front", "side", "back"];
    const items: ThreeViewItem[] = views.map((view) => ({ view, status: "generating" }));

    // 标记全部 generating
    await prisma.dramaCharacter.update({
      where: { id: characterId },
      data: { threeViewData: JSON.stringify(items) },
    });

    const model = await resolveImageModel(provider);

    for (let i = 0; i < views.length; i++) {
      const view = views[i]!;
      try {
        const prompt = buildThreeViewPrompt(view, character);
        const result = await generateImagesByProvider({
          sceneType: "character",
          provider,
          model,
          prompt,
          size: "1024x1536",
          count: 1,
        });

        const imageUrl = result.images[0]?.url;
        if (!imageUrl) {
          throw new Error(`${view} 视图生成结果为空。`);
        }

        const ext = inferExtension(imageUrl);
        const fileName = `three-view-${view}.${ext}`;
        const localPath = path.join(dramaCharacterDir(characterId), fileName);
        await saveImageToDisk(imageUrl, localPath);

        items[i] = {
          view,
          status: "done",
          url: `/api/drama/character-images/${characterId}/three-view/${view}`,
          prompt,
          generatedAt: new Date().toISOString(),
        };
      } catch (err) {
        items[i] = {
          view,
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        };
      }

      // 每张完成后立即写回，前端可实时刷新
      await prisma.dramaCharacter.update({
        where: { id: characterId },
        data: { threeViewData: JSON.stringify(items) },
      });
    }

    return items;
  }

  /**
   * 获取角色当前图片状态。
   */
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
   * 解析角色图本地文件路径（供 HTTP 端点读文件使用）。
   */
  resolvePortraitPath(characterId: string): string {
    const dir = dramaCharacterDir(characterId);
    // 优先 png，兼容 jpg/webp
    for (const ext of ["png", "jpg", "webp"]) {
      return path.join(dir, `portrait.${ext}`);
    }
    return path.join(dir, "portrait.png");
  }

  resolveThreeViewPath(characterId: string, view: ThreeViewName): string {
    const dir = dramaCharacterDir(characterId);
    for (const ext of ["png", "jpg", "webp"]) {
      return path.join(dir, `three-view-${view}.${ext}`);
    }
    return path.join(dir, `three-view-${view}.png`);
  }

  /**
   * 实际解析文件：尝试所有扩展名，返回第一个存在的。
   */
  async resolveExistingImagePath(
    characterId: string,
    type: "portrait" | `three-view-${"front" | "side" | "back"}`,
  ): Promise<{ filePath: string; mimeType: string } | null> {
    const dir = dramaCharacterDir(characterId);
    const exts: Array<[string, string]> = [
      ["png", "image/png"],
      ["jpg", "image/jpeg"],
      ["webp", "image/webp"],
    ];
    for (const [ext, mime] of exts) {
      const fp = path.join(dir, `${type}.${ext}`);
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
