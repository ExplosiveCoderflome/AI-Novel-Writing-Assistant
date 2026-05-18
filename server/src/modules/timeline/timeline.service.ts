import type {
  ExtractedTimelineEvent,
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
    timelineContext: TimelineContextForChapter;
  }) {
    const occurredEvents = input.extractedEvents
      .filter((event) => event.occurred)
      .map((event, index) => ({
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
    const hookIdsToAddress = input.timelineContext.openHooks
      .filter((hook) => input.extractedEvents.some((event) =>
        `${event.title}\n${event.summary}`.includes(hook.title) || hook.description.includes(event.title)))
      .map((hook) => hook.id);
    await this.repo.markHooksAddressed({
      hookIds: hookIdsToAddress,
      chapterId: input.chapterId,
      chapterIndex: input.chapterIndex,
      resolved: false,
    });
    await this.repo.createHooks(input.extractedEvents.flatMap((event, index) =>
      event.possibleHooks.map((hook) => ({
        novelId: input.novelId,
        createdInChapterId: input.chapterId,
        createdInChapterIndex: input.chapterIndex,
        expectedResolveByChapterIndex: input.chapterIndex + 1,
        title: hook.title,
        description: hook.description,
        priority: hook.priority,
        relatedEventIds: savedEvents[index] ? [savedEvents[index].id] : [],
        participantIds: [],
      }))));
    return savedEvents;
  }
}

export const storyTimelineService = new StoryTimelineService();
