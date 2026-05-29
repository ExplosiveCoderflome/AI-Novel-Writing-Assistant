import type { GenerationContextPackage } from "@ai-novel/shared/types/chapterRuntime";
import type { TimelineCheckResult, TimelineHookDraft } from "@ai-novel/shared/types/timeline";
import {
  storyTimelineService,
  timelineCheckerService,
  timelineExtractorService,
} from "../../../modules/timeline";
import {
  ChapterAcceptanceAssessmentService,
  type ChapterAcceptanceAssessmentResult,
} from "./ChapterAcceptanceAssessmentService";
import type { ChapterRuntimeRequestInput } from "./chapterRuntimeSchema";
import {
  hashContent,
  normalizeTimelineGateResult,
  rememberCacheValue,
  type TimelineGateResult,
} from "./chapterRuntimePackageBuilders";

export interface ChapterQualityGateAgentRuntime {
  createChapterGenRun: (novelId: string, chapterId: string, chapterOrder: number) => Promise<string>;
}

export interface ChapterQualityGateServiceDeps {
  acceptanceAssessmentService?: Pick<ChapterAcceptanceAssessmentService, "assess">;
  agentRuntime: ChapterQualityGateAgentRuntime;
}

export interface RunChapterQualityGatesInput {
  novelId: string;
  chapterId: string;
  contextPackage: GenerationContextPackage;
  content: string;
  request: ChapterRuntimeRequestInput;
}

export interface RunChapterQualityGatesResult {
  acceptance: ChapterAcceptanceAssessmentResult;
  timelineGate: TimelineGateResult;
}

export class ChapterQualityGateService {
  private readonly acceptanceAssessmentService: Pick<ChapterAcceptanceAssessmentService, "assess">;
  private readonly acceptanceGateCache = new Map<string, Promise<ChapterAcceptanceAssessmentResult> | ChapterAcceptanceAssessmentResult>();
  private readonly timelineGateCache = new Map<string, Promise<TimelineGateResult> | TimelineGateResult>();

  constructor(deps: ChapterQualityGateServiceDeps) {
    this.acceptanceAssessmentService = deps.acceptanceAssessmentService ?? new ChapterAcceptanceAssessmentService();
  }

  async runGates(input: RunChapterQualityGatesInput): Promise<RunChapterQualityGatesResult> {
    const contentHash = hashContent(input.content);
    const [acceptance, timelineGate] = await Promise.all([
      this.traceChapterGate({
        novelId: input.novelId,
        chapterId: input.chapterId,
        chapterOrder: input.contextPackage.chapter.order,
        stage: "acceptance",
        blocking: true,
        contentHash,
        promptAssetKey: "novel.chapter.acceptance_assessment",
        run: () => this.runAcceptanceGate(input),
      }),
      this.traceChapterGate({
        novelId: input.novelId,
        chapterId: input.chapterId,
        chapterOrder: input.contextPackage.chapter.order,
        stage: "timeline_extraction_check",
        blocking: true,
        contentHash,
        promptAssetKey: "novel.timeline.extractor",
        run: () => this.runTimelineGate(input),
      }),
    ]);

    return {
      acceptance,
      timelineGate,
    };
  }

  private buildGateCacheKey(input: {
    gate: "acceptance" | "timeline";
    novelId: string;
    chapterId: string;
    chapterOrder: number;
    content: string;
    request: ChapterRuntimeRequestInput;
  }): string {
    return [
      input.gate,
      input.novelId,
      input.chapterId,
      input.chapterOrder,
      hashContent(input.content),
      input.request.provider ?? "default-provider",
      input.request.model ?? "default-model",
      input.request.temperature ?? "default-temperature",
    ].join(":");
  }

  private async runAcceptanceGate(input: RunChapterQualityGatesInput): Promise<ChapterAcceptanceAssessmentResult> {
    const key = this.buildGateCacheKey({
      gate: "acceptance",
      novelId: input.novelId,
      chapterId: input.chapterId,
      chapterOrder: input.contextPackage.chapter.order,
      content: input.content,
      request: input.request,
    });
    const cached = this.acceptanceGateCache.get(key);
    if (cached) {
      return cached;
    }
    const assessmentPromise = this.acceptanceAssessmentService.assess({
      novelId: input.novelId,
      chapterId: input.chapterId,
      novelTitle: input.contextPackage.bookContract?.title ?? input.contextPackage.chapter.title,
      chapterTitle: input.contextPackage.chapter.title,
      chapterOrder: input.contextPackage.chapter.order,
      targetWordCount: input.contextPackage.chapter.targetWordCount ?? null,
      content: input.content,
      contextPackage: input.contextPackage,
      provider: input.request.provider,
      model: input.request.model,
      temperature: input.request.temperature,
    });
    rememberCacheValue(this.acceptanceGateCache, key, assessmentPromise);
    try {
      const assessment = await assessmentPromise;
      rememberCacheValue(this.acceptanceGateCache, key, assessment);
      return assessment;
    } catch (error) {
      this.acceptanceGateCache.delete(key);
      throw error;
    }
  }

  private async runTimelineGate(input: RunChapterQualityGatesInput): Promise<TimelineGateResult> {
    const key = this.buildGateCacheKey({
      gate: "timeline",
      novelId: input.novelId,
      chapterId: input.chapterId,
      chapterOrder: input.contextPackage.chapter.order,
      content: input.content,
      request: input.request,
    });
    const cached = this.timelineGateCache.get(key);
    if (cached) {
      return normalizeTimelineGateResult(await cached, input.contextPackage.timelineContext ?? null);
    }
    const checkPromise = this.executeTimelineGate(input)
      .then((result) => normalizeTimelineGateResult(result, input.contextPackage.timelineContext ?? null));
    rememberCacheValue(this.timelineGateCache, key, checkPromise);
    try {
      const check = await checkPromise;
      rememberCacheValue(this.timelineGateCache, key, check);
      return check;
    } catch (error) {
      this.timelineGateCache.delete(key);
      throw error;
    }
  }

  private async executeTimelineGate(input: RunChapterQualityGatesInput): Promise<TimelineGateResult> {
    const timelineContext = input.contextPackage.timelineContext;
    if (!timelineContext) {
      return {
        result: {
          status: "warning",
          score: 0.88,
          issues: [{
            type: "unclear_time_anchor",
            severity: "warning",
            message: "本章缺少时间线上下文，无法执行完整时间线检测。",
            evidence: "timelineContext missing",
            suggestedFix: "重新组装章节上下文，确保 timeline_context 为 required block。",
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

    let result: TimelineCheckResult;
    let extractedEvents: ReturnType<typeof timelineExtractorService.normalizeEvents> = [];
    let extractedHooks: TimelineHookDraft[] = [];
    let timeAnchor: TimelineGateResult["timeAnchor"] = null;
    let addressedHookIds: string[] = [];
    let resolvedHookIds: string[] = [];
    let extractorSucceeded = false;
    let extractorError: string | null = null;
    try {
      const extracted = await timelineExtractorService.extractFromChapter({
        novelId: input.novelId,
        chapterId: input.chapterId,
        chapterIndex: input.contextPackage.chapter.order,
        novelTitle: input.contextPackage.bookContract?.title ?? input.contextPackage.chapter.title,
        chapterTitle: input.contextPackage.chapter.title,
        chapterGoal: input.contextPackage.chapterMission?.objective
          ?? input.contextPackage.chapter.expectation
          ?? "推进当前章节任务",
        chapterContent: input.content,
        timelineContext,
        provider: input.request.provider,
        model: input.request.model,
        temperature: input.request.temperature,
      });
      extractedEvents = timelineExtractorService.normalizeEvents(extracted);
      extractedHooks = timelineExtractorService.normalizeHooks(extracted);
      timeAnchor = extracted.timeAnchor ?? null;
      addressedHookIds = extracted.addressedHookIds ?? [];
      resolvedHookIds = extracted.resolvedHookIds ?? [];
      extractorSucceeded = true;
      result = timelineCheckerService.checkChapter({
        novelId: input.novelId,
        chapterId: input.chapterId,
        chapterIndex: input.contextPackage.chapter.order,
        extractedEvents,
        timelineContext,
        chapterContent: input.content,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      extractorError = message;
      result = {
        status: "warning",
        score: 0.82,
        issues: [{
          type: "unclear_time_anchor",
          severity: "warning",
          message: "时间线抽取或检测未完成，章节需要后续复查。",
          evidence: message,
          suggestedFix: "重试时间线检测；若仍失败，人工检查章节承接和未来事件泄漏。",
          relatedEventIds: [],
          relatedHookIds: [],
        }],
      };
    }

    await storyTimelineService.saveCheckReport({
      novelId: input.novelId,
      chapterId: input.chapterId,
      chapterIndex: input.contextPackage.chapter.order,
      result,
    }).catch((error) => {
      console.warn("[chapter-runtime] timeline report save skipped", {
        novelId: input.novelId,
        chapterId: input.chapterId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
    return {
      result,
      extractedEvents,
      extractedHooks,
      timeAnchor,
      addressedHookIds,
      resolvedHookIds,
      extractorSucceeded,
      extractorError,
      timelineContext,
    };
  }

  private async traceChapterGate<T>(input: {
    novelId: string;
    chapterId: string;
    chapterOrder: number;
    stage: string;
    blocking: boolean;
    contentHash: string;
    promptAssetKey: string;
    retryReason?: string;
    run: () => Promise<T>;
  }): Promise<T> {
    const startedAt = Date.now();
    try {
      const result = await input.run();
      console.info("[chapter-runtime-trace]", {
        novelId: input.novelId,
        chapterId: input.chapterId,
        chapterOrder: input.chapterOrder,
        attemptNo: 1,
        stage: input.stage,
        blocking: input.blocking,
        contentHash: input.contentHash,
        durationMs: Date.now() - startedAt,
        promptAssetKey: input.promptAssetKey,
        retryReason: input.retryReason ?? null,
        status: "succeeded",
      });
      return result;
    } catch (error) {
      console.warn("[chapter-runtime-trace]", {
        novelId: input.novelId,
        chapterId: input.chapterId,
        chapterOrder: input.chapterOrder,
        attemptNo: 1,
        stage: input.stage,
        blocking: input.blocking,
        contentHash: input.contentHash,
        durationMs: Date.now() - startedAt,
        promptAssetKey: input.promptAssetKey,
        retryReason: input.retryReason ?? null,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
