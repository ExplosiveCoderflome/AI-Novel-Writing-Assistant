import { z } from "zod";

export const timelineEventStatusSchema = z.enum([
  "planned",
  "occurred",
  "foreshadowed",
  "resolved",
  "cancelled",
  "superseded",
]);

export const timelineEventTypeSchema = z.enum([
  "plot",
  "relationship",
  "conflict",
  "reveal",
  "battle",
  "decision",
  "setup",
  "payoff",
  "transition",
  "background",
  "world_state",
]);

export const timelineVisibilitySchema = z.enum([
  "reader_known",
  "protagonist_known",
  "character_known",
  "hidden_truth",
]);

export const timelineEventSourceSchema = z.enum([
  "outline",
  "chapter_plan",
  "manual",
  "chapter_extraction",
  "repair",
  "imported",
]);

export const timelineHookStatusSchema = z.enum([
  "open",
  "addressed",
  "resolved",
  "dropped",
  "expired",
]);

export const timelineHookResolveModeSchema = z.enum([
  "immediate",
  "short_arc",
  "long_arc",
]);

export const timelineHookPrioritySchema = z.enum([
  "low",
  "medium",
  "high",
  "critical",
]);

export const timelineHookDraftSchema = z.object({
  title: z.string(),
  description: z.string(),
  priority: timelineHookPrioritySchema,
  resolveMode: timelineHookResolveModeSchema.default("long_arc"),
  blocking: z.boolean().default(false),
});

export const timelineStateTargetTypeSchema = z.enum([
  "character",
  "location",
  "faction",
  "relationship",
  "item",
  "world",
]);

function normalizeTimelineStateValue(value: unknown): unknown {
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : value;
  }
  if (typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  return value;
}

const timelineStateValueSchema = z.preprocess(
  normalizeTimelineStateValue,
  z.string().trim().min(1),
);

const optionalTimelineStateValueSchema = z.preprocess((value) => {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === "string" && value.trim().length === 0) {
    return undefined;
  }
  return normalizeTimelineStateValue(value);
}, z.string().trim().min(1).optional());

export const timelineStateChangeSchema = z.object({
  targetType: timelineStateTargetTypeSchema,
  targetId: z.string(),
  field: z.string(),
  before: optionalTimelineStateValueSchema,
  after: timelineStateValueSchema,
  certainty: z.enum(["confirmed", "likely", "rumored", "hidden"]),
});

export const storyTimelineEventSchema = z.object({
  id: z.string(),
  novelId: z.string(),
  eventOrder: z.number().int(),
  chapterId: z.string().nullable().optional(),
  chapterIndex: z.number().int().nullable().optional(),
  storyDayIndex: z.number().int().nullable().optional(),
  storyTimeLabel: z.string().nullable().optional(),
  title: z.string(),
  summary: z.string(),
  type: timelineEventTypeSchema,
  status: timelineEventStatusSchema,
  visibility: timelineVisibilitySchema,
  source: timelineEventSourceSchema,
  participantIds: z.array(z.string()).default([]),
  locationId: z.string().nullable().optional(),
  factionIds: z.array(z.string()).default([]),
  prerequisiteEventIds: z.array(z.string()).default([]),
  consequenceEventIds: z.array(z.string()).default([]),
  stateChanges: z.array(timelineStateChangeSchema).default([]),
  eventKey: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1).default(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const chapterTimeAnchorSchema = z.object({
  id: z.string(),
  novelId: z.string(),
  chapterId: z.string(),
  chapterIndex: z.number().int(),
  storyDayIndex: z.number().int().nullable().optional(),
  timeLabel: z.string(),
  startsAfterEventIds: z.array(z.string()).default([]),
  plannedEventIds: z.array(z.string()).default([]),
  endedWithEventIds: z.array(z.string()).default([]),
  previousHookIds: z.array(z.string()).default([]),
  nextHookIds: z.array(z.string()).default([]),
  forbiddenEventIds: z.array(z.string()).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const timelineHookSchema = z.object({
  id: z.string(),
  novelId: z.string(),
  createdInChapterId: z.string(),
  createdInChapterIndex: z.number().int(),
  expectedResolveByChapterIndex: z.number().int().nullable().optional(),
  resolveMode: timelineHookResolveModeSchema.default("long_arc"),
  blocking: z.boolean().default(false),
  resolvedInChapterId: z.string().nullable().optional(),
  resolvedInChapterIndex: z.number().int().nullable().optional(),
  title: z.string(),
  description: z.string(),
  status: timelineHookStatusSchema,
  priority: timelineHookPrioritySchema,
  relatedEventIds: z.array(z.string()).default([]),
  participantIds: z.array(z.string()).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const timelineConstraintTypeSchema = z.enum([
  "must_include",
  "must_continue",
  "must_not_happen",
  "must_not_reveal",
  "must_resolve_hook",
  "must_keep_state",
  "must_advance_time",
  "must_not_repeat_event",
]);

export const timelineConstraintSeveritySchema = z.enum([
  "info",
  "warning",
  "error",
  "blocking",
]);

export const timelineConstraintSchema = z.object({
  id: z.string(),
  novelId: z.string(),
  chapterId: z.string().nullable().optional(),
  chapterIndex: z.number().int().nullable().optional(),
  type: timelineConstraintTypeSchema,
  severity: timelineConstraintSeveritySchema,
  description: z.string(),
  relatedEventIds: z.array(z.string()).default([]),
  relatedHookIds: z.array(z.string()).default([]),
  relatedCharacterIds: z.array(z.string()).default([]),
  active: z.boolean().default(true),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const timelineContextForChapterSchema = z.object({
  currentChapterIndex: z.number().int(),
  currentTime: z.object({
    storyDayIndex: z.number().int().nullable().optional(),
    label: z.string().nullable().optional(),
  }).nullable().optional(),
  previousEvents: z.array(z.object({
    id: z.string(),
    title: z.string(),
    summary: z.string(),
    chapterIndex: z.number().int().nullable().optional(),
    storyTimeLabel: z.string().nullable().optional(),
  })).default([]),
  plannedEventsThisChapter: z.array(z.object({
    id: z.string(),
    title: z.string(),
    summary: z.string(),
  })).default([]),
  openHooks: z.array(z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    status: timelineHookStatusSchema.default("open"),
    priority: timelineHookPrioritySchema,
    resolveMode: timelineHookResolveModeSchema.default("long_arc"),
    blocking: z.boolean().default(false),
  })).default([]),
  blockingHooks: z.array(z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    status: timelineHookStatusSchema.default("open"),
    priority: timelineHookPrioritySchema,
    resolveMode: timelineHookResolveModeSchema.default("long_arc"),
    blocking: z.boolean().default(false),
  })).default([]),
  softHooks: z.array(z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    status: timelineHookStatusSchema.default("open"),
    priority: timelineHookPrioritySchema,
    resolveMode: timelineHookResolveModeSchema.default("long_arc"),
    blocking: z.boolean().default(false),
  })).default([]),
  addressedHooks: z.array(z.object({
    id: z.string(),
    title: z.string(),
    description: z.string(),
    status: timelineHookStatusSchema.default("addressed"),
    priority: timelineHookPrioritySchema,
    resolveMode: timelineHookResolveModeSchema.default("long_arc"),
    blocking: z.boolean().default(false),
  })).default([]),
  forbiddenEvents: z.array(z.object({
    id: z.string(),
    title: z.string(),
    reason: z.string(),
  })).default([]),
  continuityRequirements: z.array(z.string()).default([]),
  knownStateChanges: z.array(timelineStateChangeSchema).default([]),
});

export const extractedTimelineEventSchema = z.object({
  title: z.string(),
  summary: z.string(),
  type: timelineEventTypeSchema,
  participantNames: z.array(z.string()).default([]),
  locationName: z.string().nullable().optional(),
  stateChanges: z.array(timelineStateChangeSchema).default([]),
  possibleHooks: z.array(timelineHookDraftSchema).default([]),
  occurred: z.boolean(),
  confidence: z.number().min(0).max(1).default(0.7),
  matchedPlannedEventIds: z.array(z.string()).default([]),
});

export const timelineIssueTypeSchema = z.enum([
  "future_event_leak",
  "unresolved_previous_hook",
  "timeline_regression",
  "repeated_event",
  "state_conflict",
  "delayed_promise",
  "missing_planned_event",
  "forbidden_event_occurred",
  "unclear_time_anchor",
]);

export const timelineIssueSeveritySchema = z.enum([
  "info",
  "warning",
  "error",
  "blocking",
]);

export const timelineIssueSchema = z.object({
  type: timelineIssueTypeSchema,
  severity: timelineIssueSeveritySchema,
  message: z.string(),
  evidence: z.string().optional(),
  suggestedFix: z.string().optional(),
  relatedEventIds: z.array(z.string()).default([]),
  relatedHookIds: z.array(z.string()).default([]),
});

export const timelineCheckResultSchema = z.object({
  status: z.enum(["passed", "warning", "failed"]),
  score: z.number().min(0).max(1),
  issues: z.array(timelineIssueSchema).default([]),
});

export const timelineCheckReportSchema = z.object({
  id: z.string(),
  novelId: z.string(),
  chapterId: z.string(),
  chapterIndex: z.number().int(),
  status: z.enum(["passed", "warning", "failed"]),
  score: z.number().min(0).max(1),
  issues: z.array(timelineIssueSchema).default([]),
  createdAt: z.string(),
});

export type TimelineEventStatus = z.infer<typeof timelineEventStatusSchema>;
export type TimelineEventType = z.infer<typeof timelineEventTypeSchema>;
export type TimelineVisibility = z.infer<typeof timelineVisibilitySchema>;
export type TimelineEventSource = z.infer<typeof timelineEventSourceSchema>;
export type TimelineHookStatus = z.infer<typeof timelineHookStatusSchema>;
export type TimelineHookResolveMode = z.infer<typeof timelineHookResolveModeSchema>;
export type TimelineHookPriority = z.infer<typeof timelineHookPrioritySchema>;
export type TimelineHookDraft = z.infer<typeof timelineHookDraftSchema>;
export type TimelineStateTargetType = z.infer<typeof timelineStateTargetTypeSchema>;
export type TimelineStateChange = z.infer<typeof timelineStateChangeSchema>;
export type StoryTimelineEvent = z.infer<typeof storyTimelineEventSchema>;
export type ChapterTimeAnchor = z.infer<typeof chapterTimeAnchorSchema>;
export type TimelineHook = z.infer<typeof timelineHookSchema>;
export type TimelineConstraint = z.infer<typeof timelineConstraintSchema>;
export type TimelineContextForChapter = z.infer<typeof timelineContextForChapterSchema>;
export type ExtractedTimelineEvent = z.infer<typeof extractedTimelineEventSchema>;
export type TimelineIssue = z.infer<typeof timelineIssueSchema>;
export type TimelineIssueSeverity = z.infer<typeof timelineIssueSeveritySchema>;
export type TimelineCheckResult = z.infer<typeof timelineCheckResultSchema>;
export type TimelineCheckReport = z.infer<typeof timelineCheckReportSchema>;
