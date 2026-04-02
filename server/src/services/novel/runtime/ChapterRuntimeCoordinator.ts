import type { BaseMessageChunk } from "@langchain/core/messages";
import type { StreamDonePayload } from "../../../llm/streaming";
import type {
  ChapterRuntimePackage,
  GenerationContextPackage,
  RuntimeStyleDetectionReport,
} from "@ai-novel/shared/types/chapterRuntime";
import { prisma } from "../../../db/prisma";
import { auditService } from "../../audit/AuditService";
import { plannerService } from "../../planner/PlannerService";
import { openConflictService } from "../../state/OpenConflictService";
import { StyleDetectionService } from "../../styleEngine/StyleDetectionService";
import { StyleRewriteService } from "../../styleEngine/StyleRewriteService";
import { ChapterWritingGraph } from "../chapterWritingGraph";
import { toText } from "../novelP0Utils";
import { ChapterArtifactSyncService } from "./ChapterArtifactSyncService";
import { GenerationContextAssembler } from "./GenerationContextAssembler";
import { chapterRuntimeRequestSchema, type ChapterRuntimeRequestInput } from "./chapterRuntimeSchema";
import { withChapterRepairContext } from "../../../prompting/prompts/novel/chapterLayeredContext";
import {
  runPipelineChapterWithRuntime,
  type AssembledRuntimeChapter,
  type PipelineRuntimeHooks,
  type PipelineRuntimeInput,
  type PipelineRuntimeResult,
} from "./chapterRuntimePipeline";

interface AgentRuntimeLike {
  createChapterGenRun: (novelId: string, chapterId: string, chapterOrder: number) => Promise<string>;
  finishChapterGenRun: (runId: string, summary: string, durationMs: number) => Promise<void>;
}

interface ChapterRuntimeCoordinatorDeps {
  assembler?: Pick<GenerationContextAssembler, "assemble">;
  chapterWritingGraph?: Pick<ChapterWritingGraph, "createChapterStream">;
  artifactSyncService?: Pick<ChapterArtifactSyncService, "saveDraftAndArtifacts">;
  auditService?: Pick<typeof auditService, "auditChapter">;
  plannerService?: Pick<typeof plannerService, "shouldTriggerReplanFromAudit">;
  styleDetectionService?: Pick<StyleDetectionService, "check">;
  styleRewriteService?: Pick<StyleRewriteService, "rewrite">;
  agentRuntime?: AgentRuntimeLike;
  ensureNovelCharacters?: (novelId: string, actionName: string, minCount?: number) => Promise<void>;
  validateRequest?: (input: ChapterRuntimeRequestInput) => ChapterRuntimeRequestInput;
}

interface StyleReviewResult {
  report: RuntimeStyleDetectionReport | null;
  autoRewritten: boolean;
  originalContent: string | null;
  finalContent: string;
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
      styleDetectionService: deps.styleDetectionService ?? new StyleDetectionService(),
      styleRewriteService: deps.styleRewriteService ?? new StyleRewriteService(),
      agentRuntime: deps.agentRuntime,
      ensureNovelCharacters: deps.ensureNovelCharacters ?? this.ensureNovelCharacters.bind(this),
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
    onDone: (fullContent: string) => Promise<void | StreamDonePayload>;
  }> {
    const request = this.deps.validateRequest(options);
    await this.deps.ensureNovelCharacters(novelId, "generate chapter content");

    const assembled = await this.deps.assembler.assemble(novelId, chapterId, request);
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
      onDone: async (fullContent: string) => {
        const normalized = await writerResult.onDone(fullContent);
        const generatedContent = normalized?.finalContent ?? fullContent;
        const finalized = await this.finalizeChapterContent({
          novelId,
          chapterId,
          request,
          contextPackage: assembled.contextPackage,
          content: generatedContent,
          runId: traceRunId,
          startMs,
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
    return runPipelineChapterWithRuntime(
      {
        validateRequest: this.deps.validateRequest,
        ensureNovelCharacters: this.deps.ensureNovelCharacters,
        assemble: (targetNovelId, targetChapterId, request) =>
          this.deps.assembler.assemble(targetNovelId, targetChapterId, request) as Promise<AssembledRuntimeChapter>,
        generateDraftFromWriter: (input) => this.generateDraftFromWriter(input),
        saveDraftAndArtifacts: (targetNovelId, targetChapterId, content, generationState) =>
          this.deps.artifactSyncService.saveDraftAndArtifacts(targetNovelId, targetChapterId, content, generationState),
        finalizeChapterContent: async (input) => {
          const finalized = await this.finalizeChapterContent(input);
          return {
            finalContent: finalized.finalContent,
            runtimePackage: finalized.runtimePackage,
          };
        },
        markChapterGenerationState: (targetChapterId, generationState) =>
          this.markChapterGenerationState(targetChapterId, generationState),
      },
      novelId,
      chapterId,
      options,
      hooks,
    );
  }

  private getAgentRuntime(): AgentRuntimeLike {
    return (this.deps.agentRuntime ?? require("../../../agents").agentRuntime) as AgentRuntimeLike;
  }

  private async generateDraftFromWriter(input: {
    novelId: string;
    chapterId: string;
    request: ChapterRuntimeRequestInput;
    assembled: AssembledRuntimeChapter;
  }): Promise<string> {
    const writerResult = await this.deps.chapterWritingGraph.createChapterStream({
      novelId: input.novelId,
      novelTitle: input.assembled.novel.title,
      chapter: input.assembled.chapter,
      contextPackage: input.assembled.contextPackage,
      options: input.request,
    });

    let fullContent = "";
    for await (const chunk of writerResult.stream) {
      fullContent += toText(chunk.content);
    }
    const normalized = await writerResult.onDone(fullContent);
    return normalized?.finalContent ?? fullContent;
  }

  private async finalizeChapterContent(input: {
    novelId: string;
    chapterId: string;
    request: ChapterRuntimeRequestInput;
    contextPackage: GenerationContextPackage;
    content: string;
    runId: string | null;
    startMs: number | null;
  }): Promise<FinalizeChapterContentResult> {
    const styleReview = await this.runStyleReview({
      novelId: input.novelId,
      chapterId: input.chapterId,
      request: input.request,
      contextPackage: input.contextPackage,
      content: input.content,
    });

    if (styleReview.autoRewritten) {
      await this.deps.artifactSyncService.saveDraftAndArtifacts(
        input.novelId,
        input.chapterId,
        styleReview.finalContent,
        "repaired",
      );
    }

    const auditResult = await this.deps.auditService.auditChapter(input.novelId, input.chapterId, "full", {
      provider: input.request.provider,
      model: input.request.model,
      temperature: input.request.temperature,
      content: styleReview.finalContent,
      contextPackage: input.contextPackage,
    });
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
      finalContent: styleReview.finalContent,
      auditResult,
      activeOpenConflicts,
      styleReview,
      runId: input.runId,
    });

    await this.finishTraceRun(input.runId, styleReview.finalContent.length, input.startMs);

    return {
      finalContent: styleReview.finalContent,
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

  private async runStyleReview(input: {
    novelId: string;
    chapterId: string;
    request: ChapterRuntimeRequestInput;
    contextPackage: GenerationContextPackage;
    content: string;
  }): Promise<StyleReviewResult> {
    if (!input.contextPackage.styleContext?.compiledBlocks) {
      return {
        report: null,
        autoRewritten: false,
        originalContent: null,
        finalContent: input.content,
      };
    }

    let report: RuntimeStyleDetectionReport | null = null;
    try {
      report = await this.deps.styleDetectionService.check({
        content: input.content,
        novelId: input.novelId,
        chapterId: input.chapterId,
        taskStyleProfileId: input.request.taskStyleProfileId,
        provider: input.request.provider,
        model: input.request.model,
        temperature: 0.2,
      });
    } catch {
      return {
        report: null,
        autoRewritten: false,
        originalContent: null,
        finalContent: input.content,
      };
    }

    const rewritableIssues = report.violations.filter((item) => item.canAutoRewrite && item.suggestion.trim());
    const shouldAutoRewrite = report.canAutoRewrite
      && rewritableIssues.length > 0
      && report.riskScore >= 35;

    if (!shouldAutoRewrite) {
      return {
        report,
        autoRewritten: false,
        originalContent: null,
        finalContent: input.content,
      };
    }

    try {
      const rewritten = await this.deps.styleRewriteService.rewrite({
        content: input.content,
        novelId: input.novelId,
        chapterId: input.chapterId,
        taskStyleProfileId: input.request.taskStyleProfileId,
        issues: rewritableIssues.map((item) => ({
          ruleName: item.ruleName,
          excerpt: item.excerpt,
          suggestion: item.suggestion,
        })),
        provider: input.request.provider,
        model: input.request.model,
        temperature: Math.min(input.request.temperature ?? 0.5, 0.7),
      });
      const finalContent = rewritten.content.trim() || input.content;
      const autoRewritten = finalContent.trim() !== input.content.trim();
      return {
        report,
        autoRewritten,
        originalContent: autoRewritten ? input.content : null,
        finalContent,
      };
    } catch {
      return {
        report,
        autoRewritten: false,
        originalContent: null,
        finalContent: input.content,
      };
    }
  }

  private buildRuntimePackage(input: {
    novelId: string;
    chapterId: string;
    request: ChapterRuntimeRequestInput;
    contextPackage: GenerationContextPackage;
    finalContent: string;
    auditResult: Awaited<ReturnType<typeof auditService.auditChapter>>;
    activeOpenConflicts: Awaited<ReturnType<typeof openConflictService.listOpenConflicts>>;
    styleReview: StyleReviewResult;
    runId: string | null;
  }): ChapterRuntimePackage {
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
      }));

    const blockingIssueIds = openIssues
      .filter((issue) => issue.severity === "high" || issue.severity === "critical")
      .map((issue) => issue.id);
    const hasBlockingIssues = blockingIssueIds.length > 0;
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

    return {
      novelId: input.novelId,
      chapterId: input.chapterId,
      context: {
        ...repairContextPackage,
        openConflicts: input.activeOpenConflicts.map((item) => mapOpenConflictForRuntime(item)),
      },
      draft: {
        content: input.finalContent,
        wordCount: input.finalContent.trim().length,
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
      replanRecommendation: {
        recommended: hasBlockingIssues || this.deps.plannerService.shouldTriggerReplanFromAudit(input.auditResult.auditReports),
        reason: hasBlockingIssues
          ? "Blocking audit issues remain open after generation."
          : "No blocking audit issues were detected.",
        blockingIssueIds,
      },
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
      },
    };
  }

  private async markChapterGenerationState(
    chapterId: string,
    generationState: "reviewed" | "approved",
  ): Promise<void> {
    await prisma.chapter.update({
      where: { id: chapterId },
      data: { generationState },
    });
  }

  private async ensureNovelCharacters(novelId: string, actionName: string, minCount = 1): Promise<void> {
    const count = await prisma.character.count({ where: { novelId } });
    if (count < minCount) {
      throw new Error(`请先在本小说中至少添加 ${minCount} 个角色后再${actionName}。`);
    }
  }
}
