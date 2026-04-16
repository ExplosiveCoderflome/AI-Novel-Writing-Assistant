import type {
  RecoverableTaskListResponse,
  RecoverableTaskSummary,
  TaskKind,
  UnifiedTaskDetail,
} from "@ai-novel/shared/types/task";
import { prisma } from "../../db/prisma";
import { AppError } from "../../middleware/errorHandler";
import { bookAnalysisService } from "../bookAnalysis/BookAnalysisService";
import { imageGenerationService } from "../image/ImageGenerationService";
import { NovelPipelineRuntimeService } from "../novel/NovelPipelineRuntimeService";
import { NovelService } from "../novel/NovelService";
import { NovelDirectorService } from "../novel/director/NovelDirectorService";
import { NovelWorkflowRuntimeService } from "../novel/workflow/NovelWorkflowRuntimeService";
import { taskCenterService } from "./TaskCenterService";

function toRecoverableTaskSummary(detail: UnifiedTaskDetail | null): RecoverableTaskSummary | null {
  if (!detail || (detail.status !== "queued" && detail.status !== "running")) {
    return null;
  }
  return {
    id: detail.id,
    kind: detail.kind as RecoverableTaskSummary["kind"],
    title: detail.title,
    ownerLabel: detail.ownerLabel,
    status: detail.status,
    currentStage: detail.currentStage,
    currentItemLabel: detail.currentItemLabel,
    resumeAction: detail.resumeAction,
    sourceRoute: detail.sourceRoute,
    recoveryHint: detail.lastError?.trim() || detail.recoveryHint,
  };
}

export class RecoveryTaskService {
  private initializationPromise: Promise<void> | null = null;

  constructor(
    private readonly novelWorkflowRuntimeService = new NovelWorkflowRuntimeService(),
    private readonly novelPipelineRuntimeService = new NovelPipelineRuntimeService(),
    private readonly novelDirectorService = new NovelDirectorService(),
    private readonly novelService = new NovelService(),
  ) {}

  initializePendingRecoveries(): Promise<void> {
    if (!this.initializationPromise) {
      this.initializationPromise = Promise.all([
        bookAnalysisService.markPendingAnalysesForManualRecovery(),
        imageGenerationService.markPendingTasksForManualRecovery(),
        this.novelWorkflowRuntimeService.markPendingAutoDirectorTasksForManualRecovery(),
        this.novelPipelineRuntimeService.markPendingPipelineJobsForManualRecovery(),
      ]).then(() => undefined);
    }
    return this.initializationPromise;
  }

  async waitUntilReady(): Promise<void> {
    if (this.initializationPromise) {
      await this.initializationPromise;
    }
  }

  async listRecoveryCandidates(): Promise<RecoverableTaskListResponse> {
    await this.waitUntilReady();
    const [
      workflowRows,
      pipelineRows,
      bookRows,
      imageRows,
    ] = await Promise.all([
      prisma.novelWorkflowTask.findMany({
        where: {
          lane: "auto_director",
          status: { in: ["queued", "running"] },
          pendingManualRecovery: true,
        },
        select: { id: true, updatedAt: true },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      }),
      prisma.generationJob.findMany({
        where: {
          status: { in: ["queued", "running"] },
          pendingManualRecovery: true,
        },
        select: { id: true, updatedAt: true },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      }),
      prisma.bookAnalysis.findMany({
        where: {
          status: { in: ["queued", "running"] },
          pendingManualRecovery: true,
        },
        select: { id: true, updatedAt: true },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      }),
      prisma.imageGenerationTask.findMany({
        where: {
          status: { in: ["queued", "running"] },
          pendingManualRecovery: true,
        },
        select: { id: true, updatedAt: true },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      }),
    ]);

    const rawItems = [
      ...workflowRows.map((row) => ({ kind: "novel_workflow" as const, id: row.id, updatedAt: row.updatedAt })),
      ...pipelineRows.map((row) => ({ kind: "novel_pipeline" as const, id: row.id, updatedAt: row.updatedAt })),
      ...bookRows.map((row) => ({ kind: "book_analysis" as const, id: row.id, updatedAt: row.updatedAt })),
      ...imageRows.map((row) => ({ kind: "image_generation" as const, id: row.id, updatedAt: row.updatedAt })),
    ].sort((left, right) => {
      const timeDiff = right.updatedAt.getTime() - left.updatedAt.getTime();
      if (timeDiff !== 0) {
        return timeDiff;
      }
      return right.id.localeCompare(left.id);
    });

    const items = (await Promise.all(
      rawItems.map(async (item) => {
        const detail = await taskCenterService.getTaskDetail(item.kind, item.id);
        return toRecoverableTaskSummary(detail);
      }),
    )).filter((item): item is RecoverableTaskSummary => Boolean(item));

    return { items };
  }

  async resumeRecoveryCandidate(kind: TaskKind, id: string): Promise<void> {
    await this.waitUntilReady();
    if (kind === "novel_workflow") {
      await this.novelDirectorService.continueTask(id);
      return;
    }
    if (kind === "novel_pipeline") {
      await this.novelService.resumePipelineJob(id);
      return;
    }
    if (kind === "book_analysis") {
      await bookAnalysisService.resumePendingAnalysis(id);
      return;
    }
    if (kind === "image_generation") {
      await imageGenerationService.resumeTask(id);
      return;
    }
    throw new AppError(`Unsupported recovery task kind: ${kind}`, 400);
  }

  async resumeAllRecoveryCandidates(): Promise<Array<{ kind: TaskKind; id: string }>> {
    const { items } = await this.listRecoveryCandidates();
    const resumed: Array<{ kind: TaskKind; id: string }> = [];
    for (const item of items) {
      await this.resumeRecoveryCandidate(item.kind, item.id);
      resumed.push({ kind: item.kind, id: item.id });
    }
    return resumed;
  }
}

export const recoveryTaskService = new RecoveryTaskService();
