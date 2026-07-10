/**
 * ComicSceneService
 * 场景一致性实体（L0 场景圣经 + L1 设定图）的 CRUD + AI 生成 + 上传。
 *
 * bible JSON：{ palette, keyElements, materials, ambiance, layout }
 * sheetData JSON：{ status, url, prompt, provider, generatedAt, error, origin:"generated"|"uploaded" }
 * 图片存储：generated-images/comic-scenes/{sceneId}/scene-sheet.{ext}
 * HTTP 端点：/api/comic/scenes/:sceneId/image
 */
import fs from "fs/promises";
import path from "path";

import { prisma } from "../../db/prisma";
import { AppError } from "../../middleware/errorHandler";
import { resolveGeneratedImagesRoot } from "../../runtime/appPaths";
import { runImageGeneration, safeJsonParse, type ImageTargetAdapter } from "../image/runtime";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { resolveComicStyleKeywords } from "./comicStylePrompt";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SceneSheetStatus = "idle" | "generating" | "done" | "error";
export type SceneType = "interior" | "exterior" | "landscape" | "abstract" | "other";

export interface SceneBible {
  palette?: string;
  keyElements?: string;
  materials?: string;
  ambiance?: string;
  layout?: string;
}

export interface SceneSheetData {
  status: SceneSheetStatus;
  url?: string;
  prompt?: string;
  provider?: string;
  generatedAt?: string;
  error?: string;
  origin?: "generated" | "uploaded";
}

export interface CreateSceneInput {
  projectId: string;
  name: string;
  sceneType?: SceneType;
  bible?: SceneBible;
  sortOrder?: number;
}

export interface UpdateSceneInput {
  name?: string;
  sceneType?: SceneType;
  bible?: SceneBible;
  sortOrder?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SCENES_DIR = "comic-scenes";
const DEFAULT_PROVIDER: LLMProvider = "openai";
const IMAGE_EXTS: Array<[string, string]> = [
  ["png", "image/png"],
  ["jpg", "image/jpeg"],
  ["webp", "image/webp"],
];

function sceneDir(sceneId: string): string {
  return path.join(resolveGeneratedImagesRoot(), SCENES_DIR, sceneId);
}

export function sceneImageUrl(sceneId: string): string {
  return `/api/comic/scenes/${sceneId}/image`;
}

async function removeOldSceneFiles(sceneId: string, keepExt: string): Promise<void> {
  const dir = sceneDir(sceneId);
  for (const [ext] of IMAGE_EXTS) {
    if (ext === keepExt) continue;
    await fs.unlink(path.join(dir, `scene-sheet.${ext}`)).catch(() => {});
  }
}

/** 找已存盘的场景设定图路径 */
export async function resolveSceneFile(sceneId: string): Promise<{ filePath: string; mimeType: string } | null> {
  const dir = sceneDir(sceneId);
  for (const [ext, mimeType] of IMAGE_EXTS) {
    const candidate = path.join(dir, `scene-sheet.${ext}`);
    try {
      await fs.access(candidate);
      return { filePath: candidate, mimeType };
    } catch { /* 继续 */ }
  }
  return null;
}

function buildSceneSheetPrompt(params: {
  name: string;
  sceneType: SceneType;
  bible: SceneBible;
  stylePrefix?: string;
}): string {
  const { name, sceneType, bible, stylePrefix } = params;
  // 十字分割的 2x2 四宫格场景参考图：一张图同时给出四个视角，作参考时信息量最大
  const lines: string[] = [
    stylePrefix ?? "webtoon style, vibrant colors, clean lines",
    `location reference sheet of a ${sceneType} scene: ${name}`,
    "ONE single square image divided by a cross into a 2x2 grid of four quadrants",
    "top-left: wide establishing shot of the whole space",
    "top-right: an alternate angle / reverse view of the same space",
    "bottom-left: medium shot of the core area with the key landmarks and furniture",
    "bottom-right: close-up of materials, color swatches and lighting mood",
    "all four quadrants depict the SAME location with IDENTICAL palette, materials, architecture and lighting",
    "environment concept art, NO characters or only tiny background figures",
    "thin clean divider lines between quadrants, so it can be reused as a location reference",
  ];
  if (bible.palette) lines.push(`color palette: ${bible.palette}`);
  if (bible.keyElements) lines.push(`key elements: ${bible.keyElements}`);
  if (bible.materials) lines.push(`materials: ${bible.materials}`);
  if (bible.ambiance) lines.push(`ambiance and lighting: ${bible.ambiance}`);
  if (bible.layout) lines.push(`spatial layout: ${bible.layout}`);
  lines.push("clean composition, no text labels, no watermark, high quality background art");
  return lines.join(", ");
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class ComicSceneService {
  // ── CRUD ──────────────────────────────────────────────────────────────────

  async createScene(input: CreateSceneInput) {
    const project = await prisma.comicProject.findUnique({
      where: { id: input.projectId },
      select: { id: true },
    });
    if (!project) throw new AppError(`项目不存在：${input.projectId}`, 404);

    return prisma.comicScene.create({
      data: {
        projectId: input.projectId,
        name: input.name.trim(),
        sceneType: input.sceneType ?? "interior",
        bible: input.bible ? JSON.stringify(input.bible) : null,
        sortOrder: input.sortOrder ?? 0,
        sheetData: JSON.stringify({ status: "idle" } satisfies SceneSheetData),
      },
    });
  }

  async listByProject(projectId: string) {
    return prisma.comicScene.findMany({
      where: { projectId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
  }

  async getScene(sceneId: string) {
    const scene = await prisma.comicScene.findUnique({ where: { id: sceneId } });
    if (!scene) throw new AppError(`场景不存在：${sceneId}`, 404);
    return scene;
  }

  async updateScene(sceneId: string, input: UpdateSceneInput) {
    await this.getScene(sceneId);
    return prisma.comicScene.update({
      where: { id: sceneId },
      data: {
        ...(input.name !== undefined && { name: input.name.trim() }),
        ...(input.sceneType !== undefined && { sceneType: input.sceneType }),
        ...(input.bible !== undefined && { bible: JSON.stringify(input.bible) }),
        ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
      },
    });
  }

  async deleteScene(sceneId: string) {
    await this.getScene(sceneId);
    try {
      await fs.rm(sceneDir(sceneId), { recursive: true, force: true });
    } catch { /* 忽略：文件可能从未生成 */ }
    return prisma.comicScene.delete({ where: { id: sceneId } });
  }

  // ── 图片上传 ──────────────────────────────────────────────────────────────

  async uploadSceneImage(sceneId: string, fileBuffer: Buffer, mimeType: string): Promise<{ url: string }> {
    await this.getScene(sceneId);
    const ext = mimeType === "image/jpeg" ? "jpg" : mimeType === "image/webp" ? "webp" : "png";
    const dir = sceneDir(sceneId);
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, `scene-sheet.${ext}`);
    await fs.writeFile(filePath, fileBuffer);
    await removeOldSceneFiles(sceneId, ext);

    const url = sceneImageUrl(sceneId);
    const sheetData: SceneSheetData = {
      status: "done",
      url,
      origin: "uploaded",
      generatedAt: new Date().toISOString(),
    };
    await prisma.comicScene.update({
      where: { id: sceneId },
      data: { sheetData: JSON.stringify(sheetData) },
    });
    return { url };
  }

  // ── AI 生成（prepare + generate 共享 buildContext） ───────────────────────

  private async buildSceneGenerationContext(sceneId: string) {
    const scene = await prisma.comicScene.findUnique({
      where: { id: sceneId },
      include: { project: { select: { stylePreset: true } } },
    });
    if (!scene) throw new AppError(`场景不存在：${sceneId}`, 404);

    const stylePrefix = resolveComicStyleKeywords(scene.project.stylePreset);
    const bible = safeJsonParse<SceneBible>(scene.bible, {});
    const prompt = buildSceneSheetPrompt({
      name: scene.name,
      sceneType: scene.sceneType as SceneType,
      bible,
      stylePrefix,
    });

    const adapter: ImageTargetAdapter<SceneSheetData> = {
      kind: `comic.scene:${sceneId}`,
      loadState: async () => safeJsonParse<SceneSheetData>(scene.sheetData, { status: "idle" }),
      saveState: async (next) => {
        await prisma.comicScene.update({ where: { id: sceneId }, data: { sheetData: JSON.stringify(next) } });
      },
      diskPath: (ext) => path.join(sceneDir(sceneId), `scene-sheet.${ext}`),
      publicUrl: () => sceneImageUrl(sceneId),
      cleanupOtherExts: (keepExt) => removeOldSceneFiles(sceneId, keepExt),
      buildExtraDoneState: () => ({ origin: "generated" as const }),
    };

    return {
      adapter,
      prompt,
      size: "1024x1024" as const,
      title: `生成场景设定图：${scene.name}`,
    };
  }

  async prepareSceneSheet(sceneId: string, provider?: string): Promise<import("../image/runtime").ImageGenerationPreview> {
    const ctx = await this.buildSceneGenerationContext(sceneId);
    return {
      kind: ctx.adapter.kind,
      title: ctx.title,
      prompt: ctx.prompt,
      referenceImages: [],
      provider: provider ?? "openai",
      size: ctx.size,
    };
  }

  async generateSceneSheet(
    sceneId: string,
    provider?: string,
    overrides?: import("../image/runtime").ImageGenerationOverrides,
  ): Promise<void> {
    const ctx = await this.buildSceneGenerationContext(sceneId);
    await runImageGeneration(ctx.adapter, {
      provider: overrides?.providerOverride ?? provider,
      prompt: overrides?.promptOverride ?? ctx.prompt,
      size: overrides?.sizeOverride ?? ctx.size,
    });
  }

  // ── 文件服务 ──────────────────────────────────────────────────────────────

  async serveSceneImage(sceneId: string): Promise<{ filePath: string; mimeType: string }> {
    const resolved = await resolveSceneFile(sceneId);
    if (!resolved) throw new AppError(`场景图片未找到：${sceneId}`, 404);
    return resolved;
  }
}

export const comicSceneService = new ComicSceneService();
