import type { ChapterRuntimePackage, GenerationContextPackage } from "@ai-novel/shared/types/chapterRuntime";
import { prisma } from "../../../db/prisma";
import { openConflictService } from "../../state/OpenConflictService";
import { ChapterArtifactSyncService } from "./ChapterArtifactSyncService";
import type { ChapterRuntimeRequestInput } from "./chapterRuntimeSchema";
import type { StyleReviewResult } from "./PostGenerationStyleReviewRunner";
import type { ChapterTimelineFinalizationService } from "./ChapterTimelineFinalizationService";
import { ChapterQualityGateService } from "./ChapterQualityGateService";
import {
  buildRuntimePackage,
  type ChapterRuntimePlannerPort,
} from "./chapterRuntimePackageBuilders";

export interface ChapterContentFinalizationAgentRuntime {
  finishChapterGenRun: (runId: string, summary: string, durationMs: number) => Promise<void>;
}

export interface ChapterContentFinalizationServiceDeps {
  qualityGateService: Pick<ChapterQualityGateService, "runGates">;
  artifactSyncService: Pick<ChapterArtifactSyncService, "syncChapterArtifacts">;
  plannerService: ChapterRuntimePlannerPort;
  timelineFinalizer: Pick<ChapterTimelineFinalizationService, "finalizeCurrentContent">;
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
  private readonly qualityGateService: Pick<ChapterQualityGateService, "runGates">;
  private readonly artifactSyncService: Pick<ChapterArtifactSyncService, "syncChapterArtifacts">;
  private readonly plannerService: ChapterRuntimePlannerPort;
  private readonly timelineFinalizer: Pick<ChapterTimelineFinalizationService, "finalizeCurrentContent">;
  private readonly agentRuntime: ChapterContentFinalizationAgentRuntime;

  constructor(deps: ChapterContentFinalizationServiceDeps) {
    this.qualityGateService = deps.qualityGateService;
    this.artifactSyncService = deps.artifactSyncService;
    this.plannerService = deps.plannerService;
    this.timelineFinalizer = deps.timelineFinalizer;
    this.agentRuntime = deps.agentRuntime;
  }

  async finalizeChapterContent(input: FinalizeChapterContentInput): Promise<FinalizeChapterContentResult> {
    const finalContent = input.content;
    const { acceptance, timelineGate } = await this.qualityGateService.runGates({
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
      await this.timelineFinalizer.finalizeCurrentContent({
        novelId: input.novelId,
        chapterId: input.chapterId,
        content: finalContent,
        contextPackage: input.contextPackage,
        request: input.request,
        timelineGate,
        sourceStage: "draft_accepted",
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
}
