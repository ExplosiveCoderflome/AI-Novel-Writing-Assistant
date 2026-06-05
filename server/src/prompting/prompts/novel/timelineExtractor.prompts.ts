import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import {
  extractedTimelineEventSchema,
  timelineHookDraftSchema,
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

function normalizeEnumAlias(value: unknown, aliases: Record<string, string>): unknown {
  if (typeof value !== "string") {
    return value;
  }
  const normalized = value.trim().toLowerCase();
  return aliases[normalized] ?? aliases[value.trim()] ?? normalized;
}

function readString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function normalizeTimelineHook(value: unknown): unknown {
  if (typeof value === "string") {
    const text = value.trim();
    return text
      ? {
          title: text,
          description: text,
          priority: "medium",
          resolveMode: "long_arc",
          blocking: false,
        }
      : value;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return value;
  }
  const record = value as Record<string, unknown>;
  const title = readString(record, ["title", "name", "hook", "summary", "text"]) ?? "后续承接钩子";
  const description = readString(record, ["description", "summary", "detail", "text"]) ?? title;
  const priority = normalizeEnumAlias(record.priority ?? record.severity, {
    低: "low",
    中: "medium",
    中等: "medium",
    高: "high",
    紧急: "critical",
    关键: "critical",
    normal: "medium",
  });
  const resolveMode = normalizeEnumAlias(record.resolveMode ?? record.mode, {
    immediate_next: "immediate",
    next: "immediate",
    立即: "immediate",
    下一章: "immediate",
    short: "short_arc",
    short_term: "short_arc",
    短线: "short_arc",
    long: "long_arc",
    long_term: "long_arc",
    长线: "long_arc",
  });
  return {
    ...record,
    title,
    description,
    priority,
    resolveMode,
    blocking: typeof record.blocking === "boolean" ? record.blocking : false,
  };
}

function normalizeTimelineStateChange(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return value;
  }
  const record = value as Record<string, unknown>;
  return {
    ...record,
    targetType: normalizeEnumAlias(record.targetType, {
      角色: "character",
      人物: "character",
      地点: "location",
      场景: "location",
      势力: "faction",
      阵营: "faction",
      关系: "relationship",
      道具: "item",
      物品: "item",
      资源: "item",
      世界: "world",
      世界状态: "world",
    }),
  };
}

function normalizeTimelineEvent(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return value;
  }
  const record = value as Record<string, unknown>;
  return {
    ...record,
    type: normalizeEnumAlias(record.type, {
      剧情: "plot",
      主线: "plot",
      关系: "relationship",
      人际: "relationship",
      冲突: "conflict",
      揭示: "reveal",
      揭露: "reveal",
      战斗: "battle",
      决策: "decision",
      决定: "decision",
      伏笔: "setup",
      铺垫: "setup",
      兑现: "payoff",
      转场: "transition",
      过渡: "transition",
      背景: "background",
      世界状态: "world_state",
    }),
    stateChanges: Array.isArray(record.stateChanges)
      ? record.stateChanges.map((item) => normalizeTimelineStateChange(item))
      : record.stateChanges,
    possibleHooks: Array.isArray(record.possibleHooks)
      ? record.possibleHooks.map((item) => normalizeTimelineHook(item))
      : record.possibleHooks,
  };
}

export const timelineExtractorOutputSchema = z.object({
  timeAnchor: z.object({
    storyDayIndex: z.number().int().nullable().optional(),
    label: z.string().nullable().optional(),
  }).nullable().optional(),
  addressedHookIds: z.array(z.string()).max(12).default([]),
  resolvedHookIds: z.array(z.string()).max(12).default([]),
  events: z.array(z.preprocess(normalizeTimelineEvent, extractedTimelineEventSchema)).max(12).default([]),
  hooks: z.array(z.preprocess(normalizeTimelineHook, timelineHookDraftSchema)).max(6).default([]),
  stateChanges: z.array(z.preprocess(normalizeTimelineStateChange, timelineStateChangeSchema)).max(12).default([]),
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
  structuredOutputHint: {
    note: "stateChanges.before / stateChanges.after 表示可读状态值，必须输出 JSON 字符串；差评值、评分、倒计时、数量等数值也写成 \"19\"、\"5\" 这类字符串。",
    example: {
      timeAnchor: {
        storyDayIndex: 1,
        label: "第2章",
      },
      addressedHookIds: ["hook-id-from-context"],
      resolvedHookIds: [],
      events: [{
        title: "主角完成一次状态推进",
        summary: "正文确认某个会影响后续连续性的关键变化。",
        type: "plot",
        participantNames: ["角色名"],
        locationName: "地点名",
        stateChanges: [{
          targetType: "item",
          targetId: "差评值",
          field: "value",
          before: "19",
          after: "5",
          certainty: "confirmed",
        }],
        possibleHooks: [{
          title: "敌方留下新的试探痕迹",
          description: "本章结尾确认敌方还会继续试探，后续章节需要承接这条压力。",
          priority: "medium",
          resolveMode: "short_arc",
          blocking: false,
        }],
        occurred: true,
        confidence: 0.9,
        matchedPlannedEventIds: [],
      }],
      hooks: [{
        title: "主角下一步验证线索",
        description: "主角已经获得线索，但尚未验证真假，后续需要安排验证行动。",
        priority: "medium",
        resolveMode: "long_arc",
        blocking: false,
      }],
      stateChanges: [{
        targetType: "item",
        targetId: "差评值",
        field: "value",
        before: "19",
        after: "5",
        certainty: "confirmed",
      }],
    },
  },
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
      "3. 每个 hook 必须标注 resolveMode：immediate / short_arc / long_arc。",
      "4. 只有下一章必须立即承接、且不处理会破坏当前章节合同的 hook，才标记 blocking=true。",
      "5. stateChanges 记录角色、地点、势力、关系、道具或世界状态的明确变化。",
      "6. 如果正文提前写出时间线上下文中禁止提前发生的内容，也要如实抽取，后续 checker 会判断。",
      "7. matchedPlannedEventIds 只有在正文确实完成计划事件时填写，否则留空。",
      "8. 如果正文承接了时间线上下文中的 open/addressed hook，必须把对应 hook id 放入 addressedHookIds；如果该钩子已完整兑现并不应继续污染后续章节，放入 resolvedHookIds。",
      "9. hook id 必须来自时间线上下文，不能编造；判断承接关系以正文语义为准，不要依赖标题字面相同。",
      "10. stateChanges.before / stateChanges.after 是给后续连续性阅读的状态文本，必须输出字符串；即使正文状态是数值，也写成 JSON 字符串，例如 \"19\"、\"5\"、\"76\"。",
      "11. events.type 只能使用 plot、relationship、conflict、reveal、battle、decision、setup、payoff、transition、background、world_state；不要输出中文类型名。",
      "12. stateChanges.targetType 只能使用 character、location、faction、relationship、item、world；不要输出中文类型名。",
      "13. possibleHooks 和 hooks 必须是对象数组，每个对象必须包含 title、description、priority、resolveMode、blocking；不能输出字符串数组。",
      "14. hook.priority 只能使用 low、medium、high、critical。",
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
