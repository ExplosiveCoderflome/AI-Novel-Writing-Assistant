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
  densityLevel: z.enum(["low", "medium", "high"]).default("medium"),
  focus: z.string().trim().min(1).max(120),
  action: z.string().trim().min(1).max(200),
  dialogues: z.array(dialogueSchema).max(3).default([]),
  characterRefs: z.array(panelCharacterRefSchema).max(5).default([]),
  // 发给图像模型的画面提示词（不含气泡文字）
  visualPrompt: z.string().trim().min(1).max(400),
  layoutData: z
    .object({
      layout: z.enum(["single", "four_koma"]).default("single"),
      subPanels: z
        .array(z.object({
          order: z.number().int().min(1).max(4),
          beat: z.enum(["起", "承", "转", "合"]),
          visualPrompt: z.string().trim().min(1).max(180),
        }))
        .max(4)
        .optional(),
    })
    .optional(),
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
  /** stylePreset.promptKeywords，注入每格 visualPrompt 前缀以锁定画风 */
  stylePromptKeywords?: string;
  /** stylePreset.format，影响 visualPrompt 结构（4koma 需显式描述4子格） */
  comicFormat?: string;
  /** 跨话一致性事实 */
  factDigest?: string;
  /** 分格信息密度：relaxed=舒展，balanced=均衡，compact=紧凑 */
  densityMode?: "relaxed" | "balanced" | "compact";
  /** 用户本次补充的分格要求，只能影响表达偏好，不得覆盖结构化输出规则 */
  scriptPromptInstruction?: string;
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
    const stylePrefix = input.stylePromptKeywords
      ?? (input.stylePreset ? `${input.stylePreset} style` : "webtoon style, vibrant colors, clean lines");

    const is4koma = input.comicFormat === "4koma";
    const densityMode = input.densityMode ?? "balanced";
    const densityRuleMap: Record<NonNullable<ComicPanelScriptPromptInput["densityMode"]>, string> = {
      relaxed:
        "信息密度模式：舒展。优先情绪反应、单一动作和清晰留白；多数格只放 1 个视觉焦点、0-1 句对白、1-2 名角色，少用复杂背景。每 5-8 格安排一个低密度情绪缓冲。",
      balanced:
        "信息密度模式：均衡。大多数格承载 1 个动作或情绪转折、1-2 名角色、1-2 句对白；关键冲突格可提高背景和人物数量，但不要连续堆满。",
      compact:
        "信息密度模式：紧凑。允许更多剧情推进和同框信息，但每格仍只能有一个主视觉焦点；高密度格最多 3 句对白、2-4 名角色，并避免 3 个以上高密度格连续出现。",
    };
    const visualPromptRule = is4koma
      ? `9. visualPrompt 必须以风格前缀「${stylePrefix}」开头，然后按四格结构显式描述每个子格内容，格式：
   Panel1:[起] <画面内容>. Panel2:[承] <画面内容>. Panel3:[转] <画面内容>. Panel4:[合] <画面内容>.
   每格描述独立，镜头/情绪/内容必须有明显差异，不要重复相近画面。四格合计信息量 > 单格3倍以上。`
      : `9. visualPrompt 必须以固定风格前缀「${stylePrefix}」开头，然后再描述画面内容（出场角色、服装、表情、场景、构图），不含气泡文字`;

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
7. densityLevel 必须取 low/medium/high：low=情绪反应或留白，medium=常规推进，high=场景交代/冲突爆发/多人同框
8. focus 用一句话说明本格主视觉焦点，不能写空泛总结
${visualPromptRule}
10. ${densityRuleMap[densityMode]}
11. 画风：${input.stylePreset ?? "彩色韩漫"}`,
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
${input.scriptPromptInstruction ? `## 本次分格补充要求\n${input.scriptPromptInstruction}\n` : ""}
## 任务
生成约 ${panelTarget} 格的完整分格脚本，返回 panels 数组。
每格包含：order / panelType / densityLevel / focus / action / dialogues / characterRefs / visualPrompt / layoutData。
characterRefs 示例：[{ "name": "沈剑心", "costume": "default", "expression": "cold", "lighting": "side_lit" }]。
四格模式下 layoutData 示例：{ "layout": "four_koma", "subPanels": [{ "order": 1, "beat": "起", "visualPrompt": "..." }] }。
保持情节连贯，镜头语言丰富，对白精炼，最后一格留悬念。`,
      ),
    ];
  },
};
