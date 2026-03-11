import type { TaskStatus, UnifiedTaskDetail, UnifiedTaskSummary } from "@ai-novel/shared/types/task";
import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";
import { NovelService } from "../../novel/NovelService";
import {
  NOVEL_PIPELINE_STEPS,
  buildSteps,
  toLegacyTaskStatus,
} from "../taskCenter.shared";

export class PipelineTaskAdapter {
  constructor(private readonly novelService: NovelService) {}

  async list(input: {
    status?: TaskStatus;
    keyword?: string;
    take: number;
  }): Promise<UnifiedTaskSummary[]> {
    if (input.status === "waiting_approval") {
      return [];
    }
    const status = toLegacyTaskStatus(input.status);
    const rows = await prisma.generationJob.findMany({
      where: {
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

    return rows.map((row) => ({
      id: row.id,
      kind: "novel_pipeline",
      title: `${row.novel.title} (${row.startOrder}-${row.endOrder}章)`,
      status: row.status as TaskStatus,
      progress: row.progress,
      currentStage: row.currentStage,
      currentItemLabel: row.currentItemLabel,
      attemptCount: row.retryCount,
      maxAttempts: row.maxRetries,
      lastError: row.error,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      heartbeatAt: row.heartbeatAt?.toISOString() ?? null,
      ownerId: row.novelId,
      ownerLabel: row.novel.title,
      sourceRoute: `/novels/${row.novelId}/edit`,
    }));
  }

  async detail(id: string): Promise<UnifiedTaskDetail | null> {
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

    const summary: UnifiedTaskSummary = {
      id: row.id,
      kind: "novel_pipeline",
      title: `${row.novel.title} (${row.startOrder}-${row.endOrder}章)`,
      status: row.status as TaskStatus,
      progress: row.progress,
      currentStage: row.currentStage,
      currentItemLabel: row.currentItemLabel,
      attemptCount: row.retryCount,
      maxAttempts: row.maxRetries,
      lastError: row.error,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      heartbeatAt: row.heartbeatAt?.toISOString() ?? null,
      ownerId: row.novelId,
      ownerLabel: row.novel.title,
      sourceRoute: `/novels/${row.novelId}/edit`,
    };

    let payload: Record<string, unknown> = {};
    if (row.payload?.trim()) {
      try {
        payload = JSON.parse(row.payload) as Record<string, unknown>;
      } catch {
        payload = { rawPayload: row.payload };
      }
    }

    return {
      ...summary,
      provider: typeof payload.provider === "string" ? payload.provider : null,
      model: typeof payload.model === "string" ? payload.model : null,
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
    };
  }

  async retry(id: string): Promise<UnifiedTaskDetail> {
    const job = await this.novelService.retryPipelineJob(id);
    const detail = await this.detail(job.id);
    if (!detail) {
      throw new AppError("Task not found after retry.", 404);
    }
    return detail;
  }

  async cancel(id: string): Promise<UnifiedTaskDetail> {
    const job = await this.novelService.cancelPipelineJob(id);
    const detail = await this.detail(job.id);
    if (!detail) {
      throw new AppError("Task not found after cancellation.", 404);
    }
    return detail;
  }
}
