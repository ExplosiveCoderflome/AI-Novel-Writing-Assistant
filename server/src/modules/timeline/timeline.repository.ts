import type {
  ChapterTimeAnchor,
  StoryTimelineEvent,
  TimelineCheckReport,
  TimelineConstraint,
  TimelineHook,
  TimelineIssue,
} from "@ai-novel/shared/types/timeline";
import { prisma } from "../../db/prisma";

function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) {
    return fallback;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function stringifyJson(value: unknown): string {
  return JSON.stringify(value ?? []);
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

type EventRow = Awaited<ReturnType<typeof prisma.storyTimelineEvent.findMany>>[number];
type AnchorRow = Awaited<ReturnType<typeof prisma.chapterTimeAnchor.findFirst>>;
type HookRow = Awaited<ReturnType<typeof prisma.timelineHook.findMany>>[number];
type ConstraintRow = Awaited<ReturnType<typeof prisma.timelineConstraint.findMany>>[number];
type ReportRow = Awaited<ReturnType<typeof prisma.timelineCheckReport.findFirst>>;

export function mapTimelineEvent(row: EventRow): StoryTimelineEvent {
  return {
    id: row.id,
    novelId: row.novelId,
    eventOrder: row.eventOrder,
    chapterId: row.chapterId,
    chapterIndex: row.chapterIndex,
    storyDayIndex: row.storyDayIndex,
    storyTimeLabel: row.storyTimeLabel,
    title: row.title,
    summary: row.summary,
    type: row.type as StoryTimelineEvent["type"],
    status: row.status as StoryTimelineEvent["status"],
    visibility: row.visibility as StoryTimelineEvent["visibility"],
    source: row.source as StoryTimelineEvent["source"],
    participantIds: parseJsonArray(row.participantIdsJson),
    locationId: row.locationId,
    factionIds: parseJsonArray(row.factionIdsJson),
    prerequisiteEventIds: parseJsonArray(row.prerequisiteIdsJson),
    consequenceEventIds: parseJsonArray(row.consequenceIdsJson),
    stateChanges: parseJson(row.stateChangesJson, []),
    eventKey: row.eventKey,
    confidence: row.confidence,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function mapAnchor(row: NonNullable<AnchorRow>): ChapterTimeAnchor {
  return {
    id: row.id,
    novelId: row.novelId,
    chapterId: row.chapterId,
    chapterIndex: row.chapterIndex,
    storyDayIndex: row.storyDayIndex,
    timeLabel: row.timeLabel,
    startsAfterEventIds: parseJsonArray(row.startsAfterIdsJson),
    plannedEventIds: parseJsonArray(row.plannedEventIdsJson),
    endedWithEventIds: parseJsonArray(row.endedWithIdsJson),
    previousHookIds: parseJsonArray(row.previousHookIdsJson),
    nextHookIds: parseJsonArray(row.nextHookIdsJson),
    forbiddenEventIds: parseJsonArray(row.forbiddenEventIdsJson),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

export function mapTimelineHook(row: HookRow): TimelineHook {
  return {
    id: row.id,
    novelId: row.novelId,
    createdInChapterId: row.createdInChapterId,
    createdInChapterIndex: row.createdInChapterIndex,
    expectedResolveByChapterIndex: row.expectedResolveByChapterIndex,
    resolvedInChapterId: row.resolvedInChapterId,
    resolvedInChapterIndex: row.resolvedInChapterIndex,
    title: row.title,
    description: row.description,
    status: row.status as TimelineHook["status"],
    priority: row.priority as TimelineHook["priority"],
    relatedEventIds: parseJsonArray(row.relatedEventIdsJson),
    participantIds: parseJsonArray(row.participantIdsJson),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function mapConstraint(row: ConstraintRow): TimelineConstraint {
  return {
    id: row.id,
    novelId: row.novelId,
    chapterId: row.chapterId,
    chapterIndex: row.chapterIndex,
    type: row.type as TimelineConstraint["type"],
    severity: row.severity as TimelineConstraint["severity"],
    description: row.description,
    relatedEventIds: parseJsonArray(row.relatedEventIdsJson),
    relatedHookIds: parseJsonArray(row.relatedHookIdsJson),
    relatedCharacterIds: parseJsonArray(row.relatedCharacterIdsJson),
    active: row.active,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function mapReport(row: NonNullable<ReportRow>): TimelineCheckReport {
  return {
    id: row.id,
    novelId: row.novelId,
    chapterId: row.chapterId,
    chapterIndex: row.chapterIndex,
    status: row.status as TimelineCheckReport["status"],
    score: row.score,
    issues: parseJson<TimelineIssue[]>(row.issuesJson, []),
    createdAt: toIso(row.createdAt),
  };
}

export interface TimelineRepository {
  listEventsBeforeChapter(input: {
    novelId: string;
    chapterIndex: number;
    limit?: number;
  }): Promise<StoryTimelineEvent[]>;
  listPlannedEventsForChapter(input: { novelId: string; chapterIndex: number }): Promise<StoryTimelineEvent[]>;
  listForbiddenEventsForChapter(input: { novelId: string; chapterIndex: number }): Promise<StoryTimelineEvent[]>;
  listOpenHooks(input: { novelId: string; chapterIndex: number }): Promise<TimelineHook[]>;
  listActiveConstraints(input: { novelId: string; chapterId?: string; chapterIndex: number }): Promise<TimelineConstraint[]>;
  getChapterTimeAnchor(input: { novelId: string; chapterId: string }): Promise<ChapterTimeAnchor | null>;
  getLatestCheckReport(input: { novelId: string; chapterId: string }): Promise<TimelineCheckReport | null>;
  saveExtractedEvents(events: Array<Omit<StoryTimelineEvent, "id" | "createdAt" | "updatedAt">>): Promise<StoryTimelineEvent[]>;
  createHooks(hooks: Array<{
    novelId: string;
    createdInChapterId: string;
    createdInChapterIndex: number;
    expectedResolveByChapterIndex?: number | null;
    title: string;
    description: string;
    priority: TimelineHook["priority"];
    relatedEventIds?: string[];
    participantIds?: string[];
  }>): Promise<void>;
  markHooksAddressed(input: { hookIds: string[]; chapterId: string; chapterIndex: number; resolved?: boolean }): Promise<void>;
  saveCheckReport(report: Omit<TimelineCheckReport, "id" | "createdAt">): Promise<TimelineCheckReport>;
}

export class PrismaTimelineRepository implements TimelineRepository {
  async listEventsBeforeChapter(input: { novelId: string; chapterIndex: number; limit?: number }): Promise<StoryTimelineEvent[]> {
    const rows = await prisma.storyTimelineEvent.findMany({
      where: {
        novelId: input.novelId,
        status: { in: ["occurred", "foreshadowed", "resolved"] },
        OR: [
          { chapterIndex: { lt: input.chapterIndex } },
          { chapterIndex: null, eventOrder: { lt: input.chapterIndex * 1000 } },
        ],
      },
      orderBy: [{ eventOrder: "desc" }, { updatedAt: "desc" }],
      take: input.limit ?? 20,
    });
    return rows.reverse().map(mapTimelineEvent);
  }

  async listPlannedEventsForChapter(input: { novelId: string; chapterIndex: number }): Promise<StoryTimelineEvent[]> {
    const rows = await prisma.storyTimelineEvent.findMany({
      where: {
        novelId: input.novelId,
        status: "planned",
        chapterIndex: input.chapterIndex,
      },
      orderBy: [{ eventOrder: "asc" }, { createdAt: "asc" }],
    });
    return rows.map(mapTimelineEvent);
  }

  async listForbiddenEventsForChapter(input: { novelId: string; chapterIndex: number }): Promise<StoryTimelineEvent[]> {
    const rows = await prisma.storyTimelineEvent.findMany({
      where: {
        novelId: input.novelId,
        status: "planned",
        chapterIndex: { gt: input.chapterIndex },
      },
      orderBy: [{ chapterIndex: "asc" }, { eventOrder: "asc" }],
      take: 12,
    });
    return rows.map(mapTimelineEvent);
  }

  async listOpenHooks(input: { novelId: string; chapterIndex: number }): Promise<TimelineHook[]> {
    const rows = await prisma.timelineHook.findMany({
      where: {
        novelId: input.novelId,
        status: { in: ["open", "addressed"] },
        createdInChapterIndex: { lt: input.chapterIndex },
        OR: [
          { expectedResolveByChapterIndex: null },
          { expectedResolveByChapterIndex: { lte: input.chapterIndex } },
        ],
      },
      orderBy: [{ priority: "desc" }, { createdInChapterIndex: "asc" }, { updatedAt: "desc" }],
      take: 8,
    });
    return rows.map(mapTimelineHook);
  }

  async listActiveConstraints(input: { novelId: string; chapterId?: string; chapterIndex: number }): Promise<TimelineConstraint[]> {
    const rows = await prisma.timelineConstraint.findMany({
      where: {
        novelId: input.novelId,
        active: true,
        OR: [
          { chapterId: input.chapterId ?? undefined },
          { chapterIndex: input.chapterIndex },
          { chapterId: null, chapterIndex: null },
        ],
      },
      orderBy: [{ severity: "desc" }, { updatedAt: "desc" }],
      take: 20,
    });
    return rows.map(mapConstraint);
  }

  async getChapterTimeAnchor(input: { novelId: string; chapterId: string }): Promise<ChapterTimeAnchor | null> {
    const row = await prisma.chapterTimeAnchor.findUnique({
      where: { novelId_chapterId: { novelId: input.novelId, chapterId: input.chapterId } },
    });
    return row ? mapAnchor(row) : null;
  }

  async getLatestCheckReport(input: { novelId: string; chapterId: string }): Promise<TimelineCheckReport | null> {
    const row = await prisma.timelineCheckReport.findFirst({
      where: { novelId: input.novelId, chapterId: input.chapterId },
      orderBy: { createdAt: "desc" },
    });
    return row ? mapReport(row) : null;
  }

  async saveExtractedEvents(events: Array<Omit<StoryTimelineEvent, "id" | "createdAt" | "updatedAt">>): Promise<StoryTimelineEvent[]> {
    const created: StoryTimelineEvent[] = [];
    for (const event of events) {
      const row = await prisma.storyTimelineEvent.create({
        data: {
          novelId: event.novelId,
          chapterId: event.chapterId ?? null,
          chapterIndex: event.chapterIndex ?? null,
          eventOrder: event.eventOrder,
          storyDayIndex: event.storyDayIndex ?? null,
          storyTimeLabel: event.storyTimeLabel ?? null,
          title: event.title,
          summary: event.summary,
          type: event.type,
          status: event.status,
          visibility: event.visibility,
          source: event.source,
          participantIdsJson: stringifyJson(event.participantIds),
          locationId: event.locationId ?? null,
          factionIdsJson: stringifyJson(event.factionIds),
          prerequisiteIdsJson: stringifyJson(event.prerequisiteEventIds),
          consequenceIdsJson: stringifyJson(event.consequenceEventIds),
          stateChangesJson: stringifyJson(event.stateChanges),
          eventKey: event.eventKey ?? null,
          confidence: event.confidence,
        },
      });
      created.push(mapTimelineEvent(row));
    }
    return created;
  }

  async createHooks(hooks: Array<{
    novelId: string;
    createdInChapterId: string;
    createdInChapterIndex: number;
    expectedResolveByChapterIndex?: number | null;
    title: string;
    description: string;
    priority: TimelineHook["priority"];
    relatedEventIds?: string[];
    participantIds?: string[];
  }>): Promise<void> {
    if (hooks.length === 0) {
      return;
    }
    await prisma.timelineHook.createMany({
      data: hooks.map((hook) => ({
        novelId: hook.novelId,
        createdInChapterId: hook.createdInChapterId,
        createdInChapterIndex: hook.createdInChapterIndex,
        expectedResolveByChapterIndex: hook.expectedResolveByChapterIndex ?? hook.createdInChapterIndex + 1,
        title: hook.title,
        description: hook.description,
        status: "open",
        priority: hook.priority,
        relatedEventIdsJson: stringifyJson(hook.relatedEventIds ?? []),
        participantIdsJson: stringifyJson(hook.participantIds ?? []),
      })),
    });
  }

  async markHooksAddressed(input: { hookIds: string[]; chapterId: string; chapterIndex: number; resolved?: boolean }): Promise<void> {
    if (input.hookIds.length === 0) {
      return;
    }
    await prisma.timelineHook.updateMany({
      where: { id: { in: input.hookIds } },
      data: {
        status: input.resolved ? "resolved" : "addressed",
        resolvedInChapterId: input.chapterId,
        resolvedInChapterIndex: input.chapterIndex,
      },
    });
  }

  async saveCheckReport(report: Omit<TimelineCheckReport, "id" | "createdAt">): Promise<TimelineCheckReport> {
    const row = await prisma.timelineCheckReport.create({
      data: {
        novelId: report.novelId,
        chapterId: report.chapterId,
        chapterIndex: report.chapterIndex,
        status: report.status,
        score: report.score,
        issuesJson: stringifyJson(report.issues),
      },
    });
    return mapReport(row);
  }
}

export const timelineRepository = new PrismaTimelineRepository();
