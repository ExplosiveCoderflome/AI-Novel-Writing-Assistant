import type { BaseMessage } from "@langchain/core/messages";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { TitlePromptContext } from "./titleGeneration.shared";
import { minimumStyleVariety } from "./titleGeneration.shared";

function resolveModeLabel(mode: TitlePromptContext["mode"]): string {
  switch (mode) {
    case "adapt":
      return "参考标题改编";
    case "novel":
      return "项目上下文生成";
    default:
      return "自由标题工坊";
  }
}

function buildModeInstruction(input: TitlePromptContext): string {
  switch (input.mode) {
    case "adapt":
      return "你要学习参考标题的节奏、信息密度、悬念组织和卖点表达，但不得照抄核心词组，不得输出肉眼可见的近似标题。";
    case "novel":
      return "你要基于当前项目的标题、简介和类型，产出一组更能打的候选。当前标题只能作为避重参考，不能做简单同义改写。";
    default:
      return "你要围绕创作简报直接产出一组可用于筛选的标题候选，突出题材卖点，而不是复述剧情。";
  }
}

function buildDiversityInstruction(count: number): string {
  if (count >= 12) {
    return "至少覆盖 4 种 style；至少 3 个冲突型、2 个悬念型、2 个高概念型、2 个文学感型，其余可自由分配。";
  }
  if (count >= 8) {
    return "至少覆盖 4 种 style；任一单一 style 不得超过总数的 50%。";
  }
  return `至少覆盖 ${minimumStyleVariety(count)} 种 style；任一单一 style 不得超过总数的 50%。`;
}

function buildRetryInstruction(retryReason: string | null | undefined): string {
  if (!retryReason) {
    return "";
  }
  return `\n上一次输出存在问题：${retryReason}。这一次必须先修正问题，再输出最终 JSON。`;
}

export function buildTitleGenerationMessages(
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
    new SystemMessage(`你是中文网文标题总策划，擅长为网络小说生成可直接用于封面和投放测试的标题池。

你的唯一任务是交付一组高质量标题候选，不要解释过程。

输出要求：
1. 只能返回一个 JSON 对象，不要返回 Markdown、说明文字或代码块。
2. JSON 结构固定如下：
{
  "titles": [
    {
      "title": "标题",
      "clickRate": 0,
      "style": "literary|conflict|suspense|high_concept",
      "angle": "卖点角度",
      "reason": "为什么会吸引读者"
    }
  ]
}
3. 必须输出恰好 ${input.count} 个标题，不多不少。
4. style 只能使用 literary、conflict、suspense、high_concept 四种枚举值。
5. 标题要像中文小说书名，不像剧情简介、口号或营销文案；建议 6-18 个汉字，最多 22 个字符。
6. clickRate 使用 35-99 的主观预估分，用于粗排。
7. angle 用 4-10 个字概括卖点角度；reason 用一句话解释吸引力。
8. 结果必须符合主流价值观，避免低俗、违规、侵权和恶意蹭热表达。

标题策略：
- 同时吸收主流网文平台里有效的两类机制：世界观/规则/命运/序列/禁域等厚重名词，以及身份反差/处境异常/能力异变/冲突前置等强钩子表达。
- 每个标题只打一个主卖点，不要把完整剧情塞进标题。
- 优先使用能快速建立阅读预期的强名词、身份词、设定词和冲突词。
- 标题必须贴合给定题材与简报，不要编造和输入无关的大设定。
- 避免陈旧套路词：赘婿、战神、兵王、冷艳总裁。
- 避免短视频口播腔、感叹号堆砌、数字滥用和英文模板腔。

多样性与去重规则：
- 严禁完全重复，也严禁只改一两个字的近似标题。
- 连续两个标题不得共享同一开头词或同一套核心结构。
- 使用冒号的标题不超过 40%。
- 问句、反转句、直陈句、高概念名词句、身份反差句要交叉分布。
- ${buildDiversityInstruction(input.count)}
- 至少 30% 标题突出直接冲突或身份反差，至少 20% 标题突出悬念，至少 20% 标题突出设定或世界观。
- 至少保留 2 个不直接复用用户原词的原创表达。

模式要求：
${buildModeInstruction(input)}

在输出前，先在内部规划好风格分布和句式分布，再一次性输出最终 JSON。${buildRetryInstruction(options.retryReason)}${forceJsonInstruction}`),
    new HumanMessage(`任务输入
- 模式：${resolveModeLabel(input.mode)}
- 目标数量：${input.count}
- 当前项目名：${input.novelTitle || "未提供"}
- 当前工作标题：${input.currentTitle || "无"}
- 创作简报：
${input.brief || "未提供"}
- 参考标题：${input.referenceTitle || "无"}
- 类型：${input.genreName || "未指定"}
- 类型说明：${input.genreDescription || "无"}

额外提醒：
- 如果资料不完整，宁可保守，也不要输出和题材明显错位的标题。
- 如果提供了参考标题，你只能学习结构与节奏，不能抄词。`),
  ];
}
