import { createHash } from "node:crypto";
import type { GenerationContextPackage } from "@ai-novel/shared/types/chapterRuntime";
import type {
  ExtractedTimelineEvent,
  TimelineCheckResult,
  TimelineContextForChapter,
  TimelineHookDraft,
} from "@ai-novel/shared/types/timeline";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { prisma } from "../../../db/prisma";
import {
  storyTimelineService,
  timelineCheckerService,
  timelineContextService,
  timelineExtractorService,
  timelineRepository,
} from "../../../modules/timeline";

export type ChapterTimelineFinalizationMode = "stable" | "degraded";

export interface ChapterTimelineGateResult {
  result: TimelineCheckResult;
  extractedEvents: ExtractedTimelineEvent[];
  extractedHooks: TimelineHookDraft[];
  timeAnchor?: { storyDayIndex?: number | null; label?: string | null } | null;
  addressedHookIds: string[];
  resolvedHookIds: string[];
  extractorSucceeded: boolean;
  extractorError?: string | null;
  timelineContext: TimelineContextForChapter | null;
}

export interface ChapterTimelineFinalizationResult {
  syncMode: ChapterTimelineFinalizationMode;
  contentHash: string;
  extractorSucceeded: boolean;
  eventCount: number;
  hookCount: number;
  checkpointWritten: boolean;
}

interface TimelineFinalizationRequestOptions {
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
}

interface FinalizeCurrentContentInput {
  novelId: string;
  chapterId: string;
  content: string;
  contextPackage?: GenerationContextPackage | null;
  request?: TimelineFinalizationRequestOptions;
  timelineGate?: ChapterTimelineGateResult | null;
  mode?: ChapterTimelineFinalizationMode;
  reason?: string;
  sourceStage: string;
  qualityDebt?: boolean;
}

function hashContent(content: string): string {
  return createHash("sha1").update(content).digest("hex");
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

function chapterGoalFromContext(contextPackage: GenerationContextPackage | null | undefined): string {
  return uniqueStrings([
    contextPackage?.chapterMission?.objective,
    contextPackage?.chapter.expectation,
    contextPackage?.plan?.objective,
  ]).join("\n") || "推进当前章节任务";
}

function fallbackTimeLabel(input: {
  chapterIndex: number;
  contextPackage?: GenerationContextPackage | null;
  timelineContext?: TimelineContextForChapter | null;
}): string {
  return input.timelineContext?.currentTime?.label?.trim()
    || input.contextPackage?.timelineContext?.currentTime?.label?.trim()
    || `第 ${input.chapterIndex} 章`;
}

function openHookIds(context: TimelineContextForChapter | null | undefined): string[] {
  return context?.openHooks?.map((hook) => hook.id) ?? [];
}

function plannedEventIds(context: TimelineContextForChapter | null | undefined): string[] {
  return context?.plannedEventsThisChapter?.map((event) => event.id) ?? [];
}

function forbiddenEventIds(context: TimelineContextForChapter | null | undefined): string[] {
  return context?.forbiddenEvents?.map((event) => event.id) ?? [];
}

export class ChapterTimelineFinalizationService {
  async hasCurrentFinalization(input: {
    novelId: string;
    chapterId: string;
    content: string;
  }): Promise<boolean> {
    return Boolean(await this.findCurrentFinalizationMode(input));
  }

  private async findCurrentFinalizationMode(input: {
    novelId: string;
    chapterId: string;
    content: string;
  }): Promise<ChapterTimelineFinalizationMode | null> {
    const contentHash = hashContent(input.content.trim());
    const row = await prisma.chapterArtifactSyncCheckpoint.findFirst({
      where: {
        novelId: input.novelId,
        chapterId: input.chapterId,
        contentHash,
        artifactType: "timeline_finalization",
        syncMode: { in: ["stable", "degraded"] },
        status: "succeeded",
      },
      orderBy: [
        { syncMode: "desc" },
        { updatedAt: "desc" },
      ],
      select: { syncMode: true },
    });
    return row?.syncMode === "stable" || row?.syncMode === "degraded" ? row.syncMode : null;
  }

  async ensurePreviousChapterFinalized(input: {
    novelId: string;
    currentChapterOrder: number;
    request?: TimelineFinalizationRequestOptions;
  }): Promise<ChapterTimelineFinalizationResult | null> {
    const previousChapter = await prisma.chapter.findFirst({
      where: {
        novelId: input.novelId,
        order: input.currentChapterOrder - 1,
        content: { not: null },
      },
      select: {
        id: true,
        title: true,
        order: true,
        content: true,
        expectation: true,
      },
    });
    const previousContent = previousChapter?.content?.trim();
    if (!previousChapter || !previousContent) {
      return null;
    }
    if (await this.hasCurrentFinalization({
      novelId: input.novelId,
      chapterId: previousChapter.id,
      content: previousContent,
    })) {
      return null;
    }
    const novel = await prisma.novel.findUnique({
      where: { id: input.novelId },
      select: { title: true },
    });
    const timelineContext = await timelineContextService.buildForChapter({
      novelId: input.novelId,
      chapterId: previousChapter.id,
      chapterIndex: previousChapter.order,
    }).catch(() => null);
    const contextPackage = {
      chapter: {
        id: previousChapter.id,
        title: previousChapter.title,
        order: previousChapter.order,
        content: previousContent,
        expectation: previousChapter.expectation,
        supportingContextText: "",
      },
      timelineContext,
      bookContract: novel?.title ? { title: novel.title } : null,
    } as unknown as GenerationContextPackage;
    return this.finalizeCurrentContent({
      novelId: input.novelId,
      chapterId: previousChapter.id,
      content: previousContent,
      contextPackage,
      request: input.request,
      sourceStage: "previous_chapter_guard",
      reason: "missing_current_timeline_finalization_checkpoint",
    });
  }

  async finalizeCurrentContent(input: FinalizeCurrentContentInput): Promise<ChapterTimelineFinalizationResult> {
    const content = input.content.trim();
    const contentHash = hashContent(content);
    const existingMode = await this.findCurrentFinalizationMode({
      novelId: input.novelId,
      chapterId: input.chapterId,
      content,
    });
    if (existingMode === "stable" || (existingMode === "degraded" && input.mode === "degraded")) {
      return {
        syncMode: existingMode,
        contentHash,
        extractorSucceeded: existingMode === "stable",
        eventCount: 0,
        hookCount: 0,
        checkpointWritten: true,
      };
    }
    if (!content) {
      return this.finalizeDegraded({
        ...input,
        content,
        contentHash,
        reason: input.reason ?? "empty_final_content",
        timelineContext: input.contextPackage?.timelineContext ?? null,
        extractorSucceeded: false,
        eventCount: 0,
        hookCount: 0,
        anchorFallbackUsed: true,
      });
    }

    const chapter = input.contextPackage?.chapter;
    const chapterIndex = chapter?.order ?? await this.resolveChapterOrder(input.chapterId);
    const timelineContext = input.timelineGate?.timelineContext
      ?? input.contextPackage?.timelineContext
      ?? await timelineContextService.buildForChapter({
        novelId: input.novelId,
        chapterId: input.chapterId,
        chapterIndex,
      }).catch(() => null);

    if (input.mode === "degraded") {
      return this.finalizeDegraded({
        ...input,
        content,
        contentHash,
        timelineContext,
        extractorSucceeded: input.timelineGate?.extractorSucceeded ?? false,
        eventCount: input.timelineGate?.extractedEvents.length ?? 0,
        hookCount: input.timelineGate?.extractedHooks.length ?? 0,
        anchorFallbackUsed: true,
      });
    }

    const gate = input.timelineGate ?? await this.extractAndCheck({
      novelId: input.novelId,
      chapterId: input.chapterId,
      chapterIndex,
      chapterTitle: chapter?.title ?? `第 ${chapterIndex} 章`,
      novelTitle: input.contextPackage?.bookContract?.title ?? "当前小说",
      chapterGoal: chapterGoalFromContext(input.contextPackage),
      content,
      timelineContext,
      request: input.request,
    });

    if (!gate.timelineContext || !gate.extractorSucceeded || gate.result.status === "failed") {
      return this.finalizeDegraded({
        ...input,
        content,
        contentHash,
        timelineContext: gate.timelineContext ?? timelineContext,
        extractorSucceeded: gate.extractorSucceeded,
        eventCount: gate.extractedEvents.length,
        hookCount: gate.extractedHooks.length,
        anchorFallbackUsed: !gate.timeAnchor,
        reason: input.reason ?? gate.extractorError ?? `timeline_${gate.result.status}`,
      });
    }

    try {
      await storyTimelineService.commitChapterTimeline({
        novelId: input.novelId,
        chapterId: input.chapterId,
        chapterIndex,
        timeAnchor: gate.timeAnchor ?? null,
        extractedEvents: gate.extractedEvents,
        extractedHooks: gate.extractedHooks,
        addressedHookIds: gate.addressedHookIds,
        resolvedHookIds: gate.resolvedHookIds,
        timelineContext: gate.timelineContext,
      });
    } catch (error) {
      return this.finalizeDegraded({
        ...input,
        content,
        contentHash,
        timelineContext: gate.timelineContext,
        extractorSucceeded: gate.extractorSucceeded,
        eventCount: gate.extractedEvents.length,
        hookCount: gate.extractedHooks.length,
        anchorFallbackUsed: !gate.timeAnchor,
        reason: `stable_commit_failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }

    await this.markCheckpoint({
      novelId: input.novelId,
      chapterId: input.chapterId,
      contentHash,
      syncMode: "stable",
      sourceStage: input.sourceStage,
      metadata: {
        reason: input.reason ?? "stable_timeline_finalized",
        sourceStage: input.sourceStage,
        extractorSucceeded: true,
        eventCount: gate.extractedEvents.length,
        hookCount: gate.extractedHooks.length,
        anchorFallbackUsed: !gate.timeAnchor,
        qualityDebt: Boolean(input.qualityDebt),
      },
    });
    return {
      syncMode: "stable",
      contentHash,
      extractorSucceeded: true,
      eventCount: gate.extractedEvents.length,
      hookCount: gate.extractedHooks.length,
      checkpointWritten: true,
    };
  }

  private async extractAndCheck(input: {
    novelId: string;
    chapterId: string;
    chapterIndex: number;
    novelTitle: string;
    chapterTitle: string;
    chapterGoal: string;
    content: string;
    timelineContext: TimelineContextForChapter | null;
    request?: TimelineFinalizationRequestOptions;
  }): Promise<ChapterTimelineGateResult> {
    if (!input.timelineContext) {
      return {
        result: {
          status: "warning",
          score: 0.82,
          issues: [{
            type: "unclear_time_anchor",
            severity: "warning",
            message: "缺少时间线上下文，已降级提交最小 timeline checkpoint。",
            evidence: "timelineContext missing",
            suggestedFix: "重新组装章节上下文后补跑 timeline finalization。",
            relatedEventIds: [],
            relatedHookIds: [],
          }],
        },
        extractedEvents: [],
        extractedHooks: [],
        timeAnchor: null,
        addressedHookIds: [],
        resolvedHookIds: [],
        extractorSucceeded: false,
        extractorError: "timelineContext missing",
        timelineContext: null,
      };
    }
    try {
      const extracted = await timelineExtractorService.extractFromChapter({
        novelId: input.novelId,
        chapterId: input.chapterId,
        chapterIndex: input.chapterIndex,
        novelTitle: input.novelTitle,
        chapterTitle: input.chapterTitle,
        chapterGoal: input.chapterGoal,
        chapterContent: input.content,
        timelineContext: input.timelineContext,
        provider: input.request?.provider,
        model: input.request?.model,
        temperature: input.request?.temperature,
      });
      const extractedEvents = timelineExtractorService.normalizeEvents(extracted);
      const extractedHooks = timelineExtractorService.normalizeHooks(extracted);
      const result = timelineCheckerService.checkChapter({
        novelId: input.novelId,
        chapterId: input.chapterId,
        chapterIndex: input.chapterIndex,
        extractedEvents,
        timelineContext: input.timelineContext,
        chapterContent: input.content,
      });
      await storyTimelineService.saveCheckReport({
        novelId: input.novelId,
        chapterId: input.chapterId,
        chapterIndex: input.chapterIndex,
        result,
      }).catch(() => null);
      return {
        result,
        extractedEvents,
        extractedHooks,
        timeAnchor: extracted.timeAnchor ?? null,
        addressedHookIds: extracted.addressedHookIds ?? [],
        resolvedHookIds: extracted.resolvedHookIds ?? [],
        extractorSucceeded: true,
        extractorError: null,
        timelineContext: input.timelineContext,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const result: TimelineCheckResult = {
        status: "warning",
        score: 0.82,
        issues: [{
          type: "unclear_time_anchor",
          severity: "warning",
          message: "时间线抽取或检测未完成，已降级提交最小 timeline checkpoint。",
          evidence: message,
          suggestedFix: "重试时间线检测；若仍失败，人工检查章节承接和未来事件泄漏。",
          relatedEventIds: [],
          relatedHookIds: [],
        }],
      };
      await storyTimelineService.saveCheckReport({
        novelId: input.novelId,
        chapterId: input.chapterId,
        chapterIndex: input.chapterIndex,
        result,
      }).catch(() => null);
      return {
        result,
        extractedEvents: [],
        extractedHooks: [],
        timeAnchor: null,
        addressedHookIds: [],
        resolvedHookIds: [],
        extractorSucceeded: false,
        extractorError: message,
        timelineContext: input.timelineContext,
      };
    }
  }

  private async finalizeDegraded(input: FinalizeCurrentContentInput & {
    contentHash: string;
    timelineContext: TimelineContextForChapter | null;
    extractorSucceeded: boolean;
    eventCount: number;
    hookCount: number;
    anchorFallbackUsed: boolean;
  }): Promise<ChapterTimelineFinalizationResult> {
    const chapterIndex = input.contextPackage?.chapter.order ?? await this.resolveChapterOrder(input.chapterId);
    await timelineRepository.upsertChapterTimeAnchor({
      novelId: input.novelId,
      chapterId: input.chapterId,
      chapterIndex,
      storyDayIndex: input.timelineContext?.currentTime?.storyDayIndex ?? null,
      timeLabel: fallbackTimeLabel({
        chapterIndex,
        contextPackage: input.contextPackage,
        timelineContext: input.timelineContext,
      }),
      startsAfterEventIds: input.timelineContext?.previousEvents?.slice(-3).map((event) => event.id) ?? [],
      plannedEventIds: plannedEventIds(input.timelineContext),
      endedWithEventIds: [],
      previousHookIds: openHookIds(input.timelineContext),
      nextHookIds: [],
      forbiddenEventIds: forbiddenEventIds(input.timelineContext),
    });
    if (input.qualityDebt || input.sourceStage === "defer_and_continue") {
      await timelineRepository.expireOverdueImmediateHooks({
        novelId: input.novelId,
        chapterId: input.chapterId,
        chapterIndex,
      });
    }
    await this.markCheckpoint({
      novelId: input.novelId,
      chapterId: input.chapterId,
      contentHash: input.contentHash,
      syncMode: "degraded",
      sourceStage: input.sourceStage,
      metadata: {
        reason: input.reason ?? "degraded_timeline_finalized",
        sourceStage: input.sourceStage,
        extractorSucceeded: input.extractorSucceeded,
        eventCount: input.eventCount,
        hookCount: input.hookCount,
        anchorFallbackUsed: input.anchorFallbackUsed,
        qualityDebt: Boolean(input.qualityDebt),
      },
    });
    return {
      syncMode: "degraded",
      contentHash: input.contentHash,
      extractorSucceeded: input.extractorSucceeded,
      eventCount: input.eventCount,
      hookCount: input.hookCount,
      checkpointWritten: true,
    };
  }

  private async resolveChapterOrder(chapterId: string): Promise<number> {
    const chapter = await prisma.chapter.findUnique({
      where: { id: chapterId },
      select: { order: true },
    });
    return chapter?.order ?? 0;
  }

  private async markCheckpoint(input: {
    novelId: string;
    chapterId: string;
    contentHash: string;
    syncMode: ChapterTimelineFinalizationMode;
    sourceStage: string;
    metadata: Record<string, unknown>;
  }): Promise<void> {
    await prisma.chapterArtifactSyncCheckpoint.upsert({
      where: {
        novelId_chapterId_contentHash_artifactType_syncMode: {
          novelId: input.novelId,
          chapterId: input.chapterId,
          contentHash: input.contentHash,
          artifactType: "timeline_finalization",
          syncMode: input.syncMode,
        },
      },
      create: {
        novelId: input.novelId,
        chapterId: input.chapterId,
        contentHash: input.contentHash,
        artifactType: "timeline_finalization",
        syncMode: input.syncMode,
        status: "succeeded",
        sourceType: "chapter_runtime",
        sourceStage: input.sourceStage,
        metadataJson: JSON.stringify(input.metadata),
      },
      update: {
        status: "succeeded",
        sourceType: "chapter_runtime",
        sourceStage: input.sourceStage,
        metadataJson: JSON.stringify(input.metadata),
        updatedAt: new Date(),
      },
    });
  }
}

export const chapterTimelineFinalizationService = new ChapterTimelineFinalizationService();
