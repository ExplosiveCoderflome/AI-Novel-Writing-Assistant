import type { BaseMessageChunk } from "@langchain/core/messages";
import type { StreamDoneHelpers, StreamDonePayload, WritableSSEFrame } from "../../../llm/streaming";
import type {
  ChapterRuntimePackage,
  GenerationContextPackage,
} from "@ai-novel/shared/types/chapterRuntime";
import type { QualityScore, ReviewIssue } from "@ai-novel/shared/types/novel";
import { prisma } from "../../../db/prisma";
import { mergeChapterPatchForGenerationStateBump } from "../chapterLifecycleState";
import { auditService } from "../../audit/AuditService";
import { plannerService } from "../../planner/PlannerService";
import { ChapterWritingGraph } from "../chapterWritingGraph";
import { toText } from "../novelP0Utils";
import { ChapterArtifactSyncService } from "./ChapterArtifactSyncService";
import { GenerationContextAssembler } from "./GenerationContextAssembler";
import {
  ChapterAcceptanceAssessmentService,
} from "./ChapterAcceptanceAssessmentService";
import { ChapterRuntimeReadinessService } from "./ChapterRuntimeReadinessService";
import { chapterRuntimeRequestSchema, type ChapterRuntimeRequestInput } from "./chapterRuntimeSchema";
import { NovelVolumeService } from "../volume/NovelVolumeService";
import {
  runPipelineChapterWithRuntime,
  type AssembledRuntimeChapter,
  type PipelineRuntimeHooks,
  type PipelineRuntimeInput,
  type PipelineRuntimeResult,
} from "./chapterRuntimePipeline";
import {
  assertChapterContentNotEmpty,
  isChapterEmptyContentError,
  type ChapterEmptyContentError,
} from "./chapterEmptyContentError";
import type { RepairOptions, ReviewOptions } from "../novelCoreShared";
import { ChapterRepairStreamRuntime } from "./repair/ChapterRepairStreamRuntime";
import {
  chapterTimelineFinalizationService,
  type ChapterTimelineFinalizationService,
} from "./ChapterTimelineFinalizationService";
import {
  shouldEscalateToFullAudit,
} from "./chapterRuntimePackageBuilders";
import { ChapterQualityGateService } from "./ChapterQualityGateService";
import {
  ChapterContentFinalizationService,
  type FinalizeChapterContentResult,
} from "./ChapterContentFinalizationService";

interface AgentRuntimeLike {
  createChapterGenRun: (novelId: string, chapterId: string, chapterOrder: number) => Promise<string>;
  finishChapterGenRun: (runId: string, summary: string, durationMs: number) => Promise<void>;
}

interface ChapterRuntimeCoordinatorDeps {
  assembler?: Pick<GenerationContextAssembler, "assemble">;
  chapterWritingGraph?: Pick<ChapterWritingGraph, "createChapterStream">;
  artifactSyncService?: Pick<ChapterArtifactSyncService, "saveDraftAndArtifacts" | "syncChapterArtifacts">;
  auditService?: Pick<typeof auditService, "auditChapter" | "assessChapterAuditNeed">;
  plannerService?: Pick<typeof plannerService, "buildReplanRecommendation" | "shouldTriggerReplanFromAudit">;
  acceptanceAssessmentService?: Pick<ChapterAcceptanceAssessmentService, "assess">;
  readinessService?: Pick<ChapterRuntimeReadinessService, "assertReady">;
  agentRuntime?: AgentRuntimeLike;
  ensureNovelCharacters?: (novelId: string, actionName: string, minCount?: number) => Promise<void>;
  ensureChapterExecutionContract?: (
    novelId: string,
    chapterId: string,
    options: ChapterRuntimeRequestInput,
  ) => Promise<unknown>;
  validateRequest?: (input: ChapterRuntimeRequestInput) => ChapterRuntimeRequestInput;
  reviewChapterAfterRepair?: (
    novelId: string,
    chapterId: string,
    options: ReviewOptions,
  ) => Promise<{ score: QualityScore; issues: ReviewIssue[] }>;
  resolveAuditIssues?: (novelId: string, issueIds: string[]) => Promise<unknown>;
  timelineFinalizer?: Pick<
    ChapterTimelineFinalizationService,
    "finalizeCurrentContent" | "ensurePreviousChapterFinalized"
  >;
}

export class ChapterRuntimeCoordinator {
  private readonly deps: Omit<
    Required<ChapterRuntimeCoordinatorDeps>,
    "agentRuntime" | "reviewChapterAfterRepair" | "resolveAuditIssues" | "timelineFinalizer"
  > & {
    agentRuntime?: ChapterRuntimeCoordinatorDeps["agentRuntime"];
  };
  private readonly repairStreamRuntime: ChapterRepairStreamRuntime;
  private readonly qualityGateService: ChapterQualityGateService;
  private readonly contentFinalizationService: ChapterContentFinalizationService;
  private readonly timelineFinalizer: Pick<
    ChapterTimelineFinalizationService,
    "finalizeCurrentContent" | "ensurePreviousChapterFinalized"
  >;

  constructor(deps: ChapterRuntimeCoordinatorDeps = {}) {
    const artifactSyncService = deps.artifactSyncService ?? new ChapterArtifactSyncService();
    this.timelineFinalizer = deps.timelineFinalizer ?? chapterTimelineFinalizationService;
    const reviewChapterAfterRepair = deps.reviewChapterAfterRepair
      ?? ((novelId: string, chapterId: string, options: ReviewOptions) =>
        (new (require("../novelCoreReviewService").NovelCoreReviewService)()).reviewChapter(novelId, chapterId, options));
    this.deps = {
      assembler: deps.assembler ?? new GenerationContextAssembler(),
      chapterWritingGraph: deps.chapterWritingGraph ?? new ChapterWritingGraph({
        enforceOpeningDiversity: async (_novelId, _chapterOrder, _chapterTitle, content) => ({
          content,
          rewritten: false,
          maxSimilarity: 0,
        }),
        saveDraftAndArtifacts: (...args) => artifactSyncService.saveDraftAndArtifacts(...args),
        logInfo: (message, meta) => {
          if (meta) {
            console.info(`[chapter-runtime] ${message}`, meta);
            return;
          }
          console.info(`[chapter-runtime] ${message}`);
        },
        logWarn: (message, meta) => {
          if (meta) {
            console.warn(`[chapter-runtime] ${message}`, meta);
            return;
          }
          console.warn(`[chapter-runtime] ${message}`);
        },
      }),
      artifactSyncService,
      auditService: deps.auditService ?? auditService,
      plannerService: deps.plannerService ?? plannerService,
      acceptanceAssessmentService: deps.acceptanceAssessmentService ?? new ChapterAcceptanceAssessmentService(),
      readinessService: deps.readinessService ?? new ChapterRuntimeReadinessService(),
      agentRuntime: deps.agentRuntime,
      ensureNovelCharacters: deps.ensureNovelCharacters ?? this.ensureNovelCharacters.bind(this),
      ensureChapterExecutionContract: deps.ensureChapterExecutionContract
        ?? ((novelId, chapterId, options) => new NovelVolumeService().ensureChapterExecutionContract(novelId, chapterId, options)),
      validateRequest: deps.validateRequest ?? ((input) => chapterRuntimeRequestSchema.parse(input)),
    };
    this.repairStreamRuntime = new ChapterRepairStreamRuntime({
      assembler: this.deps.assembler,
      artifactSyncService,
      reviewChapterAfterRepair,
      resolveAuditIssues: deps.resolveAuditIssues,
      timelineFinalizer: this.timelineFinalizer,
    });
    this.qualityGateService = new ChapterQualityGateService({
      acceptanceAssessmentService: this.deps.acceptanceAssessmentService,
      agentRuntime: this.getAgentRuntime(),
    });
    this.contentFinalizationService = new ChapterContentFinalizationService({
      qualityGateService: this.qualityGateService,
      artifactSyncService,
      plannerService: this.deps.plannerService,
      timelineFinalizer: this.timelineFinalizer,
      agentRuntime: this.getAgentRuntime(),
    });
  }

  async createChapterStream(
    novelId: string,
    chapterId: string,
    options: ChapterRuntimeRequestInput = {},
    config: { includeRuntimePackage: boolean } = { includeRuntimePackage: false },
  ): Promise<{
    stream: AsyncIterable<BaseMessageChunk>;
    onDone: (fullContent: string, helpers: StreamDoneHelpers) => Promise<void | StreamDonePayload>;
  }> {
    const request = this.deps.validateRequest(options);
    await this.deps.ensureNovelCharacters(novelId, "generate chapter content");
    await this.ensurePreviousChapterTimelineFinalized(novelId, chapterId, request);

    const assembled = await this.deps.assembler.assemble(novelId, chapterId, request);
    this.deps.readinessService.assertReady(assembled.contextPackage);
    this.assertStateDrivenReady(assembled.contextPackage, request);
    await this.markChapterStatus(chapterId, "generating");
    const agentRuntime = this.getAgentRuntime();

    let traceRunId: string | null = null;
    try {
      traceRunId = await agentRuntime.createChapterGenRun(novelId, chapterId, assembled.chapter.order);
    } catch {
      traceRunId = null;
    }

    const startMs = Date.now();
    const writerResult = await this.deps.chapterWritingGraph.createChapterStream({
      novelId,
      novelTitle: assembled.novel.title,
      chapter: assembled.chapter,
      contextPackage: assembled.contextPackage,
      options: request,
    });

    return {
      stream: writerResult.stream,
      onDone: async (fullContent: string, helpers: StreamDoneHelpers) => {
        const runStatusId = traceRunId ?? `chapter-runtime:${chapterId}`;
        this.emitRunStatus(helpers, {
          type: "run_status",
          runId: runStatusId,
          status: "running",
          phase: "finalizing",
          message: "正文已生成，正在整理章节文本并保存草稿。",
        });
        const normalized = await this.resolveWriterResultWithEmptyRetry({
          novelId,
          chapterId,
          request,
          assembled,
          writerDone: () => writerResult.onDone(fullContent),
          fallbackContent: fullContent,
        });
        const generatedContent = normalized.finalContent;
        this.emitRunStatus(helpers, {
          type: "run_status",
          runId: runStatusId,
          status: "running",
          phase: "finalizing",
          message: "正在完成正文接收检查并同步章节状态。",
        });
        const finalized = await this.finalizeChapterContent({
          novelId,
          chapterId,
          request,
          contextPackage: assembled.contextPackage,
          content: generatedContent,
          lengthControl: normalized?.lengthControl,
          runId: traceRunId,
          startMs,
          deferArtifactBackgroundSync: true,
        });
        this.emitRunStatus(helpers, {
          type: "run_status",
          runId: runStatusId,
          status: "succeeded",
          phase: "completed",
          message: finalized.runtimePackage.audit.hasBlockingIssues
            ? "章节已保存，但检测到待修复问题。"
            : "章节已保存，可继续审校。",
        });

        return {
          fullContent: finalized.finalContent,
          frames: config.includeRuntimePackage
            ? [{ type: "runtime_package", package: finalized.runtimePackage }]
            : [],
        };
      },
    };
  }

  async createRepairStream(
    novelId: string,
    chapterId: string,
    options: RepairOptions = {},
  ): Promise<{
    stream: AsyncIterable<BaseMessageChunk>;
    onDone: (fullContent: string, helpers: StreamDoneHelpers) => Promise<void>;
  }> {
    return this.repairStreamRuntime.createRepairStream(novelId, chapterId, options);
  }

  async runPipelineChapter(
    novelId: string,
    chapterId: string,
    options: PipelineRuntimeInput = {},
    hooks: PipelineRuntimeHooks = {},
  ): Promise<PipelineRuntimeResult> {
    const request = this.deps.validateRequest(options);
    await this.ensurePreviousChapterTimelineFinalized(novelId, chapterId, request);
    const assembled = await this.deps.assembler.assemble(novelId, chapterId, request);
    this.deps.readinessService.assertReady(assembled.contextPackage);
    this.assertStateDrivenReady(assembled.contextPackage, request);
    await this.markChapterStatus(chapterId, "generating");
    try {
      return await runPipelineChapterWithRuntime(
        {
          validateRequest: () => request,
          ensureNovelCharacters: this.deps.ensureNovelCharacters,
          assemble: async () => assembled as AssembledRuntimeChapter,
          generateDraftFromWriter: (input) => this.generateDraftFromWriter(input),
          saveDraftAndArtifacts: (targetNovelId, targetChapterId, content, generationState, options) =>
            this.deps.artifactSyncService.saveDraftAndArtifacts(
              targetNovelId,
              targetChapterId,
              content,
              generationState,
              options,
            ),
          syncFinalChapterArtifacts: (targetNovelId, targetChapterId, content, syncOptions) =>
            this.deps.artifactSyncService.syncChapterArtifacts(
              targetNovelId,
              targetChapterId,
              content,
              {
                scheduleBackgroundSync: true,
                artifactSyncMode: syncOptions?.artifactSyncMode ?? options.artifactSyncMode,
              },
            ),
          finalizeChapterContent: async (input) => {
            const finalized = await this.finalizeChapterContent({
              ...input,
              deferArtifactBackgroundSync: true,
              scheduleDeferredArtifactBackgroundSync: false,
            });
            return {
              finalContent: finalized.finalContent,
              runtimePackage: finalized.runtimePackage,
            };
          },
          finalizeChapterTimeline: async (input) => {
            await this.timelineFinalizer.finalizeCurrentContent({
              novelId: input.novelId,
              chapterId: input.chapterId,
              content: input.content,
              contextPackage: input.contextPackage,
              request: input.request,
              mode: input.mode,
              reason: input.reason,
              sourceStage: input.mode === "degraded" ? "defer_and_continue" : "pipeline_final_content",
              qualityDebt: input.qualityDebt,
            });
          },
          markChapterGenerationState: (targetChapterId, generationState) =>
            this.markChapterGenerationState(targetChapterId, generationState),
          markChapterNeedsRepair: (targetChapterId) =>
            this.markChapterStatus(targetChapterId, "needs_repair"),
        },
        novelId,
        chapterId,
        options,
        hooks,
      );
    } catch (error) {
      if (isChapterEmptyContentError(error)) {
        await this.markChapterStatus(chapterId, "pending_generation");
      }
      throw error;
    }
  }

  private getAgentRuntime(): AgentRuntimeLike {
    return (this.deps.agentRuntime ?? require("../../../agents").agentRuntime) as AgentRuntimeLike;
  }

  private assertStateDrivenReady(contextPackage: GenerationContextPackage, request: ChapterRuntimeRequestInput): void {
    if (contextPackage.nextAction === "hold_for_review") {
      const isFullBookAutopilot = request.controlPolicy?.advanceMode === "full_book_autopilot";
      const hasPendingStateProposals = contextPackage.pendingReviewProposalCount > 0;
      const hasOpenAuditIssues = contextPackage.openAuditIssues.length > 0;
      if (isFullBookAutopilot && hasPendingStateProposals && !hasOpenAuditIssues) {
        return;
      }
      const reasons = [
        contextPackage.pendingReviewProposalCount > 0
          ? `${contextPackage.pendingReviewProposalCount} pending state proposal(s)`
          : "",
        ...contextPackage.openAuditIssues.slice(0, 2).map((issue) => issue.description),
      ].filter(Boolean);
      throw new Error(
        `Chapter generation is blocked until review is resolved.${reasons.length > 0 ? ` ${reasons.join(" | ")}` : ""}`,
      );
    }
  }

  private async ensurePreviousChapterTimelineFinalized(
    novelId: string,
    chapterId: string,
    request: ChapterRuntimeRequestInput,
  ): Promise<void> {
    const chapter = await prisma.chapter.findFirst({
      where: { id: chapterId, novelId },
      select: { order: true },
    });
    if (!chapter || chapter.order <= 1) {
      return;
    }
    await this.timelineFinalizer.ensurePreviousChapterFinalized({
      novelId,
      currentChapterOrder: chapter.order,
      request,
    });
  }

  private async bestEffortEnsureChapterExecutionContract(
    novelId: string,
    chapterId: string,
    request: ChapterRuntimeRequestInput,
  ): Promise<void> {
    try {
      await this.deps.ensureChapterExecutionContract(novelId, chapterId, request);
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      console.warn("[chapter-runtime] execution contract refresh skipped", {
        novelId,
        chapterId,
        error: message,
      });
    }
  }

  private async generateDraftFromWriter(input: {
    novelId: string;
    chapterId: string;
    request: ChapterRuntimeRequestInput;
    assembled: AssembledRuntimeChapter;
  }): Promise<{
    content: string;
    lengthControl?: ChapterRuntimePackage["lengthControl"];
    artifactsAlreadySynced?: boolean;
    backgroundSyncDeferred?: boolean;
  }> {
    const writerResult = await this.deps.chapterWritingGraph.createChapterStream({
      novelId: input.novelId,
      novelTitle: input.assembled.novel.title,
      chapter: input.assembled.chapter,
      contextPackage: input.assembled.contextPackage,
      options: {
        ...input.request,
        deferArtifactBackgroundSync: true,
      },
    });

    let fullContent = "";
    for await (const chunk of writerResult.stream) {
      fullContent += toText(chunk.content);
    }
    const normalized = await writerResult.onDone(fullContent);
    const content = assertChapterContentNotEmpty(normalized?.finalContent ?? fullContent, {
      novelId: input.novelId,
      chapterId: input.chapterId,
      chapterOrder: input.assembled.chapter.order,
      source: "chapter_runtime_writer",
    });
    return {
      content,
      lengthControl: normalized?.lengthControl,
      artifactsAlreadySynced: Boolean(normalized?.artifactsAlreadySynced),
      backgroundSyncDeferred: Boolean(normalized?.backgroundSyncDeferred),
    };
  }

  private async resolveWriterResultWithEmptyRetry(input: {
    novelId: string;
    chapterId: string;
    request: ChapterRuntimeRequestInput;
    assembled: AssembledRuntimeChapter;
    writerDone: () => Promise<{
      finalContent: string;
      lengthControl?: ChapterRuntimePackage["lengthControl"];
      artifactsAlreadySynced?: boolean;
      backgroundSyncDeferred?: boolean;
    } | void>;
    fallbackContent: string;
  }): Promise<{
    finalContent: string;
    lengthControl?: ChapterRuntimePackage["lengthControl"];
    artifactsAlreadySynced?: boolean;
    backgroundSyncDeferred?: boolean;
  }> {
    try {
      const normalized = await input.writerDone();
      const finalContent = assertChapterContentNotEmpty(normalized?.finalContent ?? input.fallbackContent, {
        novelId: input.novelId,
        chapterId: input.chapterId,
        chapterOrder: input.assembled.chapter.order,
        source: "chapter_stream_writer",
        attempt: 1,
        maxEmptyRetries: 1,
      });
      return {
        ...(normalized ?? {}),
        finalContent,
      };
    } catch (error) {
      if (!isChapterEmptyContentError(error)) {
        throw error;
      }
      this.logEmptyChapterContent({
        error,
        novelId: input.novelId,
        chapterId: input.chapterId,
        chapterOrder: input.assembled.chapter.order,
        request: input.request,
        willRetry: true,
        attempt: 1,
      });
    }

    try {
      const retryDraft = await this.generateDraftFromWriter({
        novelId: input.novelId,
        chapterId: input.chapterId,
        request: input.request,
        assembled: input.assembled,
      });
      return {
        finalContent: retryDraft.content,
        lengthControl: retryDraft.lengthControl,
        artifactsAlreadySynced: retryDraft.artifactsAlreadySynced,
        backgroundSyncDeferred: retryDraft.backgroundSyncDeferred,
      };
    } catch (error) {
      if (isChapterEmptyContentError(error)) {
        this.logEmptyChapterContent({
          error,
          novelId: input.novelId,
          chapterId: input.chapterId,
          chapterOrder: input.assembled.chapter.order,
          request: input.request,
          willRetry: false,
          attempt: 2,
        });
        await this.markChapterStatus(input.chapterId, "pending_generation");
      }
      throw error;
    }
  }

  private async finalizeChapterContent(input: {
    novelId: string;
    chapterId: string;
    request: ChapterRuntimeRequestInput;
    contextPackage: GenerationContextPackage;
    content: string;
    lengthControl?: ChapterRuntimePackage["lengthControl"];
    runId: string | null;
    startMs: number | null;
    deferArtifactBackgroundSync?: boolean;
    scheduleDeferredArtifactBackgroundSync?: boolean;
  }): Promise<FinalizeChapterContentResult> {
    return this.contentFinalizationService.finalizeChapterContent(input);
  }

  private async finishTraceRun(runId: string | null, contentLength: number, startMs: number | null): Promise<void> {
    await this.contentFinalizationService.finishTraceRun(runId, contentLength, startMs);
  }

  private async markChapterGenerationState(
    chapterId: string,
    generationState: "reviewed" | "approved",
  ): Promise<void> {
    await prisma.chapter.update({
      where: { id: chapterId },
      data: mergeChapterPatchForGenerationStateBump({}, generationState),
    });
  }

  private logEmptyChapterContent(input: {
    error: ChapterEmptyContentError;
    novelId: string;
    chapterId: string;
    chapterOrder: number;
    request: ChapterRuntimeRequestInput;
    willRetry: boolean;
    attempt: number;
  }): void {
    console.warn("[chapter-runtime] empty chapter content", {
      novelId: input.novelId,
      chapterId: input.chapterId,
      chapterOrder: input.chapterOrder,
      provider: input.request.provider,
      model: input.request.model,
      willRetry: input.willRetry,
      attempt: input.attempt,
      contentLength: input.error.details.trimmedLength,
      rawContentLength: input.error.details.rawLength,
      source: input.error.details.source,
    });
  }

  private async markChapterStatus(
    chapterId: string,
    chapterStatus: "pending_generation" | "generating" | "pending_review" | "needs_repair",
  ): Promise<void> {
    await this.contentFinalizationService.markChapterStatus(chapterId, chapterStatus);
  }

  private emitRunStatus(
    helpers: StreamDoneHelpers | undefined,
    payload: Extract<WritableSSEFrame, { type: "run_status" }>,
  ): void {
    helpers?.writeFrame(payload);
  }

  private async ensureNovelCharacters(novelId: string, actionName: string, minCount = 1): Promise<void> {
    const count = await prisma.character.count({ where: { novelId } });
    if (count < minCount) {
      throw new Error(`请先在本小说中至少添加 ${minCount} 个角色后再${actionName}。`);
    }
  }
}
