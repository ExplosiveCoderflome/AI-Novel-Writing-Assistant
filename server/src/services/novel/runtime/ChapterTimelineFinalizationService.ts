import type { GenerationContextPackage } from "@ai-novel/shared/types/chapterRuntime";
import type {
  ExtractedTimelineEvent,
  TimelineCheckResult,
  TimelineContextForChapter,
  TimelineHookDraft,
} from "@ai-novel/shared/types/timeline";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import {
  storyTimelineService,
  timelineCheckerService,
  timelineContextService,
  timelineExtractorService,
  buildTimelineContentHash as hashContent,
  TimelineContentVersionError,
  TimelineFinalizationStore,
  TIMELINE_FINALIZATION_RUNNING_STALE_MS,
  chapterGoalFromContext, fallbackTimeLabel, openHookIds, plannedEventIds, forbiddenEventIds,
  type ChapterTimelineFinalizationMode,
} from "../../../modules/timeline";

export type { ChapterTimelineFinalizationMode } from "../../../modules/timeline";

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

export class ChapterTimelineFinalizationService {
  constructor(private readonly store = new TimelineFinalizationStore()) {}

  async ensureBeforeGeneration(input: {
    novelId: string;
    chapterId: string;
    request?: TimelineFinalizationRequestOptions;
  }): Promise<void> {
    const current = await this.store.findChapter(input.novelId, input.chapterId);
    if (!current) throw new Error("章节不存在，无法准备时间线上下文。");
    const pending = await this.store.listPendingEarlierChapters(input.novelId, current.order);
    for (const { chapter } of pending) {
      await this.waitForFinalization(async () => {
        const latest = await this.store.findChapter(input.novelId, chapter.id);
        if (!latest) return null;
        const version = { novelId: input.novelId, chapterId: chapter.id, content: latest.content ?? "" };
        if (await this.hasCurrentFinalization(version)) return null;
        return this.finalizeCurrentContent({
          ...version, request: input.request, sourceStage: "manual_edit_before_generation",
        });
      });
    }
    await this.waitForFinalization(() => this.ensurePreviousChapterFinalized({
      novelId: input.novelId, currentChapterOrder: current.order, request: input.request,
    }));
  }

  private async waitForFinalization(
    operation: () => Promise<ChapterTimelineFinalizationResult | null>,
  ): Promise<void> {
    const deadline = Date.now() + TIMELINE_FINALIZATION_RUNNING_STALE_MS + 1000;
    for (;;) {
      try {
        const result = await operation();
        if (!result || result.checkpointWritten) return;
      } catch (error) {
        // A concurrent edit is reloaded on the next attempt, never committed as old context.
        if (!(error instanceof TimelineContentVersionError)) throw error;
      }
      if (Date.now() >= deadline) throw new Error("前文时间线同步未能完成，请稍后从章节页继续写作。");
      await new Promise<void>((resolve) => setTimeout(resolve, 1000));
    }
  }

  async hasCurrentFinalization(input: {
    novelId: string;
    chapterId: string;
    content: string;
  }): Promise<boolean> {
    return Boolean(await this.store.findCurrentFinalizationMode(input));
  }

  async ensurePreviousChapterFinalized(input: {
    novelId: string;
    currentChapterOrder: number;
    request?: TimelineFinalizationRequestOptions;
  }): Promise<ChapterTimelineFinalizationResult | null> {
    const previousChapter = await this.store.findPreviousChapter(input.novelId, input.currentChapterOrder);
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
    const novel = await this.store.findNovelTitle(input.novelId);
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
    const existingMode = await this.store.findCurrentFinalizationMode({
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
    const chapterIndex = chapter?.order ?? await this.store.resolveChapterOrder(input.chapterId);
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

    const stableClaim = await this.store.claimCheckpoint({
      novelId: input.novelId,
      chapterId: input.chapterId,
      contentHash,
      syncMode: "stable",
      sourceStage: input.sourceStage,
      metadata: {
        reason: input.reason ?? "stable_timeline_finalization_started",
        sourceStage: input.sourceStage,
      },
    });
    if (stableClaim === "already_done") {
      return {
        syncMode: "stable",
        contentHash,
        extractorSucceeded: true,
        eventCount: 0,
        hookCount: 0,
        checkpointWritten: true,
      };
    }
    if (stableClaim === "running") {
      return {
        syncMode: "stable",
        contentHash,
        extractorSucceeded: false,
        eventCount: 0,
        hookCount: 0,
        checkpointWritten: false,
      };
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
      await this.store.markCheckpointFailed({
        novelId: input.novelId,
        chapterId: input.chapterId,
        contentHash,
        syncMode: "stable",
        sourceStage: input.sourceStage,
        metadata: {
          reason: input.reason ?? gate.extractorError ?? `timeline_${gate.result.status}`,
          sourceStage: input.sourceStage,
          extractorSucceeded: gate.extractorSucceeded,
        },
      });
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
      await this.store.commitStable({
        version: input,
        timeline: {
          novelId: input.novelId,
          chapterId: input.chapterId,
          chapterIndex,
          timeAnchor: gate.timeAnchor ?? null,
          extractedEvents: gate.extractedEvents,
          extractedHooks: gate.extractedHooks,
          addressedHookIds: gate.addressedHookIds,
          resolvedHookIds: gate.resolvedHookIds,
          timelineContext: gate.timelineContext!,
        },
        checkpoint: {
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
        },
      });

    } catch (error) {
      if (error instanceof TimelineContentVersionError) throw error;
      await this.store.markCheckpointFailed({
        novelId: input.novelId,
        chapterId: input.chapterId,
        contentHash,
        syncMode: "stable",
        sourceStage: input.sourceStage,
        metadata: {
          reason: `stable_commit_failed: ${error instanceof Error ? error.message : String(error)}`,
          sourceStage: input.sourceStage,
          extractorSucceeded: gate.extractorSucceeded,
        },
      });
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
    const chapterIndex = input.contextPackage?.chapter.order ?? await this.store.resolveChapterOrder(input.chapterId);
    await this.store.commitDegraded({
      version: input,
      anchor: {
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
      },
      expireOverdueHooks: Boolean(input.qualityDebt || input.sourceStage === "defer_and_continue"),
      checkpoint: {
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

}

export const chapterTimelineFinalizationService = new ChapterTimelineFinalizationService();
