import type { ImageAsset, ImageGenerationTask } from "@ai-novel/shared/types/image";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { prisma } from "../../db/prisma";
import { AppError } from "../../middleware/errorHandler";
import { generateImagesByProvider, isImageProviderSupported, resolveImageModel } from "./provider";
import type { ImageGenerationRequest } from "./types";

function isMissingTableError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2021"
  );
}

function normalizeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message.slice(0, 1000);
  }
  return "Unknown image generation error.";
}

function toImageTask(row: Awaited<ReturnType<typeof prisma.imageGenerationTask.findUnique>>): ImageGenerationTask {
  if (!row) {
    throw new AppError("Image task not found.", 404);
  }
  return {
    id: row.id,
    sceneType: row.sceneType,
    baseCharacterId: row.baseCharacterId,
    provider: row.provider,
    model: row.model,
    prompt: row.prompt,
    negativePrompt: row.negativePrompt,
    stylePreset: row.stylePreset,
    size: row.size,
    imageCount: row.imageCount,
    seed: row.seed,
    status: row.status,
    progress: row.progress,
    retryCount: row.retryCount,
    maxRetries: row.maxRetries,
    heartbeatAt: row.heartbeatAt?.toISOString() ?? null,
    currentStage: row.currentStage,
    currentItemKey: row.currentItemKey,
    currentItemLabel: row.currentItemLabel,
    cancelRequestedAt: row.cancelRequestedAt?.toISOString() ?? null,
    error: row.error,
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toImageAsset(row: Awaited<ReturnType<typeof prisma.imageAsset.findUnique>>): ImageAsset {
  if (!row) {
    throw new AppError("Image asset not found.", 404);
  }
  return {
    id: row.id,
    taskId: row.taskId,
    sceneType: row.sceneType,
    baseCharacterId: row.baseCharacterId,
    provider: row.provider,
    model: row.model,
    url: row.url,
    mimeType: row.mimeType,
    width: row.width,
    height: row.height,
    seed: row.seed,
    prompt: row.prompt,
    isPrimary: row.isPrimary,
    sortOrder: row.sortOrder,
    metadata: row.metadata,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function buildCharacterPrompt(
  prompt: string,
  stylePreset: string | undefined,
  character: {
    name: string;
    role: string;
    personality: string;
    appearance: string | null;
    background: string;
  },
): string {
  const blocks = [
    prompt.trim(),
    stylePreset?.trim() ? `Style preset: ${stylePreset.trim()}` : "",
    `Character name: ${character.name}`,
    `Character role: ${character.role}`,
    `Personality: ${character.personality}`,
    `Appearance: ${character.appearance ?? "Not specified"}`,
    `Background: ${character.background}`,
  ];
  return blocks.filter(Boolean).join("\n");
}

export class ImageGenerationService {
  private readonly queue: string[] = [];
  private readonly queueSet = new Set<string>();
  private processing = false;

  async createCharacterTask(input: ImageGenerationRequest): Promise<ImageGenerationTask> {
    if (input.sceneType !== "character") {
      throw new AppError("Only character image generation is supported in phase one.", 400);
    }

    const provider: LLMProvider = input.provider ?? "openai";
    if (!isImageProviderSupported(provider)) {
      throw new AppError(`Provider ${provider} is not supported for image generation yet.`, 400);
    }

    const character = await prisma.baseCharacter.findUnique({
      where: { id: input.baseCharacterId },
    });
    if (!character) {
      throw new AppError("Base character not found.", 404);
    }

    const model = resolveImageModel(provider, input.model);
    const prompt = buildCharacterPrompt(input.prompt, input.stylePreset, character);
    const task = await prisma.imageGenerationTask.create({
      data: {
        sceneType: "character",
        baseCharacterId: character.id,
        provider,
        model,
        prompt,
        negativePrompt: input.negativePrompt?.trim() || null,
        stylePreset: input.stylePreset?.trim() || null,
        size: input.size ?? "1024x1024",
        imageCount: input.count ?? 1,
        seed: input.seed,
        status: "queued",
        maxRetries: input.maxRetries ?? 2,
        heartbeatAt: null,
        currentStage: "queued",
        currentItemKey: character.id,
        currentItemLabel: character.name,
      },
    });
    this.enqueueTask(task.id);
    return toImageTask(task);
  }

  async getTask(taskId: string): Promise<ImageGenerationTask> {
    const task = await prisma.imageGenerationTask.findUnique({
      where: { id: taskId },
    });
    return toImageTask(task);
  }

  async retryTask(taskId: string): Promise<ImageGenerationTask> {
    const task = await prisma.imageGenerationTask.findUnique({
      where: { id: taskId },
    });
    if (!task) {
      throw new AppError("Image task not found.", 404);
    }
    if (task.status !== "failed" && task.status !== "cancelled") {
      throw new AppError("Only failed or cancelled image tasks can be retried.", 400);
    }
    await prisma.imageGenerationTask.update({
      where: { id: taskId },
      data: {
        status: "queued",
        progress: 0,
        retryCount: 0,
        error: null,
        startedAt: null,
        finishedAt: null,
        heartbeatAt: null,
        currentStage: "queued",
        currentItemKey: task.baseCharacterId,
        currentItemLabel: null,
        cancelRequestedAt: null,
      },
    });
    this.enqueueTask(taskId);
    return this.getTask(taskId);
  }

  async cancelTask(taskId: string): Promise<ImageGenerationTask> {
    const task = await prisma.imageGenerationTask.findUnique({
      where: { id: taskId },
    });
    if (!task) {
      throw new AppError("Image task not found.", 404);
    }
    if (task.status === "succeeded" || task.status === "failed" || task.status === "cancelled") {
      throw new AppError("Only queued or running image tasks can be cancelled.", 400);
    }
    if (task.status === "queued") {
      await prisma.imageGenerationTask.update({
        where: { id: taskId },
        data: {
          status: "cancelled",
          progress: task.progress,
          error: null,
          heartbeatAt: null,
          currentStage: null,
          currentItemKey: null,
          currentItemLabel: null,
          cancelRequestedAt: null,
          finishedAt: new Date(),
        },
      });
    } else {
      await prisma.imageGenerationTask.update({
        where: { id: taskId },
        data: {
          cancelRequestedAt: new Date(),
          heartbeatAt: new Date(),
        },
      });
    }
    return this.getTask(taskId);
  }

  async listCharacterAssets(baseCharacterId: string): Promise<ImageAsset[]> {
    const assets = await prisma.imageAsset.findMany({
      where: {
        sceneType: "character",
        baseCharacterId,
      },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }],
    });
    return assets.map((item) => toImageAsset(item));
  }

  async setPrimaryAsset(assetId: string): Promise<ImageAsset> {
    const asset = await prisma.imageAsset.findUnique({
      where: { id: assetId },
    });
    if (!asset) {
      throw new AppError("Image asset not found.", 404);
    }
    if (!asset.baseCharacterId) {
      throw new AppError("Asset is missing baseCharacterId.", 400);
    }
    await prisma.$transaction(async (tx) => {
      await tx.imageAsset.updateMany({
        where: {
          sceneType: "character",
          baseCharacterId: asset.baseCharacterId,
        },
        data: { isPrimary: false },
      });
      await tx.imageAsset.update({
        where: { id: asset.id },
        data: { isPrimary: true },
      });
    });
    const updated = await prisma.imageAsset.findUnique({ where: { id: asset.id } });
    return toImageAsset(updated);
  }

  async resumePendingTasks(): Promise<void> {
    try {
      const rows = await prisma.imageGenerationTask.findMany({
        where: { status: { in: ["queued", "running"] } },
        select: { id: true, status: true },
        orderBy: { createdAt: "asc" },
      });
      if (rows.length === 0) {
        return;
      }
      const runningIds = rows.filter((item) => item.status === "running").map((item) => item.id);
      if (runningIds.length > 0) {
        await prisma.imageGenerationTask.updateMany({
          where: { id: { in: runningIds } },
          data: {
            status: "queued",
            error: "Task interrupted by server restart and requeued.",
            heartbeatAt: null,
            currentStage: "queued",
            currentItemKey: null,
            currentItemLabel: null,
            cancelRequestedAt: null,
          },
        });
      }
      rows.forEach((item) => this.enqueueTask(item.id));
    } catch (error) {
      if (isMissingTableError(error)) {
        return;
      }
      throw error;
    }
  }

  private enqueueTask(taskId: string): void {
    if (this.queueSet.has(taskId)) {
      return;
    }
    this.queue.push(taskId);
    this.queueSet.add(taskId);
    void this.processQueue();
  }

  private async processQueue(): Promise<void> {
    if (this.processing) {
      return;
    }
    this.processing = true;
    try {
      while (this.queue.length > 0) {
        const taskId = this.queue.shift();
        if (!taskId) {
          continue;
        }
        this.queueSet.delete(taskId);
        await this.executeTask(taskId);
      }
    } finally {
      this.processing = false;
    }
  }

  private async executeTask(taskId: string): Promise<void> {
    const task = await prisma.imageGenerationTask.findUnique({
      where: { id: taskId },
      include: { baseCharacter: true },
    });
    if (!task) {
      return;
    }
    if (task.status !== "queued" && task.status !== "running") {
      return;
    }
    if (task.cancelRequestedAt) {
      await this.markCancelled(task.id, task.progress);
      return;
    }
    if (!task.baseCharacterId || !task.baseCharacter) {
      await prisma.imageGenerationTask.update({
        where: { id: task.id },
        data: {
          status: "failed",
          progress: 1,
          error: "Base character was not found.",
          heartbeatAt: null,
          currentStage: null,
          currentItemKey: null,
          currentItemLabel: null,
          cancelRequestedAt: null,
          finishedAt: new Date(),
        },
      });
      return;
    }
    await prisma.imageGenerationTask.update({
      where: { id: task.id },
      data: {
        status: "running",
        progress: 0.1,
        error: null,
        startedAt: task.startedAt ?? new Date(),
        heartbeatAt: new Date(),
        currentStage: "submitting",
        currentItemKey: task.baseCharacterId,
        currentItemLabel: task.baseCharacter.name,
      },
    });

    try {
      await this.ensureNotCancelled(task.id);
      await prisma.imageGenerationTask.update({
        where: { id: task.id },
        data: {
          heartbeatAt: new Date(),
          currentStage: "generating",
          currentItemKey: task.baseCharacterId,
          currentItemLabel: task.baseCharacter.name,
        },
      });

      const result = await generateImagesByProvider({
        provider: task.provider as LLMProvider,
        model: task.model,
        prompt: task.prompt,
        negativePrompt: task.negativePrompt ?? undefined,
        size: task.size as "512x512" | "768x768" | "1024x1024" | "1024x1536" | "1536x1024",
        count: task.imageCount,
        seed: task.seed ?? undefined,
      });

      await this.ensureNotCancelled(task.id);
      await prisma.imageGenerationTask.update({
        where: { id: task.id },
        data: {
          progress: 0.8,
          heartbeatAt: new Date(),
          currentStage: "saving_assets",
        },
      });

      await prisma.$transaction(async (tx) => {
        const hasPrimary = await tx.imageAsset.findFirst({
          where: {
            sceneType: "character",
            baseCharacterId: task.baseCharacterId,
            isPrimary: true,
          },
          select: { id: true },
        });
        for (let index = 0; index < result.images.length; index += 1) {
          const image = result.images[index];
          await tx.imageAsset.create({
            data: {
              taskId: task.id,
              sceneType: "character",
              baseCharacterId: task.baseCharacterId,
              provider: result.provider,
              model: result.model,
              url: image.url,
              mimeType: image.mimeType ?? null,
              width: image.width ?? null,
              height: image.height ?? null,
              seed: image.seed ?? null,
              prompt: task.prompt,
              isPrimary: !hasPrimary && index === 0,
              sortOrder: index,
              metadata: image.metadata ? JSON.stringify(image.metadata) : null,
            },
          });
        }
        await tx.imageGenerationTask.update({
          where: { id: task.id },
          data: {
            status: "succeeded",
            progress: 1,
            error: null,
            heartbeatAt: null,
            currentStage: null,
            currentItemKey: null,
            currentItemLabel: null,
            cancelRequestedAt: null,
            finishedAt: new Date(),
          },
        });
      });
    } catch (error) {
      if (error instanceof AppError && error.message === "IMAGE_TASK_CANCELLED") {
        await this.markCancelled(task.id, task.progress);
        return;
      }
      const errorMessage = normalizeError(error);
      const shouldRetry = task.retryCount < task.maxRetries;
      if (shouldRetry) {
        await prisma.imageGenerationTask.update({
          where: { id: task.id },
          data: {
            status: "queued",
            progress: 0,
            retryCount: { increment: 1 },
            error: errorMessage,
            heartbeatAt: null,
            currentStage: "queued",
            currentItemKey: null,
            currentItemLabel: null,
            cancelRequestedAt: null,
          },
        });
        setTimeout(() => this.enqueueTask(task.id), 1500);
      } else {
        await prisma.imageGenerationTask.update({
          where: { id: task.id },
          data: {
            status: "failed",
            progress: 1,
            error: errorMessage,
            heartbeatAt: null,
            currentStage: null,
            currentItemKey: null,
            currentItemLabel: null,
            cancelRequestedAt: null,
            finishedAt: new Date(),
          },
        });
      }
    }
  }

  private async ensureNotCancelled(taskId: string): Promise<void> {
    const task = await prisma.imageGenerationTask.findUnique({
      where: { id: taskId },
      select: {
        status: true,
        cancelRequestedAt: true,
      },
    });
    if (!task || task.status === "cancelled" || task.cancelRequestedAt) {
      throw new AppError("IMAGE_TASK_CANCELLED", 400);
    }
  }

  private async markCancelled(taskId: string, progress: number): Promise<void> {
    await prisma.imageGenerationTask.update({
      where: { id: taskId },
      data: {
        status: "cancelled",
        progress,
        error: null,
        heartbeatAt: null,
        currentStage: null,
        currentItemKey: null,
        currentItemLabel: null,
        cancelRequestedAt: null,
        finishedAt: new Date(),
      },
    });
  }
}

export const imageGenerationService = new ImageGenerationService();
