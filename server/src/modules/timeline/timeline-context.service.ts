import type {
  StoryTimelineEvent,
  TimelineContextForChapter,
  TimelineConstraint,
  TimelineHook,
  TimelineStateChange,
} from "@ai-novel/shared/types/timeline";
import { timelineRepository, type TimelineRepository } from "./timeline.repository";

function eventBrief(event: StoryTimelineEvent) {
  return {
    id: event.id,
    title: event.title,
    summary: event.summary,
    chapterIndex: event.chapterIndex,
    storyTimeLabel: event.storyTimeLabel,
  };
}

function hookBrief(hook: TimelineHook) {
  const resolveMode = hook.resolveMode ?? "long_arc";
  return {
    id: hook.id,
    title: hook.title,
    description: hook.description,
    status: hook.status ?? "open",
    priority: hook.priority,
    resolveMode,
    blocking: hook.blocking ?? false,
  };
}

function forbiddenBrief(event: StoryTimelineEvent) {
  return {
    id: event.id,
    title: event.title,
    reason: event.summary || "该事件属于后续章节计划，当前章节不得提前发生。",
  };
}

function constraintToRequirement(constraint: TimelineConstraint): string {
  return `${constraint.type}/${constraint.severity}: ${constraint.description}`;
}

function buildContinuityRequirements(input: {
  blockingHooks: TimelineHook[];
  plannedEvents: StoryTimelineEvent[];
  forbiddenEvents: StoryTimelineEvent[];
  constraints: TimelineConstraint[];
}): string[] {
  return [
    ...input.blockingHooks.map((hook) => `必须立即承接上一章钩子：${hook.title}。${hook.description}`),
    ...input.plannedEvents.map((event) => `本章必须推进：${event.title}。${event.summary}`),
    ...input.forbiddenEvents.slice(0, 5).map((event) => `禁止提前发生：${event.title}。`),
    ...input.constraints.map(constraintToRequirement),
  ].filter(Boolean);
}

function latestStateChanges(events: StoryTimelineEvent[]): TimelineStateChange[] {
  const latest = new Map<string, TimelineStateChange>();
  for (const event of events) {
    for (const change of event.stateChanges) {
      latest.set(`${change.targetType}:${change.targetId}:${change.field}`, change);
    }
  }
  return Array.from(latest.values()).slice(-12);
}

export class TimelineContextService {
  constructor(private readonly repo: TimelineRepository = timelineRepository) {}

  async buildForChapter(input: {
    novelId: string;
    chapterId: string;
    chapterIndex: number;
  }): Promise<TimelineContextForChapter> {
    const [anchor, previousEvents, plannedEvents, openHooks, futureEvents, constraints] = await Promise.all([
      this.repo.getChapterTimeAnchor(input),
      this.repo.listEventsBeforeChapter({ novelId: input.novelId, chapterIndex: input.chapterIndex, limit: 8 }),
      this.repo.listPlannedEventsForChapter(input),
      this.repo.listOpenHooks(input),
      this.repo.listForbiddenEventsForChapter(input),
      this.repo.listActiveConstraints(input),
    ]);
    const blockingHooks = openHooks.filter((hook) => hook.status === "open" && hook.blocking && hook.resolveMode === "immediate");
    const softHooks = openHooks.filter((hook) => hook.status === "open" && !blockingHooks.some((item) => item.id === hook.id));
    const addressedHooks = openHooks.filter((hook) => hook.status === "addressed");
    const anchorForbidden = anchor?.forbiddenEventIds.length
      ? futureEvents.filter((event) => anchor.forbiddenEventIds.includes(event.id))
      : [];
    const forbiddenEvents = anchorForbidden.length > 0 ? anchorForbidden : futureEvents.slice(0, 6);
    const continuityRequirements = buildContinuityRequirements({
      blockingHooks,
      plannedEvents,
      forbiddenEvents,
      constraints,
    });
    return {
      currentChapterIndex: input.chapterIndex,
      currentTime: anchor
        ? {
            storyDayIndex: anchor.storyDayIndex,
            label: anchor.timeLabel,
          }
        : null,
      previousEvents: previousEvents.map(eventBrief),
      plannedEventsThisChapter: plannedEvents.map((event) => ({
        id: event.id,
        title: event.title,
        summary: event.summary,
      })),
      openHooks: openHooks.map(hookBrief),
      blockingHooks: blockingHooks.map(hookBrief),
      softHooks: softHooks.map(hookBrief),
      addressedHooks: addressedHooks.map(hookBrief),
      forbiddenEvents: forbiddenEvents.map(forbiddenBrief),
      continuityRequirements,
      knownStateChanges: latestStateChanges(previousEvents),
    };
  }
}

export const timelineContextService = new TimelineContextService();
