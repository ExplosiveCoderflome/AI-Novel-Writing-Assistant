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
import { createNovelApplicationServices } from "../novel/application/NovelApplicationServices";
import type { NovelApplicationServices } from "../novel/application/NovelApplicationContracts";
import { DirectorCommandService } from "../novel/director/DirectorCommandService";
import { NovelWorkflowRuntimeService } from "../novel/workflow/NovelWorkflowRuntimeService";
import { styleExtractionTaskService } from "../styleEngine/StyleExtractionTaskService";
import { taskCenterService } from "./TaskCenterService";

interface RecoveryInitializationDeps {
  markPendingBookAnalysesForManualRecovery(): Promise<unknown>;
  markPendingImageTasksForManualRecovery(): Promise<unknown>;
  markPendingAutoDirectorTasksForManualRecovery(): Promise<unknown>;
  markPendingPipelineJobsForManualRecovery(): Promise<unknown>;
  markPendingStyleTasksForManualRecovery(): Promise<unknown>;
}

interface AutoDirectorRecoveryCommandPort {
  enqueueRecoveryCommand?: (taskId: string) => Promise<unknown>;
  continueTask?: (taskId: string) => Promise<void>;
}

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
    private readonly directorCommandService: AutoDirectorRecoveryCommandPort = new DirectorCommandService(),
    private readonly novelService: Pick<NovelApplicationServices, "resumePipelineJob"> = createNovelApplicationServices(),
    private readonly initializationDeps: RecoveryInitializationDeps = {
      markPendingBookAnalysesForManualRecovery: () => bookAnalysisService.markPendingAnalysesForManualRecovery(),
      markPendingImageTasksForManualRecovery: () => imageGenerationService.markPendingTasksForManualRecovery(),
      markPendingAutoDirectorTasksForManualRecovery: () => this.novelWorkflowRuntimeService.markPendingAutoDirectorTasksForManualRecovery(),
      markPendingPipelineJobsForManualRecovery: () => this.novelPipelineRuntimeService.markPendingPipelineJobsForManualRecovery(),
      markPendingStyleTasksForManualRecovery: () => styleExtractionTaskService.markPendingTasksForManualRecovery(),
    },
  ) {}

  initializePendingRecoveries(): Promise<void> {
    if (!this.initializationPromise) {
      this.initializationPromise = Promise.all([
        this.initializationDeps.markPendingBookAnalysesForManualRecovery(),
        this.initializationDeps.markPendingImageTasksForManualRecovery(),
        this.initializationDeps.markPendingAutoDirectorTasksForManualRecovery(),
        this.initializationDeps.markPendingPipelineJobsForManualRecovery(),
        this.initializationDeps.markPendingStyleTasksForManualRecovery(),
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
      styleExtractionRows,
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
      prisma.styleExtractionTask.findMany({
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
      ...styleExtractionRows.map((row) => ({ kind: "style_extraction" as const, id: row.id, updatedAt: row.updatedAt })),
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

  async resumeRecoveryCandidate(kind: TaskKind, id: string): Promise<unknown> {
    await this.waitUntilReady();
    if (kind === "novel_workflow") {
      return this.resumeAutoDirectorWorkflow(id);
    }
    if (kind === "novel_pipeline") {
      await this.novelService.resumePipelineJob(id);
      return null;
    }
    if (kind === "book_analysis") {
      await bookAnalysisService.resumePendingAnalysis(id);
      return null;
    }
    if (kind === "image_generation") {
      await imageGenerationService.resumeTask(id);
      return null;
    }
    if (kind === "style_extraction") {
      await styleExtractionTaskService.resumeTask(id);
      return null;
    }
    throw new AppError(`Unsupported recovery task kind: ${kind}`, 400);
  }

  async startResumeRecoveryCandidate(kind: TaskKind, id: string): Promise<unknown> {
    await this.waitUntilReady();
    if (kind === "novel_workflow") {
      if (this.directorCommandService.enqueueRecoveryCommand) {
        return this.directorCommandService.enqueueRecoveryCommand(id);
      }
      this.scheduleAutoDirectorRecovery(id);
      return null;
    }
    this.scheduleRecoveryResume(kind, id);
    return null;
  }

  async startResumeAllRecoveryCandidates(): Promise<Array<{ kind: TaskKind; id: string }>> {
    const { items } = await this.listRecoveryCandidates();
    const selected: Array<{ kind: TaskKind; id: string }> = [];
    let highMemoryWorkflowStartedCount = 0;
    for (const item of items) {
      if (item.kind === "novel_workflow" && highMemoryWorkflowStartedCount > 0) {
        continue;
      }
      if (item.kind === "novel_workflow") {
        highMemoryWorkflowStartedCount += 1;
      }
      selected.push({ kind: item.kind, id: item.id });
    }
    void Promise.resolve()
      .then(async () => {
        for (const item of selected) {
          await this.resumeRecoveryCandidate(item.kind, item.id);
        }
      })
      .catch((error) => {
        console.error("[recovery] resume-all background task failed:", error);
      });
    return selected;
  }

  async resumeAllRecoveryCandidates(): Promise<Array<{ kind: TaskKind; id: string }>> {
    const { items } = await this.listRecoveryCandidates();
    const resumed: Array<{ kind: TaskKind; id: string }> = [];
    let highMemoryWorkflowStartedCount = 0;
    for (const item of items) {
      if (item.kind === "novel_workflow" && highMemoryWorkflowStartedCount > 0) {
        continue;
      }
      await this.resumeRecoveryCandidate(item.kind, item.id);
      if (item.kind === "novel_workflow") {
        highMemoryWorkflowStartedCount += 1;
      }
      resumed.push({ kind: item.kind, id: item.id });
    }
    return resumed;
  }

  private scheduleRecoveryResume(kind: TaskKind, id: string): void {
    void Promise.resolve()
      .then(() => this.resumeRecoveryCandidate(kind, id))
      .catch((error) => {
        console.error(`[recovery] resume background task failed: ${kind}/${id}`, error);
      });
  }

  private resumeAutoDirectorWorkflow(id: string): Promise<unknown> {
    if (this.directorCommandService.enqueueRecoveryCommand) {
      return this.directorCommandService.enqueueRecoveryCommand(id);
    }
    if (this.directorCommandService.continueTask) {
      return this.directorCommandService.continueTask(id);
    }
    throw new AppError("Auto director recovery command service is unavailable.", 500);
  }

  private scheduleAutoDirectorRecovery(id: string): void {
    if (this.directorCommandService.enqueueRecoveryCommand) {
      void this.directorCommandService.enqueueRecoveryCommand(id).catch((error) => {
        console.error(`[recovery] auto director command enqueue failed: novel_workflow/${id}`, error);
      });
      return;
    }
    this.scheduleRecoveryResume("novel_workflow", id);
  }
}

export const recoveryTaskService = new RecoveryTaskService();
