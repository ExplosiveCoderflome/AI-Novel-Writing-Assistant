import type { BaseMessage } from "@langchain/core/messages";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { PromptAsset } from "../../core/promptTypes";
import type { TitlePromptContext } from "../../../services/title/titleGeneration.shared";
import {
  maximumFrameClusterSize,
  minimumStructuralVariety,
  minimumStyleVariety,
} from "../../../services/title/titleGeneration.shared";
import { titleGenerationRawOutputSchema } from "./titleGeneration.promptSchemas";

export interface TitleGenerationPromptInput {
  context: TitlePromptContext;
  forceJson: boolean;
  retryReason: string | null;
}

function resolveModeLabel(mode: TitlePromptContext["mode"]): string {
  switch (mode) {
    case "adapt":
      return "参考标题改写";
    case "novel":
      return "基于项目上下文生成";
    default:
      return "自由标题工坊";
  }
}

function buildModeInstruction(input: TitlePromptContext): string {
  switch (input.mode) {
    case "adapt":
      return "你要学习参考标题的信息密度、节奏和钩子组织方式，但绝不能照抄词组、句式骨架或核心设定。";
    case "novel":
      return "你要围绕当前项目的题材基底、简介和现有标题，生成一组更适合点击测试的候选。当前标题只能作为避重参考，不能做同义改写。";
    default:
      return "你要围绕创作简报直接产出可用于筛选的标题池，突出题材卖点和点击冲动，而不是复述剧情。";
  }
}

function buildDiversityInstruction(count: number): string {
  return [
    `至少覆盖 ${minimumStyleVariety(count)} 种 style。`,
    `至少覆盖 ${minimumStructuralVariety(count)} 种句式框架。`,
    `同一种句式框架最多出现 ${maximumFrameClusterSize(count)} 个标题。`,
    "句式框架要主动拉开，例如：X，我Y / 在X，我Y / X：Y / 当X / 我X，Y / 纯陈述句。",
  ].join("");
}

function buildRetryInstruction(retryReason: string | null | undefined): string {
  if (!retryReason) {
    return "";
  }
  return `\n上一次输出存在问题：${retryReason}。这一次必须先修正问题，再返回最终 JSON。`;
}

function buildTitleGenerationMessages(
  input: TitlePromptContext,
  options: {
    forceJson?: boolean;
    retryReason?: string | null;
  } = {},
): BaseMessage[] {
  const forceJsonInstruction = options.forceJson
    ? "\n当前模型支持稳定 JSON 输出，请直接返回 JSON 对象本体。"
    : "";

  return [
    new SystemMessage(`你是中文网文平台的资深标题策划。你的目标不是写“文艺名字”，而是输出一组适合封面展示、点击测试和投放筛选的小说标题候选。

【唯一任务】
只返回高质量标题池，不解释创作过程，不输出 Markdown，不输出代码块。

【输出格式】
只能返回一个 JSON 对象，结构固定如下：
{
  "titles": [
    {
      "title": "标题",
      "clickRate": 83,
      "style": "literary|conflict|suspense|high_concept",
      "hookType": "identity_gap|abnormal_situation|power_mutation|rule_hook|direct_conflict|high_concept",
      "angle": "8字内卖点角度",
      "reason": "一句话说明为什么有人会点开"
    }
  ]
}

【字段要求】
1. 必须恰好输出 ${input.count} 个标题，不多不少。
2. title 必须像中文网文书名，适合封面展示，不要写成简介句、栏目名或世界观说明。
3. 标题建议 6-16 个汉字，最长不超过 20 个字符。
4. clickRate 使用 35-99 的整数，表示主观点击预估分。
5. style 只允许使用：literary / conflict / suspense / high_concept。
6. hookType 表示标题主钩子机制，只允许使用：identity_gap / abnormal_situation / power_mutation / rule_hook / direct_conflict / high_concept。
7. angle 用 4-20 个字概括这一条标题主打的唯一切入角度。
8. reason 用 8-40 个字说明标题为什么能成立，重点说“点击理由”，不要复述剧情。
9. 禁止输出任何额外字段。

【质量要求】
1. 每个标题都要让读者一眼看出题材方向和主卖点。
2. 至少 30% 的标题要有明显反差、优势、异常规则或稀缺资源感。
3. 至少 2 个标题不要机械复用用户原始关键词，要换一个更强的切入角度。
4. 如果输入卖点不够锐利，你必须主动放大“主角优势 / 规则异常 / 稀缺资源 / 倒计时压力”，再生成标题。
5. 不要把所有标题都写成单一“求生困境”，必须同时覆盖“压力型”和“掌控型”标题。

【多样性规则】
1. ${buildDiversityInstruction(input.count)}
2. 严禁只换近义词、只换一个名词，或在同一标题骨架上做轻微改写。
3. 不允许连续多个标题使用同一开头、同一标点骨架或同一反差结构。
4. 冒号标题可以有，但不能刷屏；逗号反差句也不能刷屏。

【模式理解】
${buildModeInstruction(input)}
${buildRetryInstruction(options.retryReason)}${forceJsonInstruction}`),
    new HumanMessage(`任务输入
- 模式：${resolveModeLabel(input.mode)}
- 目标数量：${input.count}
- 当前项目名：${input.novelTitle || "未提供"}
- 当前工作标题：${input.currentTitle || "无"}
- 创作简报：
${input.brief || "未提供"}
- 参考标题：${input.referenceTitle || "无"}
- 题材基底：${input.genreName || "未指定"}
- 题材说明：${input.genreDescription || "无"}

额外提醒：
- 如果提供了参考标题，只能学习其信息组织和节奏，不能照抄词组、不能复刻句式骨架。
- 如果材料不完整，宁可保守，也不要输出题材明显错位的标题。`),
  ];
}

export const titleGenerationPrompt: PromptAsset<
  TitleGenerationPromptInput,
  typeof titleGenerationRawOutputSchema._output
> = {
  id: "title.generation",
  version: "v1",
  taskType: "planner",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: titleGenerationRawOutputSchema,
  render: (input) => buildTitleGenerationMessages(input.context, {
    forceJson: input.forceJson,
    retryReason: input.retryReason,
  }),
};
