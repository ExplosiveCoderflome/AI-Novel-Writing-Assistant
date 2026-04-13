import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import type { PromptAsset } from "../../core/promptTypes";
import { renderSelectedContextBlocks } from "../../core/renderContextBlocks";
import { fullAuditOutputSchema } from "../../../services/audit/auditSchemas";
import { chapterSummaryOutputSchema } from "../../../services/novel/chapterSummarySchemas";
import { NOVEL_PROMPT_BUDGETS } from "./promptBudgetProfiles";

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
  modeHint?: string;
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
    maxTokensBudget: NOVEL_PROMPT_BUDGETS.chapterSummary,
  },
  outputSchema: chapterSummaryOutputSchema,
  render: (input) => [
    new SystemMessage([
      "你是中文网络小说章节摘要助手。",
      "你的任务不是评价章节，也不是改写正文，而是基于当前章节内容提炼一个可用于记录、检索与回顾的章节摘要。",
      "",
      "【任务边界】",
      "只输出符合 schema 的严格 JSON。",
      "输出格式固定为：{\"summary\":\"...\"}。",
      "不要输出 Markdown、解释、注释、代码块或任何额外文本。",
      "",
      "【摘要要求】",
      "1. summary 必须使用简体中文，长度控制在 80-180 字。",
      "2. 摘要必须覆盖本章最关键的事件推进，而不是泛泛概述氛围。",
      "3. 摘要应尽量同时体现以下信息中的主要部分：关键事件、冲突推进、人物状态变化、本章结果或留下的悬念。",
      "4. 摘要必须基于正文实际内容提炼，不得臆造正文中不存在的发展。",
      "5. 摘要应写成自然可读的完整概述，不要写成要点列表或标签堆砌。",
      "",
      "【质量要求】",
      "1. 优先写‘本章发生了什么变化’，而不是背景信息重复。",
      "2. 不要照抄正文原句，要做压缩与重组。",
      "3. 不要写成空泛句式，例如“剧情继续推进”“冲突进一步升级”。",
      "4. 若本章结尾留下明确钩子，应在摘要末尾体现其结果或悬念方向。",
    ].join("\n")),
    new HumanMessage([
      `小说：${input.novelTitle}`,
      `章节：第 ${input.chapterOrder} 章 ${input.chapterTitle}`,
      "",
      "【正文】",
      input.content,
      "",
      "请输出章节摘要 JSON。",
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
    maxTokensBudget: NOVEL_PROMPT_BUDGETS.chapterReview,
    preferredGroups: [
      "chapter_mission",
      "structure_obligations",
      "world_rules",
    ],
    dropOrder: [
      "recent_chapters",
      "participant_subset",
    ],
  },
  outputSchema: fullAuditOutputSchema,
  render: (input, context) => [
    new SystemMessage([
      "你是资深网络小说章节审校编辑。",
      "你的任务不是重写章节，而是基于正文与给定上下文，对当前章节做结构化质量评估，并输出可供后续修文使用的审查结果。",
      "",
      "【任务边界】",
      "只输出符合 schema 的严格 JSON。",
      "不要输出 Markdown、解释、注释、代码块或任何额外文本。",
      "不能脑补未给出的前文、设定或隐藏剧情。",
      "",
      "【评分要求】",
      "score 必须完整包含：coherence、repetition、pacing、voice、engagement、overall。",
      "每项评分都应基于正文实际表现，不得凭印象打分。",
      "",
      "【审查重点】",
      "1. coherence：事件衔接、人物行为、因果推进是否清楚稳定。",
      "2. repetition：是否存在信息重复、表达重复、动作重复或功能重复。",
      "3. pacing：节奏是否松散、失衡、过快跳跃或关键处压缩不足。",
      "4. voice：文风、叙述口吻、人物表达是否稳定且适配当前内容。",
      "5. engagement：是否具有持续阅读动力，结尾钩子、冲突推进与信息揭示是否有效。",
      "6. overall：综合质量判断，应反映本章是否达到可发布或需重点修整的水平。",
      "",
      "【issues 要求】",
      "1. issues 必须只抓真正影响阅读与连载质量的问题，避免吹毛求疵式碎问题泛滥。",
      "2. 每条 issue 都必须具体，不能只写“节奏不好”“描写偏弱”“有点重复”这种空泛判断。",
      "3. evidence 必须指向正文中的可观察现象，可以是某类段落问题、某种重复模式、某处逻辑断裂或某段失速现象。",
      "4. fixSuggestion 必须可执行，应该说明‘如何修’，而不是只说‘加强张力’‘优化表达’。",
      "",
      "【上下文使用规则】",
      "1. chapter_mission、structure_obligations、world_rules 只用于判断是否偏离任务或设定，不得拿来脑补正文未写出的内容。",
      "2. ragContext 仅作补充校验参考，优先以当前正文和分层上下文为准。",
      "3. 若某项上下文不足，允许保守判断，但不要凭空制造问题。",
      "",
      "【质量要求】",
      "1. 重点关注：是否完成本章任务、是否有新推进、是否存在明显冗余、是否留下有效钩子。",
      "2. 同类问题不要拆成多条近义 issue。",
      "3. 审查结果应服务后续修文，既要指出问题，也要保留本章已经有效的部分。",
    ].join("\n")),
    new HumanMessage([
      `小说：${input.novelTitle}`,
      `章节：${input.chapterTitle}`,
      "",
      "【分层上下文】",
      renderSelectedContextBlocks(context),
      "",
      "【正文】",
      input.content,
      "",
      "【检索补充】",
      input.ragContext || "none",
      "",
      "请输出章节审查 JSON。",
    ].join("\n")),
  ],
};

export const chapterRepairPrompt: PromptAsset<ChapterRepairPromptInput, string, string> = {
  id: "novel.review.repair",
  version: "v1",
  taskType: "repair",
  mode: "text",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: NOVEL_PROMPT_BUDGETS.chapterRepair,
    preferredGroups: [
      "repair_issues",
      "chapter_mission",
      "repair_boundaries",
      "world_rules",
    ],
    dropOrder: [
      "recent_chapters",
      "participant_subset",
      "continuation_constraints",
    ],
  },
  render: (input, context) => [
    new SystemMessage([
      "你是资深网络小说修文编辑。",
      "你的任务是根据问题清单与分层上下文，对当前章节进行最小必要修复，使其更符合任务要求、结构要求与阅读体验。",
      "",
      "【任务边界】",
      "只输出修复后的完整章节正文，不要输出解释、提纲、注释或任何额外文本。",
      "修文以‘最小必要修改’为原则，不要无关重写，不要把原章整体推翻重来。",
      "不得引入新的核心角色、重大设定、主线转向或与上下文冲突的内容。",
      "",
      "【修复原则】",
      "1. 优先修复 issuesJson 中明确指出的关键问题。",
      "2. 优先保证 chapter_mission、repair_boundaries、world_rules 的约束被满足。",
      "3. 保留原章已经有效的推进、情绪、细节与角色状态，不要把有用内容一起洗掉。",
      "4. 若多个问题冲突，优先修复影响主线推进、逻辑连贯和阅读节奏的问题。",
      "",
      "【具体要求】",
      "1. 修复后章节必须仍然是自然可读的完整正文，而不是拼补痕迹明显的修改稿。",
      "2. 必须尽量保留本章原有核心事件顺序，除非问题清单明确指出结构需要调整。",
      "3. 若存在重复、空转、失速问题，应通过压缩、合并、替换无效段落来修，不要只做表面润色。",
      "4. 若存在逻辑、动机、衔接问题，应补足必要过桥与因果，而不是额外发明大设定。",
      "5. 若存在钩子不足、结尾无力问题，应在不违背既有走向的前提下加强章末压力、悬念或决策点。",
      input.modeHint ? `6. 本次修复重点：${input.modeHint}` : "",
      "",
      "【风格要求】",
      "1. 保持与原章相近的叙述视角、语言风格与人物说话方式。",
      "2. 不要把修文写成另一种风格的新章。",
      "3. 控制 AI 味、总结味和说明味，优先用具体动作、对话、细节与局面变化完成修复。",
      "",
      "【禁止事项】",
      "禁止加入问题清单未要求的大幅扩写。",
      "禁止通过新增大事件掩盖原问题。",
      "禁止输出‘修改说明’‘修复点如下’等额外内容。",
    ].join("\n")),
    new HumanMessage([
      `小说：${input.novelTitle}`,
      `章节：${input.chapterTitle}`,
      "",
      "【分层上下文】",
      renderSelectedContextBlocks(context),
      "",
      "【作品圣经】",
      input.bibleContent || "none",
      "",
      "【当前正文】",
      input.chapterContent,
      "",
      "【问题清单】",
      input.issuesJson,
      "",
      "【检索补充】",
      input.ragContext || "none",
      "",
      "请直接输出修复后的完整章节正文。",
    ].join("\n")),
  ],
};
