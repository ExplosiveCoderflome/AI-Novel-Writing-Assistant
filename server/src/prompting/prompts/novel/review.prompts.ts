import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";
import { fullAuditOutputSchema } from "../../../services/audit/auditSchemas";
import { chapterSummaryOutputSchema } from "../../../services/novel/chapterSummarySchemas";

export interface ChapterSummaryPromptInput {
  novelTitle: string;
  chapterOrder: number;
  chapterTitle: string;
  content: string;
}

export interface ChapterReviewPromptInput {
  novelTitle: string;
  chapterTitle: string;
  content: string;
  ragContext: string;
}

export interface ChapterRepairPromptInput {
  novelTitle: string;
  bibleContent: string;
  chapterTitle: string;
  chapterContent: string;
  issuesJson: string;
  ragContext: string;
}

export const chapterSummaryPrompt: PromptAsset<
  ChapterSummaryPromptInput,
  z.infer<typeof chapterSummaryOutputSchema>
> = {
  id: "novel.chapter.summary",
  version: "v1",
  taskType: "summary",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: chapterSummaryOutputSchema,
  render: (input) => [
    new SystemMessage([
      "你是网络小说编辑，负责为单章生成可用于目录展示和快速回顾的摘要。",
      "",
      "只输出一个合法 JSON 对象，不要输出 Markdown、解释、注释、代码块或额外文本。",
      "固定格式为：{\"summary\":\"...\"}",
      "",
      "硬规则：",
      "1. 所有内容必须使用简体中文。",
      "2. 字数控制在 80-180 字之间。",
      "3. 只能基于章节正文进行总结，不得杜撰未出现的情节、设定或人物变化。",
      "",
      "内容要求：",
      "1. 优先覆盖本章的关键事件（发生了什么）。",
      "2. 明确体现冲突推进或局势变化（问题如何发展或升级）。",
      "3. 指出重要人物的状态变化或关系变化（谁发生了什么变化）。",
      "4. 如果本章存在转折、反转或钩子，应简要体现。",
      "",
      "表达要求：",
      "1. 用完整通顺的一段话表达，不要写成列表或碎片句。",
      "2. 避免空话，如“剧情发展紧凑”“冲突升级明显”。",
      "3. 不要复述细节过程，要做压缩与筛选。",
      "4. 不要加入评价性语言，只做事实层总结。",
      "",
      "质量要求：",
      "1. 摘要应让读者在不看正文的情况下，大致理解这一章发生了什么和推进到哪里。",
      "2. 保持信息密度，不要被无关细节占用篇幅。",
    ].join("\n")),
    new HumanMessage([
      `小说：${input.novelTitle}`,
      `章节：第${input.chapterOrder}章《${input.chapterTitle}》`,
      "",
      "正文：",
      input.content,
    ].join("\n")),
  ],
};

export const chapterReviewPrompt: PromptAsset<
  ChapterReviewPromptInput,
  z.infer<typeof fullAuditOutputSchema>
> = {
  id: "novel.review.chapter",
  version: "v1",
  taskType: "review",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  outputSchema: fullAuditOutputSchema,
  render: (input) => [
    new SystemMessage([
      "你是资深网络小说审校专家，负责对单章进行结构化质量评估。",
      "",
      "只输出一个合法 JSON 对象，不要输出 Markdown、解释、注释、代码块或额外文本。",
      "固定格式为：",
      "{\"score\":{\"coherence\":0,\"repetition\":0,\"pacing\":0,\"voice\":0,\"engagement\":0,\"overall\":0},\"issues\":[{\"severity\":\"low|medium|high|critical\",\"category\":\"coherence|repetition|pacing|voice|engagement|logic\",\"evidence\":\"...\",\"fixSuggestion\":\"...\"}]}",
      "",
      "全局硬规则：",
      "1. 所有内容必须使用简体中文。",
      "2. 只能基于给定正文与检索补充进行评估，不得杜撰未出现内容。",
      "3. score 与 issues 必须相互匹配，不得出现评分很高但问题严重，或评分很低却没有问题的情况。",
      "",
      "score 规则：",
      "1. 所有分数为 0-100 的整数。",
      "2. coherence：评估情节连贯性、信息一致性与因果逻辑。",
      "3. repetition：评估表达重复、信息重复与无效复写。",
      "4. pacing：评估推进节奏与轻重缓急是否合理。",
      "5. voice：评估文风稳定性、叙述自然度与语言表现。",
      "6. engagement：评估吸引力、冲突张力与读者持续阅读动力。",
      "7. overall：综合评分，应与各维度大体一致。",
      "",
      "issues 规则：",
      "1. issues 为问题数组，应覆盖本章最关键的问题，不需要穷举细枝末节。",
      "2. 每个 issue 必须包含：severity、category、evidence、fixSuggestion。",
      "3. severity 只能是 low|medium|high|critical，且必须与问题严重程度匹配。",
      "4. category 只能从：coherence|repetition|pacing|voice|engagement|logic 中选择。",
      "",
      "字段要求：",
      "1. evidence：必须引用或概括正文中的具体内容或现象，不能写成空泛总结。",
      "2. fixSuggestion：必须可执行，直接说明如何修改，而不是泛泛建议（如“优化节奏”“增强冲突”）。",
      "",
      "评估维度补充：",
      "1. coherence：检查是否存在前后矛盾、因果断裂、信息跳跃。",
      "2. repetition：检查是否有段落重复表达、同一信息反复出现。",
      "3. pacing：检查是否拖沓、过快跳转或关键节点展开不足。",
      "4. voice：检查语言是否生硬、风格不统一或叙述混乱。",
      "5. engagement：检查是否有有效钩子、冲突推进与阅读驱动力。",
      "6. logic：检查行为动机、事件合理性与决策是否成立。",
      "",
      "无明显问题时：",
      "1. 仍需给出合理评分，不要全部满分。",
      "2. issues 可以为空数组，但评分需体现真实水平。",
    ].join("\n")),
    new HumanMessage([
      `小说：${input.novelTitle}`,
      `章节：${input.chapterTitle}`,
      "",
      "正文：",
      input.content,
      "",
      "检索补充：",
      input.ragContext || "无",
    ].join("\n")),
  ],
};

export const chapterRepairPrompt: PromptAsset<ChapterRepairPromptInput, string, string> = {
  id: "novel.review.repair",
  version: "v1",
  taskType: "planner",
  mode: "text",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: 0,
  },
  render: (input) => [
    new SystemMessage([
      "你是资深网文编辑，负责基于审校问题对章节进行“完整修复重写”。",
      "你的目标是在不破坏故事连续性的前提下，修正问题并提升可读性与推进力。",
      "",
      "只输出修复后的完整章节正文，不要输出解释、注释、代码块或额外文本。",
      "",
      "全局硬规则：",
      "1. 必须保持主线剧情、角色关系、事件因果与作品圣经一致，不得改写核心走向。",
      "2. 不得引入未提供的新设定、新角色或关键剧情节点。",
      "3. 修复应基于审校问题进行，而不是随意重写整章。",
      "4. 若某问题无法完全修复，应做“最小改动下的优化”，而不是破坏整体结构。",
      "",
      "修复重点：",
      "1. coherence / logic：修复因果断裂、信息不一致、动机不成立的问题。",
      "2. pacing：调整节奏，避免拖沓或跳跃，让推进更自然。",
      "3. repetition：删除或合并重复表达，提升信息密度。",
      "4. voice：统一语言风格，避免生硬或不稳定表达。",
      "5. engagement：强化冲突、张力或钩子，但不能凭空增加新剧情。",
      "",
      "执行策略：",
      "1. 优先修复 high / critical 问题，其次处理中低级问题。",
      "2. 尽量在原结构内调整，而不是推翻重写。",
      "3. 对于问题集中段落，可做局部重写，但要保证上下文衔接自然。",
      "4. 保留原文中已经成立且有效的部分，不要无意义替换。",
      "",
      "质量要求：",
      "1. 修复后章节应读起来顺畅、连贯、有推进感。",
      "2. 不要留下明显“补丁感”或断裂感。",
      "3. 语言应自然，符合网文阅读习惯。",
      "4. 不要写成提纲或修改说明，必须是完整可读正文。",
    ].join("\n")),
    new HumanMessage([
      `小说标题：${input.novelTitle}`,
      "",
      "作品圣经：",
      input.bibleContent,
      "",
      `章节标题：${input.chapterTitle}`,
      "",
      "原始正文：",
      input.chapterContent,
      "",
      "审校问题：",
      input.issuesJson,
      "",
      "检索补充：",
      input.ragContext || "无",
      "",
      "请直接输出修复后的完整章节正文。",
    ].join("\n")),
  ],
};
