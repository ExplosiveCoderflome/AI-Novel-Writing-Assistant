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
      "请输出一个严格 JSON 对象，格式固定为 {\"summary\":\"...\"}。",
      "只根据章节正文生成 80-180 字的简体中文摘要，不要输出额外文本。",
      "摘要需要覆盖关键事件、冲突推进、人物状态变化和本章留下的悬念或结果。",
    ].join("\n")),
    new HumanMessage([
      `小说：${input.novelTitle}`,
      `章节：第 ${input.chapterOrder} 章 ${input.chapterTitle}`,
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
      "请输出严格 JSON，对章节进行结构化质量评估。",
      "score 需要包含 coherence、repetition、pacing、voice、engagement、overall。",
      "issues 必须具体，evidence 要能指向文本现象，fixSuggestion 必须可执行。",
      "不能脑补未给出的前文或设定。",
    ].join("\n")),
    new HumanMessage([
      `小说：${input.novelTitle}`,
      `章节：${input.chapterTitle}`,
      "",
      "分层上下文：",
      renderSelectedContextBlocks(context),
      "",
      "正文：",
      input.content,
      "",
      "检索补充：",
      input.ragContext || "none",
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
      "你的任务是根据问题清单和分层上下文，对章节进行最小必要修复。",
      "只输出修复后的完整章节正文，不要输出解释、提纲或额外文本。",
      "不得引入新的核心角色、重大设定或偏离既定主线。",
    ].join("\n")),
    new HumanMessage([
      `小说：${input.novelTitle}`,
      `章节：${input.chapterTitle}`,
      "",
      "分层上下文：",
      renderSelectedContextBlocks(context),
      "",
      "作品圣经：",
      input.bibleContent || "none",
      "",
      "当前正文：",
      input.chapterContent,
      "",
      "问题清单：",
      input.issuesJson,
      "",
      "检索补充：",
      input.ragContext || "none",
      "",
      "请直接输出修复后的完整章节正文。",
    ].join("\n")),
  ],
};
