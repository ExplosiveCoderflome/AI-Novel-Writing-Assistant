import { createHash } from "node:crypto";
import type { ChapterRuntimePackage, GenerationContextPackage } from "@ai-novel/shared/types/chapterRuntime";
import { prisma } from "../../../db/prisma";
import { openConflictService } from "../../state/OpenConflictService";
import { directorAutomationLedgerEventService } from "../director/runtime/DirectorAutomationLedgerEventService";
import { filterAcceptedFactItems, type FactLedgerExcludedItem } from "../fact/factLedgerFilter";
import { novelFactService } from "../fact/NovelFactService";
import { ChapterArtifactSyncService } from "./ChapterArtifactSyncService";
import type { ChapterRuntimeRequestInput } from "./chapterRuntimeSchema";
import type { StyleReviewResult } from "./PostGenerationStyleReviewRunner";
import { ChapterQualityGateService } from "./ChapterQualityGateService";
import {
  buildRuntimePackage,
  type ChapterRuntimePlannerPort,
} from "./chapterRuntimePackageBuilders";
import {
  buildProseQualityAuditReport,
  detectProseQuality,
} from "./proseQuality/ProseQualityDetector";

export interface ChapterContentFinalizationAgentRuntime {
  finishChapterGenRun: (runId: string, summary: string, durationMs: number) => Promise<void>;
}

export interface ChapterContentFinalizationServiceDeps {
  qualityGateService: Pick<ChapterQualityGateService, "runAcceptanceGateOnly">;
  artifactSyncService: Pick<ChapterArtifactSyncService, "syncChapterArtifacts">;
  plannerService: ChapterRuntimePlannerPort;
  agentRuntime: ChapterContentFinalizationAgentRuntime;
}

export interface FinalizeChapterContentInput {
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
}

export interface FinalizeChapterContentResult {
  finalContent: string;
  runtimePackage: ChapterRuntimePackage;
  styleReview: StyleReviewResult;
}

export class ChapterContentFinalizationService {
  private readonly qualityGateService: Pick<ChapterQualityGateService, "runAcceptanceGateOnly">;
  private readonly artifactSyncService: Pick<ChapterArtifactSyncService, "syncChapterArtifacts">;
  private readonly plannerService: ChapterRuntimePlannerPort;
  private readonly agentRuntime: ChapterContentFinalizationAgentRuntime;

  constructor(deps: ChapterContentFinalizationServiceDeps) {
    this.qualityGateService = deps.qualityGateService;
    this.artifactSyncService = deps.artifactSyncService;
    this.plannerService = deps.plannerService;
    this.agentRuntime = deps.agentRuntime;
  }

  async finalizeChapterContent(input: FinalizeChapterContentInput): Promise<FinalizeChapterContentResult> {
    const finalContent = input.content;
    const { acceptance, timelineGate } = await this.qualityGateService.runAcceptanceGateOnly({
      novelId: input.novelId,
      chapterId: input.chapterId,
      contextPackage: input.contextPackage,
      content: finalContent,
      request: input.request,
    });
    const timelineCheck = timelineGate.result;
    const proseQualityReport = detectProseQuality(finalContent);
    const proseQualityAuditReport = buildProseQualityAuditReport({
      novelId: input.novelId,
      chapterId: input.chapterId,
      report: proseQualityReport,
    });
    const auditResult = {
      score: acceptance.score,
      issues: acceptance.issues,
      auditReports: proseQualityAuditReport
        ? [...acceptance.auditReports, proseQualityAuditReport]
        : acceptance.auditReports,
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
    const runtimePackage = buildRuntimePackage({
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
      timelineCheck,
      runId: input.runId,
      plannerService: this.plannerService,
    });
    const needsRepair = acceptance.assessment.status === "repairable"
      || acceptance.assessment.status === "needs_manual_review"
      || timelineCheck.status === "failed"
      || runtimePackage.audit.hasBlockingIssues;
    await this.markChapterStatus(input.chapterId, needsRepair ? "needs_repair" : "pending_review");
    if (!needsRepair) {
      // 保证义务账本在下一章 JIT 上下文组装前完成；失败只告警，不阻断定稿返回。
      try {
        await this.writeAcceptedFacts(
          input.novelId,
          input.chapterId,
          input.runId,
          input.contextPackage,
          runtimePackage,
        );
      } catch (error) {
        console.warn("[chapter-runtime] fact ledger write failed", {
          novelId: input.novelId,
          chapterId: input.chapterId,
          error: error instanceof Error ? error.message : String(error),
        });
      }

    }

    if (!needsRepair && input.deferArtifactBackgroundSync && input.scheduleDeferredArtifactBackgroundSync !== false) {
      await this.artifactSyncService.syncChapterArtifacts(
        input.novelId,
        input.chapterId,
        finalContent,
        {
          scheduleBackgroundSync: true,
          artifactSyncMode: input.request.artifactSyncMode,
          awaitArtifactDelta: true,
          skipLegacySummaryAndFacts: true,
          provider: input.request.provider,
          model: input.request.model,
        },
      );
    }

    await this.finishTraceRun(input.runId, finalContent.length, input.startMs);

    return {
      finalContent,
      runtimePackage,
      styleReview,
    };
  }

  async finishTraceRun(runId: string | null, contentLength: number, startMs: number | null): Promise<void> {
    if (!runId || startMs == null) {
      return;
    }

    try {
      await this.agentRuntime.finishChapterGenRun(
        runId,
        `chapter draft generated, ${contentLength} chars`,
        Date.now() - startMs,
      );
    } catch {
      // Ignore trace failures so chapter generation still completes.
    }
  }

  async markChapterStatus(
    chapterId: string,
    chapterStatus: "pending_generation" | "generating" | "pending_review" | "needs_repair",
  ): Promise<void> {
    await prisma.chapter.update({
      where: { id: chapterId },
      data: { chapterStatus },
    });
  }

  /**
   * 章节接收通过后，仅将验收确认已完成的 mustHitNow 义务写入事实账本。
   *
   * payoffDirectives 是写前指令，不是正文观测结果；伏笔“已揭示”事实应由
   * payoff ledger 状态迁移或 timeline gate 的 resolvedHookIds 等观测来源写入。
   */
  private async writeAcceptedFacts(
    novelId: string,
    chapterId: string,
    runId: string | null,
    contextPackage: GenerationContextPackage,
    runtimePackage: ChapterRuntimePackage,
  ): Promise<void> {
    const chapterOrder = contextPackage.chapter.order;
    const writeCtx = contextPackage.chapterWriteContext;
    if (!writeCtx) {
      return;
    }
    const obligationCoverage = runtimePackage.obligationCoverage ?? {
      status: "satisfied" as const,
      missing: [],
      summary: "旧运行记录未包含章节义务覆盖信息。",
    };
    const filtered = filterAcceptedFactItems({
      chapterOrder,
      mustHitNow: writeCtx.obligationContract?.mustHitNow ?? [],
      obligationCoverage,
      acceptanceRiskTags: runtimePackage.meta?.riskTags ?? [],
    });
    if (filtered.excluded.length > 0) {
      await this.recordExcludedFactItems({
        novelId,
        chapterId,
        chapterOrder,
        runId,
        obligationCoverageStatus: obligationCoverage.status,
        excluded: filtered.excluded,
      });
    }

    if (filtered.accepted.length === 0) {
      return;
    }
    await novelFactService.writeFacts(novelId, chapterOrder, filtered.accepted);
  }

  private async recordExcludedFactItems(input: {
    novelId: string;
    chapterId: string;
    chapterOrder: number;
    runId: string | null;
    obligationCoverageStatus: ChapterRuntimePackage["obligationCoverage"]["status"];
    excluded: FactLedgerExcludedItem[];
  }): Promise<void> {
    for (const item of input.excluded) {
      console.warn("[fact-ledger] skipped unverified chapter obligation", {
        novelId: input.novelId,
        chapterId: input.chapterId,
        chapterOrder: input.chapterOrder,
        reason: item.reason,
        matchedMissingKind: item.matchedMissingKind ?? null,
        matchedMissingSummary: item.matchedMissingSummary ?? null,
        matchScore: item.matchScore ?? null,
        text: item.text,
      });
    }

    const fingerprint = createHash("sha1")
      .update(JSON.stringify(input.excluded.map((item) => ({
        text: item.text,
        reason: item.reason,
        matchedMissingKind: item.matchedMissingKind ?? null,
        matchedMissingSummary: item.matchedMissingSummary ?? null,
      }))))
      .digest("hex")
      .slice(0, 16);
    await directorAutomationLedgerEventService.recordEvent({
      type: "continue_with_risk",
      idempotencyKey: [
        input.novelId,
        input.chapterId,
        input.chapterOrder,
        "fact-ledger-obligation-filter",
        fingerprint,
      ].join(":"),
      runId: input.runId,
      novelId: input.novelId,
      nodeKey: "chapter_execution_node",
      summary: `本章 ${input.excluded.length} 条义务未由验收确认，未写入事实账本。`,
      affectedScope: `chapter:${input.chapterId}`,
      severity: "medium",
      metadata: {
        decision: "exclude_unverified_fact_items",
        chapterOrder: input.chapterOrder,
        obligationCoverageStatus: input.obligationCoverageStatus,
        excludedObligations: input.excluded,
      },
    }).catch((error) => {
      console.warn("[fact-ledger] skipped obligation exclusion event failed", {
        novelId: input.novelId,
        chapterId: input.chapterId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }
}
