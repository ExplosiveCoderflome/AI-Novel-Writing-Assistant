import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import {
  extractedTimelineEventSchema,
  timelineHookPrioritySchema,
  timelineStateChangeSchema,
} from "@ai-novel/shared/types/timeline";
import type { PromptAsset } from "../../core/promptTypes";
import { NOVEL_PROMPT_BUDGETS } from "./promptBudgetProfiles";

export interface TimelineExtractorPromptInput {
  novelTitle: string;
  chapterOrder: number;
  chapterTitle: string;
  chapterGoal: string;
  timelineContextText: string;
  chapterContent: string;
}

export const timelineExtractorOutputSchema = z.object({
  timeAnchor: z.object({
    storyDayIndex: z.number().int().nullable().optional(),
    label: z.string().nullable().optional(),
  }).nullable().optional(),
  events: z.array(extractedTimelineEventSchema).max(12).default([]),
  hooks: z.array(z.object({
    title: z.string(),
    description: z.string(),
    priority: timelineHookPrioritySchema,
  })).max(6).default([]),
  stateChanges: z.array(timelineStateChangeSchema).max(12).default([]),
});

export type TimelineExtractorOutput = z.infer<typeof timelineExtractorOutputSchema>;

export const timelineExtractorPrompt: PromptAsset<
  TimelineExtractorPromptInput,
  TimelineExtractorOutput
> = {
  id: "novel.timeline.extractor",
  version: "v1",
  taskType: "review",
  mode: "structured",
  language: "zh",
  contextPolicy: {
    maxTokensBudget: NOVEL_PROMPT_BUDGETS.chapterArtifactDelta,
    requiredGroups: [],
    preferredGroups: [],
    dropOrder: [],
  },
  outputSchema: timelineExtractorOutputSchema,
  render: (input) => [
    new SystemMessage([
      "你是小说时间线事件抽取器。",
      "只抽取会影响后续连续性、时间顺序、角色状态、伏笔承接或读者认知的事件。",
      "不要抽取普通环境描写、情绪氛围、无后果动作或重复复述。",
      "必须输出严格 JSON，不能输出 Markdown 或解释。",
      "",
      "【抽取规则】",
      "1. events 只放正文中实际发生或被明确确认的关键事件。",
      "2. possibleHooks/hooks 只放本章结尾或正文中新制造、后续必须承接的钩子。",
      "3. stateChanges 记录角色、地点、势力、关系、道具或世界状态的明确变化。",
      "4. 如果正文提前写出时间线上下文中禁止提前发生的内容，也要如实抽取，后续 checker 会判断。",
      "5. matchedPlannedEventIds 只有在正文确实完成计划事件时填写，否则留空。",
    ].join("\n")),
    new HumanMessage([
      `小说：${input.novelTitle}`,
      `章节：第 ${input.chapterOrder} 章《${input.chapterTitle}》`,
      `章节目标：${input.chapterGoal}`,
      "",
      "【生成前时间线约束】",
      input.timelineContextText,
      "",
      "【章节正文】",
      input.chapterContent,
      "",
      "请输出时间线抽取 JSON。",
    ].join("\n")),
  ],
};
