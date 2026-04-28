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
import { NovelService } from "../novel/NovelService";
import { NovelDirectorService } from "../novel/director/NovelDirectorService";
import { NovelWorkflowRuntimeService } from "../novel/workflow/NovelWorkflowRuntimeService";
import {
  parseResumeTarget,
  resumeTargetToRoute,
} from "../novel/workflow/novelWorkflow.shared";
import { styleExtractionTaskService } from "../styleEngine/StyleExtractionTaskService";
import { buildWorkflowExplainability } from "./novelWorkflowExplainability";
import { buildTaskRecoveryHint } from "./taskSupport";

interface RecoveryInitializationDeps {
  markPendingBookAnalysesForManualRecovery(): Promise<unknown>;
  markPendingImageTasksForManualRecovery(): Promise<unknown>;
  resumePendingAutoDirectorTasks(): Promise<unknown>;
  markPendingPipelineJobsForManualRecovery(): Promise<unknown>;
  markPendingStyleTasksForManualRecovery(): Promise<unknown>;
}

function parseAutoExecutionScopeLabel(seedPayloadJson: string | null | undefined): string | null {
  if (!seedPayloadJson?.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(seedPayloadJson) as {
      autoExecution?: {
        scopeLabel?: unknown;
      };
    };
    return typeof parsed.autoExecution?.scopeLabel === "string"
      ? parsed.autoExecution.scopeLabel.trim() || null
      : null;
  } catch {
    return null;
  }
}

export class RecoveryTaskService {
  private initializationPromise: Promise<void> | null = null;

  constructor(
    private readonly novelWorkflowRuntimeService = new NovelWorkflowRuntimeService(),
    private readonly novelPipelineRuntimeService = new NovelPipelineRuntimeService(),
    private readonly novelDirectorService = new NovelDirectorService(),
    private readonly novelService = new NovelService(),
    private readonly initializationDeps: RecoveryInitializationDeps = {
      markPendingBookAnalysesForManualRecovery: () => bookAnalysisService.markPendingAnalysesForManualRecovery(),
      markPendingImageTasksForManualRecovery: () => imageGenerationService.markPendingTasksForManualRecovery(),
      resumePendingAutoDirectorTasks: () => this.novelWorkflowRuntimeService.resumePendingAutoDirectorTasks(),
      markPendingPipelineJobsForManualRecovery: () => this.novelPipelineRuntimeService.markPendingPipelineJobsForManualRecovery(),
      markPendingStyleTasksForManualRecovery: () => styleExtractionTaskService.markPendingTasksForManualRecovery(),
    },
  ) {}

  initializePendingRecoveries(): Promise<void> {
    if (!this.initializationPromise) {
      this.initializationPromise = Promise.all([
        this.initializationDeps.markPendingBookAnalysesForManualRecovery(),
        this.initializationDeps.markPendingImageTasksForManualRecovery(),
        this.initializationDeps.resumePendingAutoDirectorTasks(),
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
          title: true,
          status: true,
          currentStage: true,
          currentItemKey: true,
          currentItemLabel: true,
          checkpointType: true,
          resumeTargetJson: true,
          seedPayloadJson: true,
          lastError: true,
          novelId: true,
          updatedAt: true,
          novel: {
            select: {
              title: true,
            },
          },
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
          novel: {
            select: {
              title: true,
            },
          },
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
          document: {
            select: {
              title: true,
            },
          },
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
          baseCharacterId: true,
          currentStage: true,
          currentItemLabel: true,
          error: true,
          updatedAt: true,
          baseCharacter: {
            select: {
              name: true,
            },
          },
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

    const rawItems = [
      ...workflowRows.map((row): RecoverableTaskSummary & { updatedAt: Date } => {
        const status = row.status as RecoverableTaskSummary["status"];
        const explainability = buildWorkflowExplainability({
          status,
          currentStage: row.currentStage,
          currentItemKey: row.currentItemKey,
          checkpointType: row.checkpointType as Parameters<typeof buildWorkflowExplainability>[0]["checkpointType"],
          lastError: row.lastError,
          executionScopeLabel: parseAutoExecutionScopeLabel(row.seedPayloadJson),
        });
        const resumeTarget = parseResumeTarget(row.resumeTargetJson);
        const sourceRoute = resumeTarget
          ? resumeTargetToRoute(resumeTarget)
          : (row.novelId ? `/novels/${row.novelId}/edit?taskId=${row.id}` : "/tasks");
        return {
          id: row.id,
          kind: "novel_workflow",
          title: row.title,
          ownerLabel: row.novel?.title?.trim() || row.title,
          status,
          currentStage: row.currentStage,
          currentItemLabel: row.currentItemLabel,
          resumeAction: explainability.resumeAction,
          sourceRoute,
          recoveryHint: row.lastError?.trim() || buildTaskRecoveryHint("novel_workflow", status),
          updatedAt: row.updatedAt,
        };
      }),
      ...pipelineRows.map((row): RecoverableTaskSummary & { updatedAt: Date } => {
        const status = row.status as RecoverableTaskSummary["status"];
        return {
          id: row.id,
          kind: "novel_pipeline",
          title: `${row.novel.title} (${row.startOrder}-${row.endOrder}章)`,
          ownerLabel: row.novel.title,
          status,
          currentStage: row.currentStage,
          currentItemLabel: row.currentItemLabel,
          sourceRoute: `/novels/${row.novelId}/edit`,
          recoveryHint: row.error?.trim() || buildTaskRecoveryHint("novel_pipeline", status),
          updatedAt: row.updatedAt,
        };
      }),
      ...bookRows.map((row): RecoverableTaskSummary & { updatedAt: Date } => {
        const status = row.status as RecoverableTaskSummary["status"];
        return {
          id: row.id,
          kind: "book_analysis",
          title: row.title,
          ownerLabel: row.document.title,
          status,
          currentStage: row.currentStage,
          currentItemLabel: row.currentItemLabel,
          sourceRoute: `/book-analysis?analysisId=${row.id}&documentId=${row.documentId}`,
          recoveryHint: row.lastError?.trim() || buildTaskRecoveryHint("book_analysis", status),
          updatedAt: row.updatedAt,
        };
      }),
      ...imageRows.map((row): RecoverableTaskSummary & { updatedAt: Date } => {
        const status = row.status as RecoverableTaskSummary["status"];
        const ownerLabel = row.baseCharacter?.name ?? "未关联角色";
        return {
          id: row.id,
          kind: "image_generation",
          title: row.baseCharacter?.name ? `角色图像：${row.baseCharacter.name}` : `图像任务 ${row.id.slice(0, 8)}`,
          ownerLabel,
          status,
          currentStage: row.currentStage,
          currentItemLabel: row.currentItemLabel,
          sourceRoute: row.baseCharacterId ? `/base-characters?id=${row.baseCharacterId}` : "/base-characters",
          recoveryHint: row.error?.trim() || buildTaskRecoveryHint("image_generation", status),
          updatedAt: row.updatedAt,
        };
      }),
      ...styleExtractionRows.map((row): RecoverableTaskSummary & { updatedAt: Date } => {
        const status = row.status as RecoverableTaskSummary["status"];
        return {
          id: row.id,
          kind: "style_extraction",
          title: `写法提取：${row.name}`,
          ownerLabel: row.name,
          status,
          currentStage: row.currentStage,
          currentItemLabel: row.currentItemLabel,
          sourceRoute: "/writing-formula",
          recoveryHint: row.error?.trim() || buildTaskRecoveryHint("style_extraction", status),
          updatedAt: row.updatedAt,
        };
      }),
    ].sort((left, right) => {
      const timeDiff = right.updatedAt.getTime() - left.updatedAt.getTime();
      if (timeDiff !== 0) {
        return timeDiff;
      }
      return right.id.localeCompare(left.id);
    });

    const items = rawItems.map(({ updatedAt: _updatedAt, ...item }) => item);

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
    if (kind === "style_extraction") {
      await styleExtractionTaskService.resumeTask(id);
      return;
    }
    throw new AppError(`Unsupported recovery task kind: ${kind}`, 400);
  }

  async resumeAllRecoveryCandidates(): Promise<Array<{ kind: TaskKind; id: string }>> {
    await this.waitUntilReady();
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
}

export const recoveryTaskService = new RecoveryTaskService();
