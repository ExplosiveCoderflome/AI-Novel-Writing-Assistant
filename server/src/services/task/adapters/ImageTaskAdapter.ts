import type { TaskStatus, UnifiedTaskDetail, UnifiedTaskSummary } from "@ai-novel/shared/types/task";
import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";
import { imageGenerationService } from "../../image/ImageGenerationService";
import { IMAGE_TASK_STEPS, buildSteps, toLegacyTaskStatus } from "../taskCenter.shared";
import { buildTaskRecoveryHint, normalizeFailureSummary } from "../taskSupport";

export class ImageTaskAdapter {
  async list(input: {
    status?: TaskStatus;
    keyword?: string;
    take: number;
  }): Promise<UnifiedTaskSummary[]> {
    if (input.status === "waiting_approval") {
      return [];
    }
    const status = toLegacyTaskStatus(input.status);
    const rows = await prisma.imageGenerationTask.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(input.keyword
          ? {
            OR: [
              { prompt: { contains: input.keyword } },
              { baseCharacter: { name: { contains: input.keyword } } },
            ],
          }
          : {}),
      },
      include: {
        baseCharacter: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: input.take,
    });

    return rows.map((row) => ({
      id: row.id,
      kind: "image_generation",
      title: row.baseCharacter?.name ? `角色图像：${row.baseCharacter.name}` : `图像任务 ${row.id.slice(0, 8)}`,
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
      ownerId: row.baseCharacterId ?? row.id,
      ownerLabel: row.baseCharacter?.name ?? "未关联角色",
      sourceRoute: row.baseCharacterId ? `/base-characters?id=${row.baseCharacterId}` : "/base-characters",
      failureCode: row.status === "failed" ? "IMAGE_GENERATION_FAILED" : null,
      failureSummary: row.status === "failed"
        ? normalizeFailureSummary(row.error, "图像任务失败，但没有记录明确错误。")
        : row.error,
      recoveryHint: buildTaskRecoveryHint("image_generation", row.status as TaskStatus),
      sourceResource: row.baseCharacterId
        ? {
          type: "base_character",
          id: row.baseCharacterId,
          label: row.baseCharacter?.name ?? "基础角色",
          route: `/base-characters?id=${row.baseCharacterId}`,
        }
        : {
          type: "task",
          id: row.id,
          label: `图像任务 ${row.id.slice(0, 8)}`,
          route: "/tasks",
        },
      targetResources: [],
    }));
  }

  async detail(id: string): Promise<UnifiedTaskDetail | null> {
    const row = await prisma.imageGenerationTask.findUnique({
      where: { id },
      include: {
        baseCharacter: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
    if (!row) {
      return null;
    }

    const summary: UnifiedTaskSummary = {
      id: row.id,
      kind: "image_generation",
      title: row.baseCharacter?.name ? `角色图像：${row.baseCharacter.name}` : `图像任务 ${row.id.slice(0, 8)}`,
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
      ownerId: row.baseCharacterId ?? row.id,
      ownerLabel: row.baseCharacter?.name ?? "未关联角色",
      sourceRoute: row.baseCharacterId ? `/base-characters?id=${row.baseCharacterId}` : "/base-characters",
      failureCode: row.status === "failed" ? "IMAGE_GENERATION_FAILED" : null,
      failureSummary: row.status === "failed"
        ? normalizeFailureSummary(row.error, "图像任务失败，但没有记录明确错误。")
        : row.error,
      recoveryHint: buildTaskRecoveryHint("image_generation", row.status as TaskStatus),
      sourceResource: row.baseCharacterId
        ? {
          type: "base_character",
          id: row.baseCharacterId,
          label: row.baseCharacter?.name ?? "基础角色",
          route: `/base-characters?id=${row.baseCharacterId}`,
        }
        : {
          type: "task",
          id: row.id,
          label: `图像任务 ${row.id.slice(0, 8)}`,
          route: "/tasks",
        },
      targetResources: [],
    };

    return {
      ...summary,
      provider: row.provider,
      model: row.model,
      startedAt: row.startedAt?.toISOString() ?? null,
      finishedAt: row.finishedAt?.toISOString() ?? null,
      retryCountLabel: `${row.retryCount}/${row.maxRetries}`,
      meta: {
        sceneType: row.sceneType,
        baseCharacterId: row.baseCharacterId,
        prompt: row.prompt,
        negativePrompt: row.negativePrompt,
        size: row.size,
        imageCount: row.imageCount,
        cancelRequestedAt: row.cancelRequestedAt?.toISOString() ?? null,
      },
      steps: buildSteps(
        IMAGE_TASK_STEPS,
        summary.status,
        summary.currentStage,
        summary.createdAt,
        summary.updatedAt,
      ),
      failureDetails: row.error,
    };
  }

  async retry(id: string): Promise<UnifiedTaskDetail> {
    const task = await imageGenerationService.retryTask(id);
    const detail = await this.detail(task.id);
    if (!detail) {
      throw new AppError("Task not found after retry.", 404);
    }
    return detail;
  }

  async cancel(id: string): Promise<UnifiedTaskDetail> {
    const task = await imageGenerationService.cancelTask(id);
    const detail = await this.detail(task.id);
    if (!detail) {
      throw new AppError("Task not found after cancellation.", 404);
    }
    return detail;
  }
}
