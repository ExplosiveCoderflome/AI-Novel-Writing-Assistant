import type { GenerationContextPackage } from "@ai-novel/shared/types/chapterRuntime";
import type { TimelineContextForChapter } from "@ai-novel/shared/types/timeline";

export type ChapterTimelineFinalizationMode = "stable" | "degraded";
// A live worker renews its durable side-effect lease. Two minutes is long enough
// for a heartbeat gap but short enough that a dead desktop process does not hold
// the finalization gate for the historical fifteen-minute window.
export const TIMELINE_FINALIZATION_RUNNING_STALE_MS = 2 * 60 * 1000;

export function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

export function chapterGoalFromContext(contextPackage: GenerationContextPackage | null | undefined): string {
  return uniqueStrings([
    contextPackage?.chapterMission?.objective,
    contextPackage?.chapter.expectation,
    contextPackage?.plan?.objective,
  ]).join("\n") || "推进当前章节任务";
}

export function fallbackTimeLabel(input: {
  chapterIndex: number;
  contextPackage?: GenerationContextPackage | null;
  timelineContext?: TimelineContextForChapter | null;
}): string {
  return input.timelineContext?.currentTime?.label?.trim()
    || input.contextPackage?.timelineContext?.currentTime?.label?.trim()
    || `第 ${input.chapterIndex} 章`;
}

export function openHookIds(context: TimelineContextForChapter | null | undefined): string[] {
  return context?.openHooks?.map((hook) => hook.id) ?? [];
}

export function plannedEventIds(context: TimelineContextForChapter | null | undefined): string[] {
  return context?.plannedEventsThisChapter?.map((event) => event.id) ?? [];
}

export function forbiddenEventIds(context: TimelineContextForChapter | null | undefined): string[] {
  return context?.forbiddenEvents?.map((event) => event.id) ?? [];
}
