import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";

// ─── 分话规划 ───────────────────────────────────────────────────────────────

export const comicEpisodeOutlineOutputSchema = z.object({
  episodes: z.array(z.object({
    order: z.number().int().min(1),
    title: z.string().trim().min(1).max(30),
    synopsis: z.string().trim().min(10).max(300),
    hookType: z.string().trim().optional(),
    cliffhanger: z.string().trim().max(100).optional(),
    isPaywalled: z.boolean().default(false),
    sourceChapterStart: z.number().int().min(1).optional(),
    sourceChapterEnd: z.number().int().min(1).optional(),
  })).min(1).max(40),
});

export type ComicEpisodeOutlineOutput = z.infer<typeof comicEpisodeOutlineOutputSchema>;

export interface ComicEpisodeOutlinePromptInput {
  title: string;
  synopsis: string;
  beatsDigest: string;
  startOrder: number;
  endOrder: number;
  paywallOrders: number[];
  hookLibrary: string;
  stylePreset?: string;
}

export const comicEpisodeOutlinePrompt: PromptAsset<
  ComicEpisodeOutlinePromptInput,
  ComicEpisodeOutlineOutput
> = {
  id: "comic.episodeOutline",
  version: "v1",
  taskType: "outline_planning",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 7000 },
  outputSchema: comicEpisodeOutlineOutputSchema,
  render(input) {
    return [
      new SystemMessage(
        `你是专业的漫画（条漫/漫剧）内容策划，擅长将小说/原创故事改编为按集发布的竖屏漫画。
每话目标：30-80 格，开场有钩子，结尾有悬念/卡点，情绪曲线完整。
画风参考：${input.stylePreset ?? "彩色韩漫"}。`,
      ),
      new HumanMessage(
        `请为漫画项目「${input.title}」规划第 ${input.startOrder}-${input.endOrder} 话的分话大纲。

## 内容梗概
${input.synopsis}

## 情节节拍摘要
${input.beatsDigest}

## 约束
- 卡点集号（isPaywalled=true）：${input.paywallOrders.length > 0 ? input.paywallOrders.join("、") : "无"}
- 开场钩子类型库（hookType 从此选取）：
${input.hookLibrary}

## 输出格式
返回 episodes 数组，每条包含：order / title / synopsis / hookType / cliffhanger / isPaywalled / sourceChapterStart / sourceChapterEnd。
按 order 升序，保持情节连贯性，悬念集中在 isPaywalled 集前后。`,
      ),
    ];
  },
};

// ─── 分格脚本生成 ──────────────────────────────────────────────────────────

const dialogueSchema = z.object({
  speaker: z.string().trim().min(1),
  text: z.string().trim().min(1).max(60),
  // round=对白圆泡 spike=呐喊刺泡 cloud=思维云泡 caption=旁白矩形
  bubbleType: z.enum(["round", "spike", "cloud", "caption"]).default("round"),
  // 九宫格 + 方向，如 top-left / bottom-center / right-center
  anchorHint: z.string().trim().optional(),
});

const characterExpressionSchema = z.enum(["neutral", "happy", "angry", "sad", "surprised", "cold"]);

const panelCharacterRefSchema = z.object({
  name: z.string().trim().min(1),
  // default=常服；后续服装设计稿生成后可扩展 combat/formal/casual
  costume: z.enum(["default", "combat", "formal", "casual"]).default("default"),
  expression: characterExpressionSchema.default("neutral"),
  lighting: z.string().trim().max(40).optional(),
});

const panelScriptSchema = z.object({
  order: z.number().int().min(1),
  panelType: z.enum(["establishing", "close_up", "action", "reaction", "transition"]),
  action: z.string().trim().min(1).max(200),
  dialogues: z.array(dialogueSchema).max(3).default([]),
  characterRefs: z.array(panelCharacterRefSchema).max(5).default([]),
  // 发给图像模型的画面提示词（不含气泡文字）
  visualPrompt: z.string().trim().min(1).max(400),
});

export const comicPanelScriptOutputSchema = z.object({
  panels: z.array(panelScriptSchema).min(10).max(80),
});

export type ComicPanelScriptOutput = z.infer<typeof comicPanelScriptOutputSchema>;

export interface ComicPanelScriptPromptInput {
  projectTitle: string;
  episodeOrder: number;
  episodeTitle: string;
  episodeSynopsis: string;
  sourceText?: string;
  characters: Array<{ name: string; visualAnchor?: string | null }>;
  stylePreset?: string;
  /** 跨话一致性事实 */
  factDigest?: string;
  targetPanelCount?: number;
}

export const comicPanelScriptPrompt: PromptAsset<
  ComicPanelScriptPromptInput,
  ComicPanelScriptOutput
> = {
  id: "comic.panelScript",
  version: "v1",
  taskType: "chapter_drafting",
  mode: "structured",
  language: "zh",
  contextPolicy: { maxTokensBudget: 9000 },
  outputSchema: comicPanelScriptOutputSchema,
  render(input) {
    const panelTarget = input.targetPanelCount ?? 45;
    const characterList = input.characters
      .map((c) => `- ${c.name}：${c.visualAnchor ?? "（暂无视觉描述）"}`)
      .join("\n");

    return [
      new SystemMessage(
        `你是资深漫画分镜师，专注竖屏条漫/漫剧（webtoon 形态）。
职责：将一话大纲拆分为 ${panelTarget} 格左右的逐格分镜脚本。
规则：
1. 每格画面只聚焦一个动作/情绪，镜头语言多样（establishing/close_up/action/reaction/transition）
2. 对白每泡 ≤30 字，每格最多 3 个气泡；思维内容用 cloud 泡，旁白用 caption
3. anchorHint 指定气泡位置（top-left/top-right/bottom-center 等），避开主体
4. characterRefs 必须为对象数组：{ name, costume, expression, lighting? }
5. expression 只能取 neutral/happy/angry/sad/surprised/cold；根据该格对白情绪、动作和镜头目的选择，不要靠固定词替换
6. costume 默认 default；只有剧情明确换装时才使用 combat/formal/casual
7. visualPrompt 仅描述画面内容（不含文字/气泡），包含画风关键词、出场角色、服装和表情
8. 画风：${input.stylePreset ?? "彩色韩漫"}`,
      ),
      new HumanMessage(
        `漫画项目：${input.projectTitle}
本话：第 ${input.episodeOrder} 话《${input.episodeTitle}》

## 本话情节大纲
${input.episodeSynopsis}

${input.sourceText ? `## 本话原文（对白来源）\n${input.sourceText.slice(0, 3000)}\n` : ""}
## 出场角色
${characterList}

${input.factDigest ? `## 跨话一致性事实（请严格遵守）\n${input.factDigest}\n` : ""}
## 任务
生成约 ${panelTarget} 格的完整分格脚本，返回 panels 数组。
每格包含：order / panelType / action / dialogues / characterRefs / visualPrompt。
characterRefs 示例：[{ "name": "沈剑心", "costume": "default", "expression": "cold", "lighting": "side_lit" }]。
保持情节连贯，镜头语言丰富，对白精炼，最后一格留悬念。`,
      ),
    ];
  },
};
