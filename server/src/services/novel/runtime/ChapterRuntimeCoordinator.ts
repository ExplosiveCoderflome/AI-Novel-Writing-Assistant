import type { BaseMessageChunk } from "@langchain/core/messages";
import type { StreamDonePayload } from "../../../llm/streaming";
import type { ChapterRuntimePackage, GenerationContextPackage } from "@ai-novel/shared/types/chapterRuntime";
import { prisma } from "../../../db/prisma";
import { auditService } from "../../audit/AuditService";
import { plannerService } from "../../planner/PlannerService";
import { ChapterWritingGraph } from "../chapterWritingGraph";
import { normalizeScore, ruleScore, toText } from "../novelP0Utils";
import { ChapterArtifactSyncService } from "./ChapterArtifactSyncService";
import { GenerationContextAssembler } from "./GenerationContextAssembler";
import { chapterRuntimeRequestSchema, type ChapterRuntimeRequestInput } from "./chapterRuntimeSchema";

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
  agentRuntime?: AgentRuntimeLike;
  ensureNovelCharacters?: (novelId: string, actionName: string, minCount?: number) => Promise<void>;
  validateRequest?: (input: ChapterRuntimeRequestInput) => ChapterRuntimeRequestInput;
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
        toText,
        normalizeScore,
        ruleScore,
        isPass: (score) => score.coherence >= 80 && score.repetition <= 20 && score.engagement >= 75,
        buildContextText: async () => "",
        buildOpeningConstraintHint: async () => "Recent openings: none.",
        enforceOpeningDiversity: async (_novelId, _chapterOrder, _chapterTitle, content) => ({
          content,
          rewritten: false,
          maxSimilarity: 0,
        }),
        reviewChapterContent: async () => ({ score: normalizeScore({}), issues: [], auditReports: [] }),
        createQualityReport: async () => undefined,
        syncAuditReports: async () => undefined,
        saveDraftAndArtifacts: (...args) => artifactSyncService.saveDraftAndArtifacts(...args),
        updateChapterGenerationState: async () => undefined,
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
      agentRuntime: deps.agentRuntime,
      ensureNovelCharacters: deps.ensureNovelCharacters ?? this.ensureNovelCharacters,
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
    const agentRuntime = this.deps.agentRuntime ?? require("../../../agents").agentRuntime as AgentRuntimeLike;

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
        const finalContent = normalized?.finalContent ?? fullContent;
        const auditResult = await this.deps.auditService.auditChapter(novelId, chapterId, "full", {
          provider: request.provider,
          model: request.model,
          temperature: request.temperature,
          content: finalContent,
        });
        const runtimePackage = this.buildRuntimePackage({
          novelId,
          chapterId,
          request,
          contextPackage: assembled.contextPackage,
          finalContent,
          auditResult,
          runId: traceRunId,
        });

                if (traceRunId) {
                  try {
                    await agentRuntime.finishChapterGenRun(
                      traceRunId,
                      `chapter draft generated, ${finalContent.length} chars`,
                      Date.now() - startMs,
            );
          } catch {
            // ignore trace failures
          }
        }

        return {
          fullContent: finalContent,
          frames: config.includeRuntimePackage
            ? [{ type: "runtime_package", package: runtimePackage }]
            : [],
        };
      },
    };
  }

  private buildRuntimePackage(input: {
    novelId: string;
    chapterId: string;
    request: ChapterRuntimeRequestInput;
    contextPackage: GenerationContextPackage;
    finalContent: string;
    auditResult: Awaited<ReturnType<typeof auditService.auditChapter>>;
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

    const hasBlockingIssues = openIssues.some((issue) => issue.severity === "high" || issue.severity === "critical");
    const blockingIssueIds = openIssues
      .filter((issue) => issue.severity === "high" || issue.severity === "critical")
      .map((issue) => issue.id);

    return {
      novelId: input.novelId,
      chapterId: input.chapterId,
      context: input.contextPackage,
      draft: {
        content: input.finalContent,
        wordCount: input.finalContent.trim().length,
        generationState: "drafted",
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
      meta: {
        provider: input.request.provider,
        model: input.request.model,
        temperature: input.request.temperature,
        runId: input.runId ?? undefined,
        generatedAt: new Date().toISOString(),
      },
    };
  }

  private async ensureNovelCharacters(novelId: string, actionName: string, minCount = 1): Promise<void> {
    const count = await prisma.character.count({ where: { novelId } });
    if (count < minCount) {
      throw new Error(`请先在本小说中至少添加 ${minCount} 个角色后再${actionName}。`);
    }
  }
}
