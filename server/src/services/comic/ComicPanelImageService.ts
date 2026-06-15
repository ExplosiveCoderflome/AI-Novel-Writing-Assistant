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
import {
  comicCharacterImageService,
  describeCharacterExpression,
  isCharacterExpressionId,
  type CharacterExpressionId,
} from "./ComicCharacterImageService";
import { IMAGE_SIZES, type ImageSize } from "../image/types";
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

interface DialogueEntry {
  speaker?: string;
  text: string;
  bubbleType?: "round" | "spike" | "cloud" | "caption";
  anchorHint?: string;
}

interface StructuredCharacterRef {
  name: string;
  costume?: string;
  expression?: CharacterExpressionId;
  lighting?: string;
}

function normalizeCharacterRefs(raw: string | null | undefined): StructuredCharacterRef[] {
  const parsed = safeJsonParse<unknown[]>(raw, []);
  const refs: StructuredCharacterRef[] = [];
  for (const item of parsed) {
    if (typeof item === "string" && item.trim()) {
      refs.push({ name: item.trim(), costume: "default", expression: "neutral" });
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name.trim() : "";
    if (!name) continue;
    const expression = isCharacterExpressionId(record.expression) ? record.expression : "neutral";
    refs.push({
      name,
      costume: typeof record.costume === "string" && record.costume.trim() ? record.costume.trim() : "default",
      expression,
      lighting: typeof record.lighting === "string" && record.lighting.trim() ? record.lighting.trim() : undefined,
    });
  }
  return refs.slice(0, 5);
}

function extractVisualAnchorDesc(visualAnchor: string): string {
  try {
    const parsed = JSON.parse(visualAnchor) as Record<string, unknown>;
    if (typeof parsed.description === "string") return parsed.description;
    if (typeof parsed.hint === "string") return parsed.hint;
    return visualAnchor;
  } catch {
    return visualAnchor;
  }
}

// 中文形态关键词映射（与前端 COMIC_FORMATS.value 对应）
const FORMAT_ZH_KEYWORDS: Record<string, string> = {
  webtoon:         "竖版条漫单格，韩漫竖屏格子，手机阅读条漫画格",
  "4koma":         "四格漫画，竖版四格，起承转合四格排版",
  single_page:     "单页漫画，日漫分格页面，大小格混排单页",
  cinematic:       "电影分镜画格，横版宽幅，电影感构图",
  chat_comic:      "聊天漫画格，对话气泡式版式，轻松日常漫画",
  chibi_comic:     "Q版萌漫，SD人物，可爱夸张比例漫画格",
  ink_comic:       "水墨国风漫画格，毛笔线条，古典意境留白",
  drama_screenshot:"竖版短剧截图风，字幕条，剧情画面感",
};

const STYLE_ZH_KEYWORDS: Record<string, string> = {
  webtoon_color:   "彩色韩漫风格，干净线条，鲜艳配色",
  bl_manga:        "彩色少女漫风格，柔和色调，精致五官",
  shounen_bw:      "黑白少年漫风格，粗犷线条，动感构图",
  ink_traditional: "水墨国风，传统毛笔笔触，淡彩晕染",
  chibi:           "Q版萌漫风格，圆润可爱，夸张表情",
  realistic:       "写实漫画风格，细腻光影，真实感",
};

function buildDialoguePrompt(dialogues: DialogueEntry[]): string {
  if (dialogues.length === 0) return "";
  const lines = dialogues.map((d) => {
    const bubbleDesc = d.bubbleType === "spike" ? "呐喊气泡(spike bubble)"
      : d.bubbleType === "cloud" ? "思维气泡(thought bubble)"
      : d.bubbleType === "caption" ? "旁白框(caption box)"
      : "对话气泡(speech bubble)";
    const placement = d.anchorHint ? `，位置：${d.anchorHint}` : "";
    const speaker = d.speaker ? `【${d.speaker}】` : "";
    return `${bubbleDesc}${placement}，文字内容：「${speaker}${d.text}」`;
  });
  return `画面中需包含以下气泡/文字：${lines.join("；")}。文字必须清晰可读。`;
}

interface StylePresetData {
  style?: string;
  format?: string;
  promptKeywords?: string;
  imageSize?: string;
}

function buildPanelPrompt(
  visualPrompt: string,
  dialogues: DialogueEntry[],
  presetData: StylePresetData,
  characterDescs: string[] = [],
): string {
  // 1. 形态声明（中英双语，模型优先锚定风格）
  const formatEn = presetData.promptKeywords ?? "webtoon vertical strip panel, single frame, tall aspect ratio";
  const formatZh = FORMAT_ZH_KEYWORDS[presetData.format ?? "webtoon"] ?? FORMAT_ZH_KEYWORDS.webtoon;

  // 2. 画风声明
  const styleEn = presetData.style ?? "webtoon style, vibrant colors, clean lines";
  const styleZh = STYLE_ZH_KEYWORDS[presetData.style ?? ""] ?? "彩色韩漫风格，干净线条，鲜艳配色";

  // 3. 角色外貌锚定（有设计稿时作为次要文字补充，没有时是主要一致性保障）
  const charPart = characterDescs.length > 0
    ? `角色外貌设定：${characterDescs.join("；")}`
    : "";

  // 4. 对话/气泡
  const dialoguePart = buildDialoguePrompt(dialogues);

  // 顺序：形态 → 画风 → 角色外貌 → 场景内容 → 质量词 → 气泡
  const parts = [
    `${formatZh}，${formatEn}`,
    `${styleZh}，${styleEn}`,
  ];
  if (charPart) parts.push(charPart);
  parts.push(`画面内容：${visualPrompt}`);
  parts.push("high quality manga panel, professional illustration");
  if (dialoguePart) parts.push(dialoguePart);
  return parts.join(". ");
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
    const presetData = safeJsonParse<StylePresetData>(project.stylePreset, {});

    // 从 characterRefs 提取参考图路径、表情变体和视觉描述文字。
    const characterRefs = normalizeCharacterRefs(panel.characterRefs);
    const refImagePaths: string[] = [];
    const characterVisualDescs: string[] = [];
    if (characterRefs.length > 0) {
      const multiCharacterPanel = characterRefs.length > 1;
      for (const character of project.characters) {
        const ref = characterRefs.find((item) => item.name === character.name);
        if (!ref) continue;

        // 参考图：单角色用完整三视图，多角色同框用脸部裁切，表情稿可用时追加对应表情区域。
        const sheetData = safeJsonParse<{ status?: string }>(character.sheetData, {});
        if (sheetData.status === "done") {
          const primaryRef = multiCharacterPanel
            ? await comicCharacterImageService.resolveFaceRegionFile(character.id)
            : await comicCharacterImageService.resolveSheetFile(character.id);
          if (primaryRef) refImagePaths.push(primaryRef.filePath);
        }
        if (ref.expression) {
          const expressionRef = await comicCharacterImageService.resolveExpressionRegionFile(character.id, ref.expression);
          if (expressionRef) refImagePaths.push(expressionRef.filePath);
        }

        // visualAnchor 文字锚定（无论有无设计稿都注入，双重保障）
        const desc = character.visualAnchor?.trim()
          ? extractVisualAnchorDesc(character.visualAnchor)
          : "以角色参考图保持外貌一致";
        const refParts = [
          `【${character.name}】${desc}`,
          `服装:${ref.costume ?? "default"}`,
          `表情:${describeCharacterExpression(ref.expression ?? "neutral")}`,
        ];
        if (ref.lighting) refParts.push(`光照:${ref.lighting}`);
        characterVisualDescs.push(refParts.join("，"));
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
      const dialogues = safeJsonParse<DialogueEntry[]>(panel.dialogues, []);
      const prompt = buildPanelPrompt(panel.visualPrompt, dialogues, presetData, characterVisualDescs);
      const rawSize = presetData.imageSize ?? "1024x1536";
      const imageSize: ImageSize = (IMAGE_SIZES as readonly string[]).includes(rawSize)
        ? rawSize as ImageSize
        : "1024x1536";
      const uniqueRefImagePaths = Array.from(new Set(refImagePaths)).slice(0, 10);

      console.log(`[comic.image] generating panel=${panelId} order=${panel.order} provider=${provider} model=${model} size=${imageSize}`);
      console.log(`[comic.image] prompt: ${prompt}`);
      if (uniqueRefImagePaths.length > 0) {
        console.log(`[comic.image] refImagePaths(${uniqueRefImagePaths.length}): ${uniqueRefImagePaths.join(", ")}`);
      }

      const t0 = Date.now();
      const result = await generateImagesByProvider({
        sceneType: "chapter_illustration",
        provider,
        model,
        prompt,
        size: imageSize,
        count: 1,
        refImagePaths: uniqueRefImagePaths.length > 0 ? uniqueRefImagePaths : undefined,
      });
      const elapsed = Date.now() - t0;

      const imageUrl = result.images[0]?.url;
      if (!imageUrl) throw new Error("图片生成结果为空。");

      console.log(`[comic.image] done panel=${panelId} elapsed=${elapsed}ms`);

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
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[comic.image] error panel=${panelId}:`, errMsg);
      const errorData: PanelImageData = {
        status: "error",
        provider,
        version: nextVersion,
        error: errMsg,
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
