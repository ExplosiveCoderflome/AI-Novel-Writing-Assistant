import type {
  RecoverableTaskListResponse,
  RecoverableTaskSummary,
  TaskKind,
} from "@ai-novel/shared/types/task";
import { prisma } from "../../db/prisma";
import { AppError } from "../../middleware/errorHandler";
import { bookAnalysisService } from "../bookAnalysis/BookAnalysisService";
import { imageGenerationService } from "../image/ImageGenerationService";
import { NovelPipelineRuntimeService } from "../novel/NovelPipelineRuntimeService";
import type { NovelApplicationServices } from "../novel/application/NovelApplicationContracts";
import { getSharedNovelServices } from "../novel/application/sharedNovelServices";
import { DirectorCommandService } from "../novel/director/commands/DirectorCommandService";
import { NovelWorkflowRuntimeService } from "../novel/workflow/NovelWorkflowRuntimeService";
import { styleExtractionTaskService } from "../styleEngine/StyleExtractionTaskService";

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

function toRunningStatus(status: string): RecoverableTaskSummary["status"] {
  return status === "running" ? "running" : "queued";
}

function buildWorkflowSourceRoute(row: { id: string; novelId: string | null }): string {
  return row.novelId
    ? `/novels/${row.novelId}/edit?directorTaskId=${row.id}&taskPanel=1`
    : `/tasks?kind=novel_workflow&id=${row.id}`;
}

function buildImagePresentation(row: {
  id: string;
  sceneType: string;
  novelId: string | null;
  baseCharacterId: string | null;
  novel?: { title: string } | null;
  baseCharacter?: { name: string } | null;
}): { title: string; ownerLabel: string; sourceRoute: string } {
  if (row.sceneType === "novel_cover" && row.novelId) {
    const title = row.novel?.title?.trim() || `小说 ${row.novelId.slice(0, 8)}`;
    return {
      title: `小说封面：${title}`,
      ownerLabel: title,
      sourceRoute: `/novels/${row.novelId}/edit?stage=basic`,
    };
  }
  const ownerLabel = row.baseCharacter?.name?.trim() || "未关联角色";
  return {
    title: row.baseCharacter?.name ? `角色图像：${row.baseCharacter.name}` : `图像任务 ${row.id.slice(0, 8)}`,
    ownerLabel,
    sourceRoute: row.baseCharacterId ? `/base-characters?id=${row.baseCharacterId}` : "/base-characters",
  };
}

export class RecoveryTaskService {
  private initializationPromise: Promise<void> | null = null;

  constructor(
    private readonly novelWorkflowRuntimeService = new NovelWorkflowRuntimeService(),
    private readonly novelPipelineRuntimeService = new NovelPipelineRuntimeService(),
    private readonly directorCommandService: AutoDirectorRecoveryCommandPort = new DirectorCommandService(),
    private readonly novelService: Pick<NovelApplicationServices, "resumePipelineJob"> = getSharedNovelServices(),
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
        select: {
          id: true,
          novelId: true,
          title: true,
          status: true,
          currentStage: true,
          currentItemLabel: true,
          checkpointSummary: true,
          lastError: true,
          updatedAt: true,
          novel: { select: { title: true } },
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      }),
      prisma.generationJob.findMany({
        where: {
          status: { in: ["queued", "running"] },
          pendingManualRecovery: true,
        },
        select: {
          id: true,
          novelId: true,
          startOrder: true,
          endOrder: true,
          status: true,
          currentStage: true,
          currentItemLabel: true,
          error: true,
          updatedAt: true,
          novel: { select: { title: true } },
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      }),
      prisma.bookAnalysis.findMany({
        where: {
          status: { in: ["queued", "running"] },
          pendingManualRecovery: true,
        },
        select: {
          id: true,
          documentId: true,
          title: true,
          status: true,
          currentStage: true,
          currentItemLabel: true,
          lastError: true,
          updatedAt: true,
          document: { select: { title: true } },
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      }),
      prisma.imageGenerationTask.findMany({
        where: {
          status: { in: ["queued", "running"] },
          pendingManualRecovery: true,
        },
        select: {
          id: true,
          status: true,
          sceneType: true,
          novelId: true,
          baseCharacterId: true,
          currentStage: true,
          currentItemLabel: true,
          error: true,
          updatedAt: true,
          novel: { select: { title: true } },
          baseCharacter: { select: { name: true } },
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      }),
      prisma.styleExtractionTask.findMany({
        where: {
          status: { in: ["queued", "running"] },
          pendingManualRecovery: true,
        },
        select: {
          id: true,
          name: true,
          status: true,
          currentStage: true,
          currentItemLabel: true,
          error: true,
          updatedAt: true,
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      }),
    ]);

    const rawItems: Array<RecoverableTaskSummary & { updatedAt: Date }> = [
      ...workflowRows.map((row) => ({
        id: row.id,
        kind: "novel_workflow" as const,
        title: row.title,
        ownerLabel: row.novel?.title?.trim() || row.title,
        status: toRunningStatus(row.status),
        currentStage: row.currentStage,
        currentItemLabel: row.currentItemLabel,
        resumeAction: "恢复自动导演",
        sourceRoute: buildWorkflowSourceRoute(row),
        recoveryHint: row.lastError?.trim() || row.checkpointSummary?.trim() || "服务重启后任务已暂停，等待恢复。",
        updatedAt: row.updatedAt,
      })),
      ...pipelineRows.map((row) => ({
        id: row.id,
        kind: "novel_pipeline" as const,
        title: `${row.novel.title} (${row.startOrder}-${row.endOrder}章)`,
        ownerLabel: row.novel.title,
        status: toRunningStatus(row.status),
        currentStage: row.currentStage,
        currentItemLabel: row.currentItemLabel,
        resumeAction: "恢复章节流水线",
        sourceRoute: `/novels/${row.novelId}/edit`,
        recoveryHint: row.error?.trim() || "章节流水线已暂停，等待恢复。",
        updatedAt: row.updatedAt,
      })),
      ...bookRows.map((row) => ({
        id: row.id,
        kind: "book_analysis" as const,
        title: row.title,
        ownerLabel: row.document.title,
        status: toRunningStatus(row.status),
        currentStage: row.currentStage,
        currentItemLabel: row.currentItemLabel,
        resumeAction: "恢复拆书任务",
        sourceRoute: `/book-analysis?analysisId=${row.id}&documentId=${row.documentId}`,
        recoveryHint: row.lastError?.trim() || "拆书任务已暂停，等待恢复。",
        updatedAt: row.updatedAt,
      })),
      ...imageRows.map((row) => {
        const presentation = buildImagePresentation(row);
        return {
          id: row.id,
          kind: "image_generation" as const,
          title: presentation.title,
          ownerLabel: presentation.ownerLabel,
          status: toRunningStatus(row.status),
          currentStage: row.currentStage,
          currentItemLabel: row.currentItemLabel,
          resumeAction: "恢复图像任务",
          sourceRoute: presentation.sourceRoute,
          recoveryHint: row.error?.trim() || "图像任务已暂停，等待恢复。",
          updatedAt: row.updatedAt,
        };
      }),
      ...styleExtractionRows.map((row) => ({
        id: row.id,
        kind: "style_extraction" as const,
        title: `写法提取：${row.name}`,
        ownerLabel: row.name,
        status: toRunningStatus(row.status),
        currentStage: row.currentStage,
        currentItemLabel: row.currentItemLabel,
        resumeAction: "恢复写法提取",
        sourceRoute: "/writing-formula",
        recoveryHint: row.error?.trim() || "写法提取任务已暂停，等待恢复。",
        updatedAt: row.updatedAt,
      })),
    ];

    const items = rawItems.sort((left, right) => {
      const timeDiff = right.updatedAt.getTime() - left.updatedAt.getTime();
      if (timeDiff !== 0) {
        return timeDiff;
      }
      return right.id.localeCompare(left.id);
    }).map(({ updatedAt: _updatedAt, ...item }) => item);

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
