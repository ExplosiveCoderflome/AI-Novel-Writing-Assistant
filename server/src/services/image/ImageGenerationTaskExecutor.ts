import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { prisma } from "../../db/prisma";
import { AppError } from "../../middleware/errorHandler";
import { generateImagesByProvider } from "./provider";
import {
  persistGeneratedImageAsset,
  resolveImageAssetFile,
} from "./imageAssetStorage";
import { normalizeImageGenerationError } from "./imageGenerationMappers";
import type { ImageSize } from "./types";

type SupportedImageSceneType = "character" | "novel_cover" | "book_analysis_character";

function parseStringArrayJson(value: string | null | undefined): string[] {
  if (!value?.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function resolveTaskOwnerKey(task: {
  sceneType: string;
  baseCharacterId: string | null;
  novelId: string | null;
  bookAnalysisCharacterId: string | null;
}): string | null {
  if (task.sceneType === "novel_cover") {
    return task.novelId;
  }
  if (task.sceneType === "book_analysis_character") {
    return task.bookAnalysisCharacterId;
  }
  if (task.sceneType === "character") {
    return task.baseCharacterId;
  }
  return null;
}

function resolveSceneType(sceneType: string): SupportedImageSceneType {
  if (sceneType === "character" || sceneType === "novel_cover" || sceneType === "book_analysis_character") {
    return sceneType;
  }
  throw new AppError(`Scene type ${sceneType} is not supported for image generation yet.`, 400);
}

function buildAssetOwnerWhere(input: {
  sceneType: SupportedImageSceneType;
  baseCharacterId: string | null;
  novelId: string | null;
  bookAnalysisCharacterId: string | null;
}): Record<string, unknown> {
  if (input.sceneType === "novel_cover") {
    if (!input.novelId) {
      throw new AppError("Novel cover asset is missing novelId.", 400);
    }
    return {
      sceneType: "novel_cover",
      novelId: input.novelId,
    };
  }

  if (input.sceneType === "book_analysis_character") {
    if (!input.bookAnalysisCharacterId) {
      throw new AppError("Book analysis character image asset is missing bookAnalysisCharacterId.", 400);
    }
    return {
      sceneType: "book_analysis_character",
      bookAnalysisCharacterId: input.bookAnalysisCharacterId,
    };
  }

  if (!input.baseCharacterId) {
    throw new AppError("Character image asset is missing baseCharacterId.", 400);
  }
  return {
    sceneType: "character",
    baseCharacterId: input.baseCharacterId,
  };
}

function buildMissingOwnerError(sceneType: SupportedImageSceneType): string {
  if (sceneType === "novel_cover") {
    return "Novel was not found.";
  }
  if (sceneType === "book_analysis_character") {
    return "Book analysis character was not found.";
  }
  return "Base character was not found.";
}

function resolveCurrentItemLabel(task: {
  sceneType: string;
  baseCharacter?: { name: string } | null;
  novel?: { title: string } | null;
  bookAnalysisCharacter?: { name: string } | null;
} | null): string | null {
  if (!task) {
    return null;
  }
  if (task.sceneType === "novel_cover") {
    return task.novel?.title ?? null;
  }
  if (task.sceneType === "book_analysis_character") {
    return task.bookAnalysisCharacter?.name ?? null;
  }
  return task.baseCharacter?.name ?? null;
}

async function resolveReferenceImagesForTask(task: {
  sceneType: string;
  baseCharacterId: string | null;
  novelId: string | null;
  bookAnalysisCharacterId: string | null;
  referenceImageAssetIdsJson?: string | null;
}): Promise<{ refImagePaths: string[]; refImages: string[]; assetIds: string[] }> {
  const requestedIds = parseStringArrayJson(task.referenceImageAssetIdsJson);
  if (requestedIds.length === 0) {
    return { refImagePaths: [], refImages: [], assetIds: [] };
  }
  const sceneType = resolveSceneType(task.sceneType);
  const ownerWhere = buildAssetOwnerWhere({
    sceneType,
    baseCharacterId: task.baseCharacterId,
    novelId: task.novelId,
    bookAnalysisCharacterId: task.bookAnalysisCharacterId,
  });
  const rows = await prisma.imageAsset.findMany({
    where: {
      id: { in: requestedIds },
      ...ownerWhere,
    },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  const orderedRows = requestedIds.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
  const refImagePaths: string[] = [];
  const refImages: string[] = [];
  const assetIds: string[] = [];
  for (const asset of orderedRows) {
    const resolved = await resolveImageAssetFile({
      assetId: asset.id,
      url: asset.url,
      mimeType: asset.mimeType,
      metadata: asset.metadata,
    });
    if (resolved.localPath) {
      refImagePaths.push(resolved.localPath);
      assetIds.push(asset.id);
      continue;
    }
    if (/^(https?:|data:)/i.test(asset.url)) {
      refImages.push(asset.url);
      assetIds.push(asset.id);
    }
  }
  return { refImagePaths, refImages, assetIds };
}

async function cleanupOrphanAppearanceImages(taskId: string): Promise<void> {
  await prisma.bookAnalysisCharacterAppearanceImage.deleteMany({
    where: {
      generationTaskId: taskId,
      imageAssetId: null,
    },
  });
}

async function ensureNotCancelled(taskId: string): Promise<void> {
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

async function markCancelled(taskId: string, progress: number): Promise<void> {
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
  await cleanupOrphanAppearanceImages(taskId);
}

export async function executeImageGenerationTask(
  taskId: string,
  input: { requeueTask: (taskId: string) => void },
): Promise<void> {
  const task = await prisma.imageGenerationTask.findUnique({
    where: { id: taskId },
    include: {
      baseCharacter: true,
      novel: {
        select: {
          id: true,
          title: true,
        },
      },
      bookAnalysisCharacter: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });
  if (!task) {
    return;
  }
  if ((task.status !== "queued" && task.status !== "running") || task.pendingManualRecovery) {
    return;
  }

  const sceneType = resolveSceneType(task.sceneType);
  const currentItemKey = resolveTaskOwnerKey(task);
  const currentItemLabel = resolveCurrentItemLabel(task);

  if (task.cancelRequestedAt) {
    await markCancelled(task.id, task.progress);
    return;
  }
  if (!currentItemKey || !currentItemLabel) {
    await prisma.imageGenerationTask.update({
      where: { id: task.id },
      data: {
        status: "failed",
        progress: 1,
        error: buildMissingOwnerError(sceneType),
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
      pendingManualRecovery: false,
      progress: 0.1,
      error: null,
      startedAt: task.startedAt ?? new Date(),
      heartbeatAt: new Date(),
      currentStage: "submitting",
      currentItemKey,
      currentItemLabel,
    },
  });

  try {
    await ensureNotCancelled(task.id);
    await prisma.imageGenerationTask.update({
      where: { id: task.id },
      data: {
        heartbeatAt: new Date(),
        currentStage: "generating",
        currentItemKey,
        currentItemLabel,
      },
    });

    const referenceImages = await resolveReferenceImagesForTask(task);
    const result = await generateImagesByProvider({
      sceneType,
      provider: task.provider as LLMProvider,
      model: task.model,
      prompt: task.prompt,
      negativePrompt: task.negativePrompt ?? undefined,
      size: task.size as ImageSize,
      count: task.imageCount,
      seed: task.seed ?? undefined,
      ...(referenceImages.refImagePaths.length > 0 ? { refImagePaths: referenceImages.refImagePaths } : {}),
      ...(referenceImages.refImages.length > 0 ? { refImages: referenceImages.refImages } : {}),
    });

    await ensureNotCancelled(task.id);
    await prisma.imageGenerationTask.update({
      where: { id: task.id },
      data: {
        progress: 0.8,
        heartbeatAt: new Date(),
        currentStage: "saving_assets",
      },
    });

    const persistedImages: Array<{
      image: (typeof result.images)[number];
      persisted: Awaited<ReturnType<typeof persistGeneratedImageAsset>>;
    }> = [];
    for (let index = 0; index < result.images.length; index += 1) {
      await ensureNotCancelled(task.id);
      const image = result.images[index];
      const persisted = await persistGeneratedImageAsset({
        taskId: task.id,
        sceneType,
        baseCharacterId: task.baseCharacterId,
        novelId: task.novelId,
        bookAnalysisCharacterId: task.bookAnalysisCharacterId,
        sortOrder: index,
        url: image.url,
        mimeType: image.mimeType ?? null,
      });
      persistedImages.push({ image, persisted });
    }

    const ownerWhere = buildAssetOwnerWhere({
      sceneType,
      baseCharacterId: task.baseCharacterId,
      novelId: task.novelId,
      bookAnalysisCharacterId: task.bookAnalysisCharacterId,
    });

    await ensureNotCancelled(task.id);
    await prisma.$transaction(async (tx) => {
      const hasPrimary = await tx.imageAsset.findFirst({
        where: {
          ...ownerWhere,
          isPrimary: true,
        },
        select: { id: true },
      });
      for (let index = 0; index < persistedImages.length; index += 1) {
        const { image, persisted } = persistedImages[index];
        const asset = await tx.imageAsset.create({
          data: {
            taskId: task.id,
            sceneType,
            baseCharacterId: sceneType === "character" ? task.baseCharacterId : null,
            novelId: sceneType === "novel_cover" ? task.novelId : null,
            bookAnalysisCharacterId: sceneType === "book_analysis_character" ? task.bookAnalysisCharacterId : null,
            provider: result.provider,
            model: result.model,
            url: persisted.persistedUrl,
            mimeType: persisted.mimeType,
            width: image.width ?? null,
            height: image.height ?? null,
            seed: image.seed ?? null,
            prompt: task.prompt,
            isPrimary: !hasPrimary && index === 0,
            sortOrder: index,
            metadata: JSON.stringify({
              ...(image.metadata ?? {}),
              localPath: persisted.localPath,
              relativePath: persisted.relativePath,
              sourceUrl: persisted.sourceUrl,
              storageKey: persisted.storageKey,
              storageDriver: persisted.storageDriver,
              referenceImageAssetIds: referenceImages.assetIds,
            }),
          },
        });
        if (sceneType === "book_analysis_character") {
          const pendingAppearanceImage = await tx.bookAnalysisCharacterAppearanceImage.findFirst({
            where: {
              generationTaskId: task.id,
              imageAssetId: null,
            },
            orderBy: [{ createdAt: "asc" }],
            select: { id: true },
          });
          if (pendingAppearanceImage) {
            await tx.bookAnalysisCharacterAppearanceImage.update({
              where: { id: pendingAppearanceImage.id },
              data: { imageAssetId: asset.id },
            });
          }
        }
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
      await markCancelled(task.id, task.progress);
      return;
    }
    const errorMessage = normalizeImageGenerationError(error);
    const shouldRetry = task.retryCount < task.maxRetries;
    if (shouldRetry) {
      await prisma.imageGenerationTask.update({
        where: { id: task.id },
        data: {
          status: "queued",
          pendingManualRecovery: false,
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
      setTimeout(() => input.requeueTask(task.id), 1500);
      return;
    }
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
    await cleanupOrphanAppearanceImages(task.id);
  }
}
