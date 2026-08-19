import fs from "fs/promises";
import path from "path";

import { prisma } from "../../db/prisma";
import { AppError } from "../../middleware/errorHandler";
import { resolveGeneratedImagesRoot } from "../../runtime/appPaths";
import {
  filterImageGenerationReferences,
  runImageGeneration,
  safeJsonParse,
  type ImageTargetAdapter,
} from "../image/runtime";
import {
  comicCharacterImageService,
  describeCharacterExpression,
  isCharacterExpressionId,
  type CharacterExpressionId,
} from "./ComicCharacterImageService";
import { resolveAssetFile } from "./ComicCharacterAssetService";
import { comicSpriteSheetService } from "./ComicSpriteSheetService";
import { resolveSceneFile, type SceneBible } from "./ComicSceneService";
import { IMAGE_SIZES, type ImageSize } from "../image/types";
import type { LLMProvider } from "@ai-novel/shared/types/llm";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PanelImageStatus = "idle" | "generating" | "done" | "error";

/** 生图实际使用的参考素材元数据（写入 imageData.referenceImages，供前端弹窗溯源展示） */
export interface PanelReferenceImageMeta {
  /** character_sheet=三视图 | character_expression=表情稿 | character_face=面部裁剪 | asset=角色资产 | scene=场景设定图 */
  kind: "character_sheet" | "character_expression" | "character_face" | "asset" | "scene";
  /** 展示用的人类可读标签，如 "白千羽 · 三视图" / "服装:战斗套装" / "场景:宗门大殿" */
  label: string;
  /** 可访问的 HTTP URL（前端可直接当 img src） */
  url: string;
}

export interface PanelImageData {
  status: PanelImageStatus;
  version?: number;
  url?: string;
  prompt?: string;
  provider?: string;
  generatedAt?: string;
  error?: string;
  /** 本次生图实际使用的参考素材（成功生成时写入；失败/未生图时不写） */
  referenceImages?: PanelReferenceImageMeta[];
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
  props?: string[];
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
    const rawProps = record.props;
    const props = Array.isArray(rawProps)
      ? (rawProps as unknown[]).filter((p): p is string => typeof p === "string" && p.trim().length > 0).map((p) => p.trim())
      : undefined;
    refs.push({
      name,
      costume: typeof record.costume === "string" && record.costume.trim() ? record.costume.trim() : "default",
      expression,
      lighting: typeof record.lighting === "string" && record.lighting.trim() ? record.lighting.trim() : undefined,
      props: props && props.length > 0 ? props : undefined,
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
  webtoon: "竖版条漫单格",
  four_koma: "四格漫画单格",
  page: "传统页漫单格",
  chibi_comic: "Q版萌漫单格",
  ink_comic: "水墨国风单格",
  drama_screenshot: "短剧截图风单格",
};

const STYLE_ZH_KEYWORDS: Record<string, string> = {
  webtoon_color:   "彩色韩漫风格，干净线条",
  bl_manga:        "彩色少女漫风格，柔和色调",
  shounen_bw:      "黑白少年漫风格，粗犷线条",
  ink_traditional: "水墨国风，淡彩晕染",
  chibi:           "Q版萌漫风格，圆润可爱",
  realistic:       "写实漫画风格，细腻光影",
};

// 九宫格方向 → 图像模型理解的位置描述
const ANCHOR_HINT_ZH: Record<string, string> = {
  "top-left":      "左上角",
  "top-center":    "上方居中",
  "top-right":     "右上角",
  "left-center":   "左侧",
  "center":        "居中",
  "right-center":  "右侧",
  "bottom-left":   "左下角",
  "bottom-center": "下方居中",
  "bottom-right":  "右下角",
};

const BUBBLE_TYPE_ZH: Record<string, string> = {
  round:   "圆形对话气泡",
  spike:   "尖角爆炸气泡（激动喊叫）",
  cloud:   "云朵思维气泡（内心独白）",
  caption: "矩形旁白框（叙述）",
};

/** 剥离 LLM 偶尔塞进 text 的说话人前缀（如"路远说：xxx"/"路远：xxx"/"「xxx」"），兼容历史数据 */
function stripSpeakerPrefix(text: string, speaker?: string): string {
  let cleaned = text.trim();
  // 1. 显式 "XX说：" / "XX道：" / "XX 说，"
  if (speaker) {
    const safeName = speaker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    cleaned = cleaned.replace(new RegExp(`^${safeName}\\s*[说道讲喊问]?\\s*[：:，,]\\s*`), "");
  }
  // 2. 任意中英文姓名 + 说/道/： （兜底，2-6 字汉字 + 标点）
  cleaned = cleaned.replace(/^[一-龥A-Za-z]{1,6}\s*[说道讲喊问]\s*[：:，,]?\s*/, "");
  cleaned = cleaned.replace(/^[一-龥A-Za-z]{1,6}\s*[：:]\s*/, "");
  // 3. 去掉首尾引号
  cleaned = cleaned.replace(/^[「『""'']+|[」』""'']+$/g, "");
  return cleaned.trim() || text.trim();
}

function buildDialoguePrompt(dialogues: DialogueEntry[]): string {
  if (dialogues.length === 0) return "";
  const lines = dialogues.map((d, i) => {
    const bubbleDesc = BUBBLE_TYPE_ZH[d.bubbleType ?? "round"] ?? "圆形对话气泡";
    const placement = d.anchorHint ? `位于${ANCHOR_HINT_ZH[d.anchorHint] ?? d.anchorHint}` : "";
    const speakerHint = d.speaker ? `（指向${d.speaker}）` : "";
    const cleanText = stripSpeakerPrefix(d.text, d.speaker);
    return `${i + 1}.${bubbleDesc}${placement ? "，" + placement : ""}${speakerHint}，台词：「${cleanText}」`;
  });
  return `对白气泡：${lines.join("；")}`;
}

const CROWD_DIVERSITY_PROMPT = [
  "群众/路人/背景人物约束：如果本格出现非命名群众、围观者、路人、弟子群、士兵群或其他背景人物，他们必须是非主角、非同脸模板",
  "每个群众人物在年龄、脸型、发型、服饰颜色、体型和站姿上要有清晰差异",
  "命名角色参考图只用于对应命名角色，不要把命名角色的脸、发型或服装复制到群众人物身上",
  "avoid repeated identical faces, cloned faces, same hairstyle, same outfit template, duplicated crowd members",
].join("；");

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
  sceneDesc = "",
  _hasSceneRefImage = false,
): string {
  const parts: string[] = [];

  // 1. 漫画形态与画风标定（精简词汇，不占用 SD/CLIP 77Token 关键预算）
  const formatEn = presetData.promptKeywords ?? "webtoon vertical strip panel, single frame";
  const formatZh = FORMAT_ZH_KEYWORDS[presetData.format ?? "webtoon"] ?? "竖版条漫单格";
  const styleEn = presetData.style ?? "webtoon style, clean lines";
  const styleZh = STYLE_ZH_KEYWORDS[presetData.style ?? ""] ?? "彩色韩漫风格";

  parts.push(`${formatZh}, ${formatEn}, ${styleZh}, ${styleEn}`);

  // 2. 场景环境视觉锚点
  if (sceneDesc) {
    parts.push(sceneDesc);
  }

  // 3. 角色外貌设定
  if (characterDescs.length > 0) {
    parts.push(`角色外貌设定：${characterDescs.join("；")}`);
  }

  // 4. 画面核心主体与动作镜头（核心视觉，优先响应）
  parts.push(`画面内容：${visualPrompt}`);

  // 5. 对白气泡标记（如有）
  const dialoguePart = buildDialoguePrompt(dialogues);
  if (dialoguePart) {
    parts.push(dialoguePart);
  }

  // 6. 质量词
  parts.push("masterpiece, high quality manga panel, professional illustration");
  return parts.join(". ");
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class ComicPanelImageService {
  /**
   * 为单格漫画格子生成图像。
   * - 从 ComicCharacter.sheetData 提取参考图（如有）
   * - 图存磁盘，路径写入 ComicPanel.imageData
   */
  private async buildPanelGenerationContext(panelId: string) {
    const panel = await prisma.comicPanel.findUnique({
      where: { id: panelId },
      include: {
        episode: {
          include: {
            project: {
              include: {
                characters: true,
                characterAssets: {
                  orderBy: [{ assetType: "asc" }, { sortOrder: "asc" }],
                },
                scenes: true,
              },
            },
          },
        },
      },
    });
    if (!panel) throw new AppError(`未找到漫画格子：${panelId}`, 404);
    if (!panel.visualPrompt) throw new AppError("该格子缺少 visualPrompt，无法生成图像。", 400);

    const project = panel.episode.project;
    const presetData = safeJsonParse<StylePresetData>(project.stylePreset, {});

    // 从 characterRefs 提取视觉描述文字（文字锚定，无论有无参考图都注入）
    const characterRefs = normalizeCharacterRefs(panel.characterRefs);
    const characterVisualDescs: string[] = [];
    const spriteCleanups: Array<() => Promise<void>> = [];

    // 最终参考图路径列表（雪碧图模式：每角色最多 1 张）
    const finalRefImagePaths: string[] = [];
    // 参考素材元数据（写入 imageData.referenceImages，供前端弹窗展示）
    const referenceMetas: PanelReferenceImageMeta[] = [];

    if (characterRefs.length > 0) {
      for (const character of project.characters) {
        const ref = characterRefs.find((item) => item.name === character.name);
        if (!ref) continue;

        // ── 文字描述锚定 ──────────────────────────────────────
        const desc = character.visualAnchor?.trim()
          ? extractVisualAnchorDesc(character.visualAnchor)
          : "以角色参考图保持外貌一致";
        const genderTag = character.gender === "male" ? "【男性】"
          : character.gender === "female" ? "【女性】"
          : character.gender === "other" ? "【中性气质】"
          : "";
        const refParts = [
          `${genderTag}【${character.name}】${desc}`,
          `服装:${ref.costume ?? "default"}`,
          `表情:${describeCharacterExpression(ref.expression ?? "neutral")}`,
        ];
        if (ref.lighting) refParts.push(`光照:${ref.lighting}`);
        if (ref.props?.length) refParts.push(`持有:${ref.props.join("、")}`);
        characterVisualDescs.push(refParts.join("，"));

        // ── 雪碧图参考图合成 ──────────────────────────────────
        const sheetData = safeJsonParse<{ status?: string }>(character.sheetData, {});
        const sheetRef = sheetData.status === "done"
          ? await comicCharacterImageService.resolveSheetFile(character.id)
          : null;

        // 对应服装资产（costume 不是 default 时查找对应资产图）
        const costumeAssets = project.characterAssets
          .filter((a) => a.characterId === character.id && a.assetType === "costume")
          .map((a) => ({ id: a.id, name: a.name }));

        // 按 props 名字匹配道具/武器资产
        const propNames = new Set(ref.props ?? []);
        const propAssets = project.characterAssets
          .filter((a) => a.characterId === character.id && a.assetType !== "costume" && propNames.has(a.name))
          .map((a) => ({ id: a.id, name: a.name, assetType: a.assetType as import("./ComicCharacterAssetService").CharacterAssetType }));

        // 有三视图或任意资产图才合成雪碧图
        const hasAnyAssetImage = costumeAssets.length > 0 || propAssets.length > 0;

        if (sheetRef || hasAnyAssetImage) {
          const usedCostume = ref.costume !== "default"
            ? costumeAssets.filter((a) => a.name === ref.costume)
            : costumeAssets.slice(0, 1);
          const spriteResult = await comicSpriteSheetService.buildSpriteSheet({
            characterId: character.id,
            characterName: character.name,
            sheetFilePath: sheetRef?.filePath,
            costumeAssets: usedCostume,
            propAssets,
          });
          if (spriteResult) {
            finalRefImagePaths.push(spriteResult.filePath);
            spriteCleanups.push(spriteResult.cleanup);
          } else if (sheetRef) {
            // 降级：只有三视图时直接用原图
            finalRefImagePaths.push(sheetRef.filePath);
          }

          // 记录素材元数据（按雪碧图实际组合的元素）
          if (sheetRef) {
            referenceMetas.push({
              kind: "character_sheet",
              label: `${character.name} · 三视图`,
              url: `/api/comic/character-images/${character.id}/sheet`,
            });
          }
          for (const a of usedCostume) {
            referenceMetas.push({
              kind: "asset",
              label: `${character.name} · 服装:${a.name}`,
              url: `/api/comic/character-assets/${a.id}/image`,
            });
          }
          for (const a of propAssets) {
            referenceMetas.push({
              kind: "asset",
              label: `${character.name} · ${a.name}`,
              url: `/api/comic/character-assets/${a.id}/image`,
            });
          }
        }
      }

      // 多角色同框时追加各自表情稿（辅助参考，不超过总上限）
      if (characterRefs.length > 1) {
        for (const character of project.characters) {
          const ref = characterRefs.find((item) => item.name === character.name);
          if (!ref?.expression) continue;
          const expressionRef = await comicCharacterImageService.resolveExpressionRegionFile(character.id, ref.expression);
          if (expressionRef) {
            finalRefImagePaths.push(expressionRef.filePath);
            referenceMetas.push({
              kind: "character_expression",
              label: `${character.name} · 表情:${describeCharacterExpression(ref.expression ?? "neutral")}`,
              url: `/api/comic/character-images/${character.id}/expressions`,
            });
          }
        }
      }
    }

    // 场景一致性：按 sceneRef 找场景 → 注入 bible 文字 + 设定图作为低权重第二参考图
    let sceneDesc = "";
    let hasSceneRefImage = false;
    if (panel.sceneRef) {
      const scene = project.scenes.find((s) => s.name === panel.sceneRef);
      if (scene) {
        const bible = safeJsonParse<SceneBible>(scene.bible, {});
        const keyParts: string[] = [];
        if (bible.palette) keyParts.push(`色调:${bible.palette}`);
        if (bible.keyElements) keyParts.push(`元素:${bible.keyElements}`);
        if (bible.ambiance) keyParts.push(`氛围:${bible.ambiance}`);
        const conciseDesc = keyParts.slice(0, 2).join("，");
        sceneDesc = conciseDesc ? `场景【${scene.name}】（${conciseDesc}）` : `场景【${scene.name}】`;
        // L1：设定图作为参考图（仅当已生成）
        const sceneSheet = safeJsonParse<{ status?: string }>(scene.sheetData, {});
        if (sceneSheet.status === "done") {
          const sceneRef = await resolveSceneFile(scene.id);
          if (sceneRef) {
            finalRefImagePaths.push(sceneRef.filePath);
            hasSceneRefImage = true;
            referenceMetas.push({
              kind: "scene",
              label: `场景:${scene.name}`,
              url: `/api/comic/scenes/${scene.id}/image`,
            });
          }
        }
      }
    }

    const dialogues = safeJsonParse<DialogueEntry[]>(panel.dialogues, []);
    const prompt = buildPanelPrompt(panel.visualPrompt, dialogues, presetData, characterVisualDescs, sceneDesc, hasSceneRefImage);
    const rawSize = presetData.imageSize ?? "1024x1536";
    const imageSize: ImageSize = (IMAGE_SIZES as readonly string[]).includes(rawSize)
      ? rawSize as ImageSize
      : "1024x1536";
    const uniqueRefImagePaths = Array.from(new Set(finalRefImagePaths)).slice(0, 4);

    const adapter: ImageTargetAdapter<PanelImageData> = {
      kind: `comic.panel:${panelId}`,
      loadState: async () => safeJsonParse<PanelImageData>(panel.imageData, { status: "idle" }),
      saveState: async (next) => {
        await prisma.comicPanel.update({ where: { id: panelId }, data: { imageData: JSON.stringify(next) } });
      },
      diskPath: (ext) => path.join(comicPanelDir(panelId), `panel.${ext}`),
      publicUrl: () => panelImageUrl(panelId),
      cleanupOtherExts: (keepExt) => cleanOldPanelFiles(panelId, keepExt),
    };

    return {
      adapter,
      prompt,
      size: imageSize,
      refImagePaths: uniqueRefImagePaths,
      referenceImages: referenceMetas,
      title: `生成第 ${panel.order} 格图像`,
      cleanup: async () => {
        await Promise.allSettled(spriteCleanups.map((fn) => fn()));
      },
    };
  }

  async preparePanelImage(
    panelId: string,
    provider: LLMProvider = DEFAULT_PROVIDER,
  ): Promise<import("../image/runtime").ImageGenerationPreview> {
    const ctx = await this.buildPanelGenerationContext(panelId);
    try {
      return {
        kind: ctx.adapter.kind,
        title: ctx.title,
        prompt: ctx.prompt,
        referenceImages: ctx.referenceImages,
        provider,
        size: ctx.size,
      };
    } finally {
      await ctx.cleanup();
    }
  }

  async generatePanelImage(
    panelId: string,
    provider: LLMProvider = DEFAULT_PROVIDER,
    overrides?: import("../image/runtime").ImageGenerationOverrides,
  ): Promise<PanelImageData> {
    const ctx = await this.buildPanelGenerationContext(panelId);
    try {
      const refs = filterImageGenerationReferences({
        refImagePaths: ctx.refImagePaths,
        referenceImages: ctx.referenceImages,
        excludedReferenceImageUrls: overrides?.excludedReferenceImageUrls,
      });
      return await runImageGeneration(ctx.adapter, {
        provider: overrides?.providerOverride ?? provider,
        prompt: overrides?.promptOverride ?? ctx.prompt,
        size: overrides?.sizeOverride ?? ctx.size,
        refImagePaths: refs.refImagePaths,
        referenceImages: refs.referenceImages && refs.referenceImages.length > 0 ? refs.referenceImages : undefined,
      });
    } finally {
      await ctx.cleanup();
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
