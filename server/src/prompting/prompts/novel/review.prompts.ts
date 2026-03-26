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
    new SystemMessage(
      "你是网络小说编辑。请基于章节正文生成中文摘要，只输出 JSON：{\"summary\":\"...\"}。要求：80-180字，聚焦关键事件、冲突推进、人物状态变化，不要杜撰信息。",
    ),
    new HumanMessage(`小说：${input.novelTitle}
章节：第${input.chapterOrder}章《${input.chapterTitle}》
正文：
${input.content}`),
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
    new SystemMessage(
      "你是网文审校专家。请输出 JSON：{\"score\":{\"coherence\":0-100,\"repetition\":0-100,\"pacing\":0-100,\"voice\":0-100,\"engagement\":0-100,\"overall\":0-100},\"issues\":[{\"severity\":\"low|medium|high|critical\",\"category\":\"coherence|repetition|pacing|voice|engagement|logic\",\"evidence\":\"...\",\"fixSuggestion\":\"...\"}]}",
    ),
    new HumanMessage(`小说：${input.novelTitle}
章节：${input.chapterTitle}
正文：
${input.content}

检索补充：
${input.ragContext}`),
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
    new SystemMessage("你是资深网文编辑，请基于审校问题修复章节，保证主线和口吻一致"),
    new HumanMessage(`小说标题：${input.novelTitle}
作品圣经：${input.bibleContent}
章节标题：${input.chapterTitle}
原始正文：
${input.chapterContent}

审校问题：
${input.issuesJson}

检索补充：
${input.ragContext}

请输出修复后的完整章节正文。`),
  ],
};
