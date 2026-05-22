import type {
  ExtractedTimelineEvent,
  TimelineHookDraft,
  TimelineCheckResult,
  TimelineContextForChapter,
} from "@ai-novel/shared/types/timeline";
import { timelineRepository, type TimelineRepository } from "./timeline.repository";

function eventKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
}

function normalizeHookText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function hookPriorityRank(priority: TimelineHookDraft["priority"]): number {
  if (priority === "critical") {
    return 0;
  }
  if (priority === "high") {
    return 1;
  }
  if (priority === "medium") {
    return 2;
  }
  return 3;
}

function hookResolveModeRank(resolveMode: TimelineHookDraft["resolveMode"]): number {
  if (resolveMode === "immediate") {
    return 0;
  }
  if (resolveMode === "short_arc") {
    return 1;
  }
  return 2;
}

function mergeHookDrafts(
  hooks: Array<TimelineHookDraft & { relatedEventIds: string[] }>,
): Array<TimelineHookDraft & { relatedEventIds: string[] }> {
  const merged = new Map<string, TimelineHookDraft & { relatedEventIds: string[] }>();
  for (const hook of hooks) {
    const draft: TimelineHookDraft & { relatedEventIds: string[] } = {
      title: normalizeHookText(hook.title),
      description: normalizeHookText(hook.description),
      priority: hook.priority,
      resolveMode: hook.resolveMode ?? "long_arc",
      blocking: hook.blocking ?? false,
      relatedEventIds: Array.from(new Set((hook.relatedEventIds ?? []).filter(Boolean))),
    };
    const key = `${draft.title}::${draft.description}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, draft);
      continue;
    }
    existing.relatedEventIds = Array.from(new Set([
      ...existing.relatedEventIds,
      ...draft.relatedEventIds,
    ]));
    if (draft.blocking) {
      existing.blocking = true;
    }
    if (hookResolveModeRank(draft.resolveMode) < hookResolveModeRank(existing.resolveMode)) {
      existing.resolveMode = draft.resolveMode;
    }
    if (hookPriorityRank(draft.priority) < hookPriorityRank(existing.priority)) {
      existing.priority = draft.priority;
    }
  }
  return Array.from(merged.values());
}

export class StoryTimelineService {
  constructor(private readonly repo: TimelineRepository = timelineRepository) {}

  async saveCheckReport(input: {
    novelId: string;
    chapterId: string;
    chapterIndex: number;
    result: TimelineCheckResult;
  }) {
    return this.repo.saveCheckReport({
      novelId: input.novelId,
      chapterId: input.chapterId,
      chapterIndex: input.chapterIndex,
      status: input.result.status,
      score: input.result.score,
      issues: input.result.issues,
    });
  }

  async commitChapterTimeline(input: {
    novelId: string;
    chapterId: string;
    chapterIndex: number;
    extractedEvents: ExtractedTimelineEvent[];
    extractedHooks?: TimelineHookDraft[];
    timelineContext: TimelineContextForChapter;
  }) {
    const occurredEventsInput = input.extractedEvents.filter((event) => event.occurred);
    const occurredEvents = occurredEventsInput.map((event, index) => ({
        novelId: input.novelId,
        chapterId: input.chapterId,
        chapterIndex: input.chapterIndex,
        eventOrder: input.chapterIndex * 1000 + index + 1,
        storyDayIndex: input.timelineContext.currentTime?.storyDayIndex ?? null,
        storyTimeLabel: input.timelineContext.currentTime?.label ?? null,
        title: event.title,
        summary: event.summary,
        type: event.type,
        status: "occurred" as const,
        visibility: "reader_known" as const,
        source: "chapter_extraction" as const,
        participantIds: [],
        locationId: null,
        factionIds: [],
        prerequisiteEventIds: [],
        consequenceEventIds: [],
        stateChanges: event.stateChanges,
        eventKey: eventKey(event.title),
        confidence: event.confidence,
      }));
    const savedEvents = await this.repo.saveExtractedEvents(occurredEvents);
    let occurredCursor = 0;
    const hookDrafts = mergeHookDrafts([
      ...input.extractedEvents.flatMap((event) => {
        const relatedEventIds = event.occurred && savedEvents[occurredCursor]
          ? [savedEvents[occurredCursor++].id]
          : [];
        return event.possibleHooks.map((hook) => ({
          ...hook,
          relatedEventIds,
        }));
      }),
      ...(input.extractedHooks ?? []).map((hook) => ({
        ...hook,
        relatedEventIds: [],
      })),
    ]);
    const hookIdsToAddress = input.timelineContext.openHooks
      .filter((hook) => hook.status === "open")
      .filter((hook) => input.extractedEvents.some((event) =>
        `${event.title}\n${event.summary}`.includes(hook.title) || hook.description.includes(event.title)))
      .map((hook) => hook.id);
    await this.repo.markHooksAddressed({
      hookIds: hookIdsToAddress,
      chapterId: input.chapterId,
      chapterIndex: input.chapterIndex,
      resolved: false,
    });
    await this.repo.createHooks(hookDrafts.map((hook) => ({
      novelId: input.novelId,
      createdInChapterId: input.chapterId,
      createdInChapterIndex: input.chapterIndex,
      expectedResolveByChapterIndex: hook.resolveMode === "immediate"
        ? input.chapterIndex + 1
        : hook.resolveMode === "short_arc"
          ? input.chapterIndex + 2
          : null,
      title: hook.title,
      description: hook.description,
      priority: hook.priority,
      resolveMode: hook.resolveMode,
      blocking: hook.blocking,
      relatedEventIds: hook.relatedEventIds,
      participantIds: [],
    })));
    return savedEvents;
  }
}

export const storyTimelineService = new StoryTimelineService();
