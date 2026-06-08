import type { ChapterRuntimePackage, GenerationContextPackage } from "@ai-novel/shared/types/chapterRuntime";
import { prisma } from "../../../db/prisma";
import { openConflictService } from "../../state/OpenConflictService";
import { novelFactService } from "../fact/NovelFactService";
import { ChapterArtifactSyncService } from "./ChapterArtifactSyncService";
import type { ChapterRuntimeRequestInput } from "./chapterRuntimeSchema";
import type { StyleReviewResult } from "./PostGenerationStyleReviewRunner";
import { ChapterQualityGateService } from "./ChapterQualityGateService";
import {
  buildRuntimePackage,
  type ChapterRuntimePlannerPort,
} from "./chapterRuntimePackageBuilders";

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
      void this.writeAcceptedFacts(input.novelId, input.contextPackage).catch((error) => {
        console.warn("[chapter-runtime] deferred fact ledger write failed", {
          novelId: input.novelId,
          chapterId: input.chapterId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }

    if (!needsRepair && input.deferArtifactBackgroundSync && input.scheduleDeferredArtifactBackgroundSync !== false) {
      await this.artifactSyncService.syncChapterArtifacts(
        input.novelId,
        input.chapterId,
        finalContent,
        {
          scheduleBackgroundSync: true,
          artifactSyncMode: input.request.artifactSyncMode,
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
   * 章节接收通过后，将已完成的义务条目和已兑现的伏笔写入事实账本。
   * 这是事实账本的主要自动写入路径。
   *
   * 数据来源（均来自 chapterWriteContext，不需要额外 LLM 调用）：
   * - obligationContract.mustHitNow：本章必须完成的过程性目标
   * - payoffDirectives[operation=payoff|partial_reveal]：本章已兑现的伏笔
   */
  private async writeAcceptedFacts(
    novelId: string,
    contextPackage: GenerationContextPackage,
  ): Promise<void> {
    const chapterOrder = contextPackage.chapter.order;
    const writeCtx = contextPackage.chapterWriteContext;
    if (!writeCtx) {
      return;
    }
    const items: Array<{ text: string; category: "completed" | "revealed" }> = [];

    // 来源1：义务合同 mustHitNow — 已在本章必须完成的过程性目标
    for (const item of writeCtx.obligationContract.mustHitNow) {
      const text = item.trim();
      if (text) {
        items.push({ text: `第${chapterOrder}章已完成：${text}`, category: "completed" });
      }
    }

    // 来源2：payoffDirectives 中 operation=payoff|partial_reveal — 已兑现的伏笔
    for (const directive of writeCtx.payoffDirectives) {
      if (directive.operation === "payoff" || directive.operation === "partial_reveal") {
        const text = directive.title.trim();
        if (text) {
          const prefix = directive.operation === "payoff" ? "已完全揭示" : "已部分揭示";
          items.push({
            text: `第${chapterOrder}章${prefix}：${text}`,
            category: "revealed",
          });
        }
      }
    }

    if (items.length === 0) {
      return;
    }
    await novelFactService.writeFacts(novelId, chapterOrder, items);
  }
}
