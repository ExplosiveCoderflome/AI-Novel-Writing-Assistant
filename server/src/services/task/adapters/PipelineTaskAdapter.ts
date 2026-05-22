import type { TaskStatus, UnifiedTaskDetail, UnifiedTaskSummary } from "@ai-novel/shared/types/task";
import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";
import { NovelService } from "../../novel/NovelService";
import {
  getPipelineQualityNotice,
  parsePipelinePayload,
} from "../../novel/pipelineJobState";
import { NovelWorkflowService } from "../../novel/workflow/NovelWorkflowService";
import {
  buildTaskRecoveryHint,
  isArchivableTaskStatus,
  normalizeFailureSummary,
} from "../taskSupport";
import { toTaskTokenUsageSummary } from "../taskTokenUsageSummary";
import {
  archiveTask as recordTaskArchive,
  getArchivedTaskIds,
  isTaskArchived,
} from "../taskArchive";
import {
  NOVEL_PIPELINE_STEPS,
  buildSteps,
  toLegacyTaskStatus,
} from "../taskCenter.shared";

type PipelineRow = {
  id: string;
  novelId: string;
  startOrder: number;
  endOrder: number;
  status: string;
  progress: number;
  currentStage: string | null;
  currentItemLabel: string | null;
  retryCount: number;
  maxRetries: number;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
  heartbeatAt: Date | null;
  payload: string | null;
  lastErrorType: string | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  llmCallCount: number;
  lastTokenRecordedAt: Date | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  cancelRequestedAt?: Date | null;
  completedCount?: number;
  totalCount?: number;
  novel: {
    id: string;
    title: string;
  };
};

export class PipelineTaskAdapter {
  private readonly workflowService = new NovelWorkflowService();

  constructor(private readonly novelService: NovelService) {}

  private toSummary(row: PipelineRow): UnifiedTaskSummary {
    const payload = parsePipelinePayload(row.payload);
    const notice = row.status === "succeeded"
      ? getPipelineQualityNotice(payload.qualityAlertDetails)
      : getPipelineQualityNotice(undefined);

    return {
      id: row.id,
      kind: "novel_pipeline",
      title: `${row.novel.title} (${row.startOrder}-${row.endOrder}章)`,
      status: row.status as TaskStatus,
      progress: row.progress,
      currentStage: row.currentStage,
      currentItemLabel: row.currentItemLabel,
      displayStatus: notice.displayStatus,
      attemptCount: row.retryCount,
      maxAttempts: row.maxRetries,
      lastError: row.error,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      heartbeatAt: row.heartbeatAt?.toISOString() ?? null,
      ownerId: row.novelId,
      ownerLabel: row.novel.title,
      sourceRoute: `/novels/${row.novelId}/edit`,
      noticeCode: notice.noticeCode,
      noticeSummary: notice.noticeSummary,
      failureCode: row.lastErrorType ?? (row.status === "failed" ? "PIPELINE_FAILED" : null),
      failureSummary: row.status === "failed"
        ? normalizeFailureSummary(row.error, "章节流水线失败，但没有记录明确错误。")
        : null,
      recoveryHint: buildTaskRecoveryHint("novel_pipeline", row.status as TaskStatus),
      tokenUsage: toTaskTokenUsageSummary({
        promptTokens: row.promptTokens,
        completionTokens: row.completionTokens,
        totalTokens: row.totalTokens,
        llmCallCount: row.llmCallCount,
        lastTokenRecordedAt: row.lastTokenRecordedAt,
      }),
      sourceResource: {
        type: "novel",
        id: row.novelId,
        label: row.novel.title,
        route: `/novels/${row.novelId}/edit`,
      },
      targetResources: [{
        type: "generation_job",
        id: row.id,
        label: `${row.startOrder}-${row.endOrder}章流水线`,
        route: `/novels/${row.novelId}/edit`,
      }],
    };
  }

  async list(input: {
    status?: TaskStatus;
    keyword?: string;
    take: number;
  }): Promise<UnifiedTaskSummary[]> {
    if (input.status === "waiting_approval") {
      return [];
    }
    const status = toLegacyTaskStatus(input.status);
    const archivedIds = await getArchivedTaskIds("novel_pipeline");
    const rows = await prisma.generationJob.findMany({
      where: {
        ...(archivedIds.length
          ? {
            id: {
              notIn: archivedIds,
            },
          }
          : {}),
        ...(status ? { status } : {}),
        ...(input.keyword
          ? {
            OR: [
              { novel: { title: { contains: input.keyword } } },
              { id: { contains: input.keyword } },
            ],
          }
          : {}),
      },
      include: {
        novel: {
          select: {
            id: true,
            title: true,
          },
        },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: input.take,
    });

    return rows.map((row) => this.toSummary(row));
  }

  async detail(id: string): Promise<UnifiedTaskDetail | null> {
    if (await isTaskArchived("novel_pipeline", id)) {
      return null;
    }

    const row = await prisma.generationJob.findUnique({
      where: { id },
      include: {
        novel: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });
    if (!row) {
      return null;
    }

    const summary = this.toSummary(row);
    const payload = parsePipelinePayload(row.payload);

    return {
      ...summary,
      provider: payload.provider ?? null,
      model: payload.model ?? null,
      startedAt: row.startedAt?.toISOString() ?? null,
      finishedAt: row.finishedAt?.toISOString() ?? null,
      retryCountLabel: `${row.retryCount}/${row.maxRetries}`,
      meta: {
        novelId: row.novelId,
        startOrder: row.startOrder,
        endOrder: row.endOrder,
        totalCount: row.totalCount,
        completedCount: row.completedCount,
        cancelRequestedAt: row.cancelRequestedAt?.toISOString() ?? null,
        payload,
      },
      steps: buildSteps(
        NOVEL_PIPELINE_STEPS,
        summary.status,
        summary.currentStage,
        summary.createdAt,
        summary.updatedAt,
      ),
      failureDetails: row.error,
    };
  }

  async retry(id: string): Promise<UnifiedTaskDetail> {
    if (await isTaskArchived("novel_pipeline", id)) {
      throw new AppError("Task not found.", 404);
    }

    const job = await this.novelService.retryPipelineJob(id);
    const detail = await this.detail(job.id);
    if (!detail) {
      throw new AppError("Task not found after retry.", 404);
    }
    return detail;
  }

  async cancel(id: string): Promise<UnifiedTaskDetail> {
    if (await isTaskArchived("novel_pipeline", id)) {
      throw new AppError("Task not found.", 404);
    }

    const job = await this.novelService.cancelPipelineJob(id);
    await this.cancelLinkedAutoDirectorTask(job.id, job.novelId).catch(() => null);
    const detail = await this.detail(job.id);
    if (!detail) {
      throw new AppError("Task not found after cancellation.", 404);
    }
    return detail;
  }

  private async cancelLinkedAutoDirectorTask(pipelineJobId: string, novelId: string): Promise<void> {
    const linkedWorkflow = await prisma.novelWorkflowTask.findFirst({
      where: {
        lane: "auto_director",
        novelId,
        status: { in: ["queued", "running", "waiting_approval"] },
        seedPayloadJson: { contains: `"pipelineJobId":"${pipelineJobId}"` },
      },
      select: { id: true },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    });
    if (!linkedWorkflow) {
      return;
    }
    await this.workflowService.cancelTask(linkedWorkflow.id);
  }

  async archive(id: string): Promise<UnifiedTaskDetail | null> {
    if (await isTaskArchived("novel_pipeline", id)) {
      return null;
    }

    const job = await prisma.generationJob.findUnique({
      where: { id },
    });
    if (!job) {
      throw new AppError("Task not found.", 404);
    }
    if (!isArchivableTaskStatus(job.status as TaskStatus)) {
      throw new AppError("Only completed, failed, or cancelled tasks can be archived.", 400);
    }

    await recordTaskArchive("novel_pipeline", id);
    return null;
  }
}
