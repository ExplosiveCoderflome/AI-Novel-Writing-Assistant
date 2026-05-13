import type { BaseMessageChunk } from "@langchain/core/messages";
import type { StreamDoneHelpers, StreamDonePayload, WritableSSEFrame } from "../../../llm/streaming";
import type {
  ChapterRuntimePackage,
  ChapterAcceptanceRepairDirective,
  GenerationContextPackage,
} from "@ai-novel/shared/types/chapterRuntime";
import { prisma } from "../../../db/prisma";
import { mergeChapterPatchForGenerationStateBump } from "../chapterLifecycleState";
import { auditService } from "../../audit/AuditService";
import { buildSyntheticPayoffIssues } from "../../payoff/payoffLedgerShared";
import { plannerService } from "../../planner/PlannerService";
import { openConflictService } from "../../state/OpenConflictService";
import { ChapterWritingGraph } from "../chapterWritingGraph";
import { toText } from "../novelP0Utils";
import { ChapterArtifactSyncService } from "./ChapterArtifactSyncService";
import { GenerationContextAssembler } from "./GenerationContextAssembler";
import type { StyleReviewResult } from "./PostGenerationStyleReviewRunner";
import { ChapterAcceptanceAssessmentService } from "./ChapterAcceptanceAssessmentService";
import { ChapterRuntimeReadinessService } from "./ChapterRuntimeReadinessService";
import type { ChapterAcceptanceAssessmentOutput } from "../../../prompting/prompts/novel/chapterAcceptance.prompts";
import { chapterRuntimeRequestSchema, type ChapterRuntimeRequestInput } from "./chapterRuntimeSchema";
import { withChapterRepairContext } from "../../../prompting/prompts/novel/chapterLayeredContext";
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
}

interface FinalizeChapterContentResult {
  finalContent: string;
  runtimePackage: ChapterRuntimePackage;
  styleReview: StyleReviewResult;
}

function parseStringArray(value: string | null | undefined): string[] {
  if (!value?.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.map((item) => String(item ?? "").trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function countChapterCharacters(content: string): number {
  return content.replace(/\s+/g, "").trim().length;
}

function shouldEscalateToFullAudit(input: {
  content: string;
  contextPackage: GenerationContextPackage;
  lightAssessment: Awaited<ReturnType<typeof auditService.assessChapterAuditNeed>>;
}): boolean {
  void input.content;
  void input.contextPackage;
  return input.lightAssessment.shouldRunFullAudit;
}

function normalizeBoundaryProbe(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, "").trim().toLowerCase();
}

function boundaryProbeCandidates(value: string, splitInstructionPrefix: boolean): string[] {
  const trimmed = value.trim();
  const afterColon = splitInstructionPrefix && trimmed.includes("：") ? trimmed.split("：").slice(1).join("：").trim() : "";
  return [trimmed, afterColon]
    .map((item) => item.trim())
    .filter((item) => item.length >= 4);
}

function buildBoundaryLeakageIssues(input: {
  novelId: string;
  chapterId: string;
  content: string;
  contextPackage: GenerationContextPackage;
}): GenerationContextPackage["openAuditIssues"] {
  const boundary = input.contextPackage.chapterWriteContext?.chapterBoundary;
  if (!boundary) {
    return [];
  }
  const contentProbe = normalizeBoundaryProbe(input.content);
  if (!contentProbe) {
    return [];
  }
  const candidates = [
    ...boundary.protectedReveals.map((item) => ({ type: "protected_reveal", text: item, severity: "critical" as const })),
    ...boundary.doNotCross.map((item) => ({ type: "do_not_cross", text: item, severity: "high" as const })),
  ];
  const seen = new Set<string>();
  const now = new Date().toISOString();
  return candidates.flatMap((candidate) => {
    const leaked = boundaryProbeCandidates(candidate.text, candidate.type === "protected_reveal")
      .find((probe) => contentProbe.includes(normalizeBoundaryProbe(probe)));
    if (!leaked || seen.has(`${candidate.type}:${leaked}`)) {
      return [];
    }
    seen.add(`${candidate.type}:${leaked}`);
    return [{
      id: `chapter-boundary:${input.chapterId}:${candidate.type}:${seen.size}`,
      reportId: `chapter-boundary:${input.novelId}:${input.chapterId}`,
      auditType: "plot" as const,
      severity: candidate.severity,
      code: candidate.type,
      description: candidate.type === "protected_reveal"
        ? "章节正文疑似提前泄露受保护信息。"
        : "章节正文疑似越过本章边界。重写或修复时必须回到当前章节合同内。",
      evidence: leaked,
      fixSuggestion: candidate.type === "protected_reveal"
        ? "删除或改写提前揭露的信息，只保留铺垫、压力或预兆。"
        : "删除越章内容，停在本章 endingState 或当前场景 exitState。",
      status: "open" as const,
      createdAt: now,
      updatedAt: now,
    }];
  });
}

function mapOpenConflictForRuntime(
  conflict: Awaited<ReturnType<typeof openConflictService.listOpenConflicts>>[number],
): GenerationContextPackage["openConflicts"][number] {
  return {
    id: conflict.id,
    novelId: conflict.novelId,
    chapterId: conflict.chapterId ?? null,
    sourceSnapshotId: conflict.sourceSnapshotId ?? null,
    sourceIssueId: conflict.sourceIssueId ?? null,
    sourceType: conflict.sourceType,
    conflictType: conflict.conflictType,
    conflictKey: conflict.conflictKey,
    title: conflict.title,
    summary: conflict.summary,
    severity: conflict.severity,
    status: conflict.status,
    evidence: parseStringArray(conflict.evidenceJson),
    affectedCharacterIds: parseStringArray(conflict.affectedCharacterIdsJson),
    resolutionHint: conflict.resolutionHint ?? null,
    lastSeenChapterOrder: conflict.lastSeenChapterOrder ?? conflict.chapter?.order ?? null,
    createdAt: conflict.createdAt.toISOString(),
    updatedAt: conflict.updatedAt.toISOString(),
  };
}

export class ChapterRuntimeCoordinator {
  private readonly deps: Omit<Required<ChapterRuntimeCoordinatorDeps>, "agentRuntime"> & {
    agentRuntime?: ChapterRuntimeCoordinatorDeps["agentRuntime"];
  };

  constructor(deps: ChapterRuntimeCoordinatorDeps = {}) {
    const artifactSyncService = deps.artifactSyncService ?? new ChapterArtifactSyncService();
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

  async runPipelineChapter(
    novelId: string,
    chapterId: string,
    options: PipelineRuntimeInput = {},
    hooks: PipelineRuntimeHooks = {},
  ): Promise<PipelineRuntimeResult> {
    const request = this.deps.validateRequest(options);
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
          syncFinalChapterArtifacts: (targetNovelId, targetChapterId, content) =>
            this.deps.artifactSyncService.syncChapterArtifacts(
              targetNovelId,
              targetChapterId,
              content,
              { scheduleBackgroundSync: true },
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
    const finalContent = input.content;
    const acceptance = await this.deps.acceptanceAssessmentService.assess({
      novelId: input.novelId,
      chapterId: input.chapterId,
      novelTitle: input.contextPackage.bookContract?.title ?? input.contextPackage.chapter.title,
      chapterTitle: input.contextPackage.chapter.title,
      chapterOrder: input.contextPackage.chapter.order,
      targetWordCount: input.contextPackage.chapter.targetWordCount ?? null,
      content: finalContent,
      contextPackage: input.contextPackage,
      provider: input.request.provider,
      model: input.request.model,
      temperature: input.request.temperature,
    });
    const auditResult = {
      score: acceptance.score,
      issues: acceptance.issues,
      auditReports: acceptance.auditReports,
    };
    const styleReview: StyleReviewResult = {
      report: null,
      autoRewritten: false,
      originalContent: null,
      finalContent,
    };
    const activeOpenConflicts = await openConflictService.listOpenConflicts(input.novelId, {
      beforeChapterOrder: input.contextPackage.chapter.order,
      includeCurrentChapter: true,
      limit: 8,
    });
    const runtimePackage = this.buildRuntimePackage({
      novelId: input.novelId,
      chapterId: input.chapterId,
      request: input.request,
      contextPackage: input.contextPackage,
      finalContent,
      lengthControl: input.lengthControl,
      auditResult,
      activeOpenConflicts,
      styleReview,
      acceptance: acceptance.assessment,
      runId: input.runId,
    });
    await this.markChapterStatus(
      input.chapterId,
      acceptance.assessment.status === "repairable"
      || acceptance.assessment.status === "needs_manual_review"
      || runtimePackage.audit.hasBlockingIssues
        ? "needs_repair"
        : "pending_review",
    );

    if (input.deferArtifactBackgroundSync && input.scheduleDeferredArtifactBackgroundSync !== false) {
      await this.deps.artifactSyncService.syncChapterArtifacts(
        input.novelId,
        input.chapterId,
        finalContent,
        { scheduleBackgroundSync: true },
      );
    }

    await this.finishTraceRun(input.runId, finalContent.length, input.startMs);

    return {
      finalContent,
      runtimePackage,
      styleReview,
    };
  }

  private async finishTraceRun(runId: string | null, contentLength: number, startMs: number | null): Promise<void> {
    if (!runId || startMs == null) {
      return;
    }

    try {
      await this.getAgentRuntime().finishChapterGenRun(
        runId,
        `chapter draft generated, ${contentLength} chars`,
        Date.now() - startMs,
      );
    } catch {
      // Ignore trace failures so chapter generation still completes.
    }
  }

  private buildRuntimePackage(input: {
    novelId: string;
    chapterId: string;
    request: ChapterRuntimeRequestInput;
    contextPackage: GenerationContextPackage;
    finalContent: string;
    lengthControl?: ChapterRuntimePackage["lengthControl"];
    auditResult: Awaited<ReturnType<typeof auditService.auditChapter>>;
    activeOpenConflicts: Awaited<ReturnType<typeof openConflictService.listOpenConflicts>>;
    styleReview: StyleReviewResult;
    acceptance: ChapterAcceptanceAssessmentOutput;
    runId: string | null;
  }): ChapterRuntimePackage {
    const syntheticPayoffIssues = buildSyntheticPayoffIssues(
      [
        ...input.contextPackage.ledgerPendingItems,
        ...input.contextPackage.ledgerOverdueItems.filter((item) => !input.contextPackage.ledgerPendingItems.some((pending) => pending.ledgerKey === item.ledgerKey)),
      ],
      input.contextPackage.chapter.order,
    );
    const boundaryLeakageIssues = buildBoundaryLeakageIssues({
      novelId: input.novelId,
      chapterId: input.chapterId,
      content: input.finalContent,
      contextPackage: input.contextPackage,
    });
    const openIssues = input.auditResult.auditReports
      .flatMap((report) => report.issues)
      .filter((issue) => issue.status === "open")
      .map((issue) => ({
        id: issue.id,
        reportId: issue.reportId,
        auditType: issue.auditType,
        severity: issue.severity,
        code: issue.code,
        description: issue.description,
        evidence: issue.evidence,
        fixSuggestion: issue.fixSuggestion,
        status: issue.status,
        createdAt: issue.createdAt,
        updatedAt: issue.updatedAt,
      }))
      .concat(syntheticPayoffIssues.map((issue) => ({
        id: `payoff-ledger:${issue.ledgerKey}:${issue.code}`,
        reportId: `payoff-ledger:${input.novelId}:${input.chapterId}`,
        auditType: "plot" as const,
        severity: issue.severity,
        code: issue.code,
        description: issue.description,
        evidence: issue.evidence,
        fixSuggestion: issue.fixSuggestion,
        status: "open" as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })))
      .concat(boundaryLeakageIssues);

    const blockingIssueIds = openIssues
      .filter((issue) => issue.severity === "high" || issue.severity === "critical")
      .map((issue) => issue.id);
    const blockingLedgerKeys = Array.from(new Set(
      syntheticPayoffIssues
        .filter((issue) => issue.severity === "high" || issue.severity === "critical")
        .map((issue) => issue.ledgerKey),
    ));
    const hasBlockingIssues = blockingIssueIds.length > 0 || input.acceptance.status === "needs_manual_review";
    const repairContextPackage = withChapterRepairContext(
      input.contextPackage,
      openIssues.map((issue) => ({
        severity: issue.severity,
        category: issue.auditType === "continuity"
          ? "coherence"
          : issue.auditType === "character"
            ? "logic"
            : issue.auditType === "plot"
              ? "pacing"
              : "coherence",
        evidence: issue.evidence,
        fixSuggestion: issue.fixSuggestion,
      })),
    );

    const replanRecommendation = this.deps.plannerService.buildReplanRecommendation
      ? this.deps.plannerService.buildReplanRecommendation({
        auditReports: input.auditResult.auditReports,
        ledgerSummary: input.contextPackage.ledgerSummary ?? null,
        contextPackage: input.contextPackage,
        targetChapterOrder: input.contextPackage.chapter.order,
        blockingLedgerKeys,
      })
      : {
        recommended: hasBlockingIssues || this.deps.plannerService.shouldTriggerReplanFromAudit(
          input.auditResult.auditReports,
          input.contextPackage.ledgerSummary ?? null,
        ),
        reason: input.contextPackage.ledgerSummary?.overdueCount
          ? "Overdue payoff ledger items require replan or explicit payoff handling."
          : hasBlockingIssues
            ? "Blocking audit issues remain open after generation."
            : "No blocking audit issues were detected.",
        blockingIssueIds,
        blockingLedgerKeys,
        affectedChapterOrders: [],
      };

    return {
      novelId: input.novelId,
      chapterId: input.chapterId,
      context: {
        ...repairContextPackage,
        openConflicts: input.activeOpenConflicts.map((item) => mapOpenConflictForRuntime(item)),
      },
      draft: {
        content: input.finalContent,
        wordCount: countChapterCharacters(input.finalContent),
        generationState: input.styleReview.autoRewritten ? "repaired" : "drafted",
      },
      audit: {
        score: input.auditResult.score,
        reports: input.auditResult.auditReports.map((report) => ({
          id: report.id,
          novelId: report.novelId,
          chapterId: report.chapterId,
          auditType: report.auditType,
          overallScore: report.overallScore ?? null,
          summary: report.summary ?? null,
          legacyScoreJson: report.legacyScoreJson ?? null,
          issues: report.issues.map((issue) => ({
            id: issue.id,
            reportId: issue.reportId,
            auditType: issue.auditType,
            severity: issue.severity,
            code: issue.code,
            description: issue.description,
            evidence: issue.evidence,
            fixSuggestion: issue.fixSuggestion,
            status: issue.status,
            createdAt: issue.createdAt,
            updatedAt: issue.updatedAt,
          })),
          createdAt: report.createdAt,
          updatedAt: report.updatedAt,
        })),
        openIssues,
        hasBlockingIssues,
      },
      replanRecommendation,
      lengthControl: input.lengthControl,
      styleReview: {
        report: input.styleReview.report,
        autoRewritten: input.styleReview.autoRewritten,
        originalContent: input.styleReview.originalContent,
      },
      meta: {
        provider: input.request.provider,
        model: input.request.model,
        temperature: input.request.temperature,
        runId: input.runId ?? undefined,
        generatedAt: new Date().toISOString(),
        nextAction: input.contextPackage.nextAction,
        stateGoalSummary: input.contextPackage.chapterStateGoal?.summary,
        pendingReviewProposalCount: input.contextPackage.pendingReviewProposalCount,
        acceptanceStatus: input.acceptance.status,
        continuePolicy: input.acceptance.continuePolicy,
        riskTags: input.acceptance.riskTags,
        repairDirectives: input.acceptance.repairDirectives,
        assetSyncRecommendation: input.acceptance.assetSyncRecommendation,
      },
    };
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
    await prisma.chapter.update({
      where: { id: chapterId },
      data: { chapterStatus },
    });
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
