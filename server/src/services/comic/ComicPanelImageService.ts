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

// ─── Types ────────────────────────────────────────────────────────────────────

export type PanelImageStatus = "idle" | "generating" | "done" | "error";

export interface PanelImageData {
  status: PanelImageStatus;
  version?: number;
  url?: string;
  prompt?: string;
  provider?: string;
  generatedAt?: string;
  error?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const COMIC_IMAGES_DIR = "comic-panels";
const DEFAULT_PROVIDER: LLMProvider = "openai";

function comicPanelDir(panelId: string): string {
  return path.join(resolveGeneratedImagesRoot(), COMIC_IMAGES_DIR, panelId);
}

function panelImageUrl(panelId: string): string {
  return `/api/comic/panel-images/${panelId}/panel`;
}

async function saveImageToDisk(imageUrl: string, destPath: string): Promise<void> {
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  if (imageUrl.startsWith("data:")) {
    const [, base64Payload = ""] = imageUrl.split(",", 2);
    await fs.writeFile(destPath, Buffer.from(base64Payload, "base64"));
  } else {
    const resp = await fetch(imageUrl);
    if (!resp.ok) {
      throw new Error(`图片下载失败 (${resp.status}): ${imageUrl}`);
    }
    await fs.writeFile(destPath, Buffer.from(await resp.arrayBuffer()));
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

function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

function buildPanelPrompt(visualPrompt: string, stylePreset?: string): string {
  const styleKeyword = stylePreset ?? "webtoon style, vibrant colors, clean lines";
  return `${visualPrompt}, ${styleKeyword}, high quality manga panel`;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class ComicPanelImageService {
  /**
   * 为单格漫画格子生成图像。
   * - 从 ComicCharacter.sheetData 提取参考图（如有）
   * - 图存磁盘，路径写入 ComicPanel.imageData
   */
  async generatePanelImage(
    panelId: string,
    provider: LLMProvider = DEFAULT_PROVIDER,
  ): Promise<PanelImageData> {
    const panel = await prisma.comicPanel.findUnique({
      where: { id: panelId },
      include: {
        episode: {
          include: {
            project: {
              include: { characters: true },
            },
          },
        },
      },
    });
    if (!panel) throw new AppError(`未找到漫画格子：${panelId}`, 404);
    if (!panel.visualPrompt) throw new AppError("该格子缺少 visualPrompt，无法生成图像。", 400);
    if (!isImageProviderSupported(provider)) {
      throw new AppError(`图片 Provider ${provider} 暂不支持。`, 400);
    }

    const project = panel.episode.project;
    const stylePreset = project.stylePreset
      ? (safeJsonParse<{ style?: string }>(project.stylePreset, {})).style
      : undefined;

    // 从 characterRefs 提取参考图 URL
    const characterRefs: string[] = safeJsonParse<string[]>(panel.characterRefs, []);
    const refImages: string[] = [];
    if (characterRefs.length > 0) {
      for (const character of project.characters) {
        if (!characterRefs.includes(character.name)) continue;
        const sheetData = safeJsonParse<{ status?: string; url?: string }>(character.sheetData, {});
        if (sheetData.status === "done" && sheetData.url) {
          refImages.push(sheetData.url);
        }
      }
    }

    // 标记 generating
    const existing = safeJsonParse<PanelImageData>(panel.imageData, { status: "idle" });
    const nextVersion = existing.status === "done" ? (existing.version ?? 0) + 1 : 1;
    const generatingData: PanelImageData = { status: "generating", provider, version: nextVersion };
    await prisma.comicPanel.update({
      where: { id: panelId },
      data: { imageData: JSON.stringify(generatingData) },
    });

    try {
      const model = await resolveImageModel(provider);
      const prompt = buildPanelPrompt(panel.visualPrompt, stylePreset);

      const result = await generateImagesByProvider({
        sceneType: "chapter_illustration",
        provider,
        model,
        prompt,
        size: "1024x1536", // 竖版 2:3，适合条漫单格
        count: 1,
        refImages: refImages.length > 0 ? refImages : undefined,
      });

      const imageUrl = result.images[0]?.url;
      if (!imageUrl) throw new Error("图片生成结果为空。");

      const ext = inferExtension(imageUrl);
      const localPath = path.join(comicPanelDir(panelId), `panel.${ext}`);
      await saveImageToDisk(imageUrl, localPath);

      // 清理旧格式文件（同目录其他扩展名）
      await cleanOldPanelFiles(panelId, ext);

      const doneData: PanelImageData = {
        status: "done",
        version: nextVersion,
        url: panelImageUrl(panelId),
        prompt,
        provider,
        generatedAt: new Date().toISOString(),
      };
      await prisma.comicPanel.update({
        where: { id: panelId },
        data: { imageData: JSON.stringify(doneData) },
      });
      return doneData;
    } catch (err) {
      const errorData: PanelImageData = {
        status: "error",
        provider,
        version: nextVersion,
        error: err instanceof Error ? err.message : String(err),
      };
      await prisma.comicPanel.update({
        where: { id: panelId },
        data: { imageData: JSON.stringify(errorData) },
      });
      throw err;
    }
  }

  getPanelImageData(panelId: string): Promise<PanelImageData> {
    return prisma.comicPanel
      .findUnique({ where: { id: panelId }, select: { imageData: true } })
      .then((p) => {
        if (!p) throw new AppError(`未找到漫画格子：${panelId}`, 404);
        return safeJsonParse<PanelImageData>(p.imageData, { status: "idle" });
      });
  }

  /** 读取本地图片文件（供 HTTP 路由直接流式响应） */
  async getPanelImageFile(
    panelId: string,
  ): Promise<{ buffer: Buffer; ext: string } | null> {
    const dir = comicPanelDir(panelId);
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      return null;
    }
    const panelFile = entries.find((f) => /^panel\.(png|jpg|webp)$/i.test(f));
    if (!panelFile) return null;
    const ext = path.extname(panelFile).replace(".", "").toLowerCase();
    const buffer = await fs.readFile(path.join(dir, panelFile));
    return { buffer, ext };
  }
}

async function cleanOldPanelFiles(panelId: string, keepExt: string): Promise<void> {
  const dir = comicPanelDir(panelId);
  let entries: string[];
  try { entries = await fs.readdir(dir); } catch { return; }
  for (const f of entries) {
    const fExt = path.extname(f).replace(".", "").toLowerCase();
    if (/^panel\.(png|jpg|webp)$/i.test(f) && fExt !== keepExt) {
      await fs.unlink(path.join(dir, f)).catch(() => {});
    }
  }
}

export const comicPanelImageService = new ComicPanelImageService();
