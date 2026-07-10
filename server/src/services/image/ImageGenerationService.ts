import {
  DEFAULT_NOVEL_COVER_NEGATIVE_PROMPT,
  DEFAULT_NOVEL_COVER_STYLE_PRESET,
} from "@ai-novel/shared/imagePrompt";
import {
  DEFAULT_NOVEL_COVER_IMAGE_COUNT,
  DEFAULT_NOVEL_COVER_IMAGE_SIZE,
  type ImageAsset,
  type ImageGenerationTask,
} from "@ai-novel/shared/types/image";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { prisma } from "../../db/prisma";
import { AppError } from "../../middleware/errorHandler";
import {
  buildNovelCoverTaskPrompt,
  loadNovelCoverNovel,
} from "./novelCover/novelCoverPromptSupport";
import { isImageProviderSupported, resolveImageModel } from "./provider";
import {
  persistGeneratedImageAsset,
  removeStoredImageAssetFile,
  resolveImageAssetFile,
} from "./imageAssetStorage";
import {
  buildCharacterPrompt,
  isMissingTableError,
  toImageAsset,
  toImageTask,
} from "./imageGenerationMappers";
import { executeImageGenerationTask } from "./ImageGenerationTaskExecutor";
import type {
  BookAnalysisCharacterImageGenerationRequest,
  CharacterImageGenerationRequest,
  NovelCoverImageGenerationRequest,
} from "./types";

type SupportedImageSceneType = "character" | "novel_cover" | "book_analysis_character";

function parseBookAnalysisCharacterProfile(profileJson: string | null): Record<string, unknown> {
  if (!profileJson?.trim()) {
    return {};
  }
  try {
    const parsed = JSON.parse(profileJson) as unknown;
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function normalizeReferenceImageAssetIds(value: string[] | undefined): string[] {
  return Array.from(new Set((value ?? []).map((item) => item.trim()).filter(Boolean))).slice(0, 6);
}

function readProfileText(profile: Record<string, unknown>, key: string): string {
  return typeof profile[key] === "string" ? String(profile[key]).trim() : "";
}

function buildBookAnalysisCharacterPrompt(
  prompt: string,
  stylePreset: string | undefined,
  character: {
    name: string;
    role: string;
    profileJson: string | null;
  },
): string {
  const profile = parseBookAnalysisCharacterProfile(character.profileJson);
  const background = [
    readProfileText(profile, "outerGoal") ? `外在目标：${readProfileText(profile, "outerGoal")}` : "",
    readProfileText(profile, "innerNeed") ? `内在需求：${readProfileText(profile, "innerNeed")}` : "",
    readProfileText(profile, "growthTrajectory") ? `成长轨迹：${readProfileText(profile, "growthTrajectory")}` : "",
  ].filter(Boolean).join("\n") || "来自拆书角色档案。";
  return buildCharacterPrompt(prompt, stylePreset, {
    name: readProfileText(profile, "name") || character.name,
    role: readProfileText(profile, "role") || character.role,
    personality: readProfileText(profile, "personality") || readProfileText(profile, "values") || "未明确",
    appearance: [
      readProfileText(profile, "appearance"),
      readProfileText(profile, "physique"),
      readProfileText(profile, "attireStyle"),
      readProfileText(profile, "signatureDetail"),
    ].filter(Boolean).join("；") || null,
    background,
  });
}

function mergeNovelCoverNegativePrompt(input: string | null | undefined): string {
  const normalized = input?.trim();
  if (!normalized) {
    return DEFAULT_NOVEL_COVER_NEGATIVE_PROMPT;
  }
  return normalized.includes(DEFAULT_NOVEL_COVER_NEGATIVE_PROMPT)
    ? normalized
    : `${normalized}，${DEFAULT_NOVEL_COVER_NEGATIVE_PROMPT}`;
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

export class ImageGenerationService {
  private readonly queue: string[] = [];
  private readonly queueSet = new Set<string>();
  private processing = false;

  async createCharacterTask(input: CharacterImageGenerationRequest): Promise<ImageGenerationTask> {
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

    const model = await resolveImageModel(provider, input.model);
    const prompt = input.promptMode === "direct"
      ? input.prompt.trim()
      : buildCharacterPrompt(input.prompt, input.stylePreset, character);
    const task = await prisma.imageGenerationTask.create({
      data: {
        sceneType: "character",
        baseCharacterId: character.id,
        novelId: null,
        provider,
        model,
        prompt,
        negativePrompt: input.negativePrompt?.trim() || null,
        stylePreset: input.stylePreset?.trim() || null,
        referenceImageAssetIdsJson: JSON.stringify(normalizeReferenceImageAssetIds(input.referenceImageAssetIds)),
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

  async createBookAnalysisCharacterTask(input: BookAnalysisCharacterImageGenerationRequest): Promise<ImageGenerationTask> {
    const provider: LLMProvider = input.provider ?? "openai";
    if (!isImageProviderSupported(provider)) {
      throw new AppError(`Provider ${provider} is not supported for image generation yet.`, 400);
    }

    const character = await prisma.bookAnalysisCharacter.findUnique({
      where: { id: input.bookAnalysisCharacterId },
    });
    if (!character) {
      throw new AppError("Book analysis character not found.", 404);
    }
    if (character.status !== "generated" || !character.profileJson?.trim()) {
      throw new AppError("Generate the character profile before creating character images.", 400);
    }

    const model = await resolveImageModel(provider, input.model);
    const prompt = input.promptMode === "direct"
      ? input.prompt.trim()
      : buildBookAnalysisCharacterPrompt(input.prompt, input.stylePreset, character);
    const task = await prisma.imageGenerationTask.create({
      data: {
        sceneType: "book_analysis_character",
        baseCharacterId: null,
        novelId: null,
        bookAnalysisCharacterId: character.id,
        provider,
        model,
        prompt,
        negativePrompt: input.negativePrompt?.trim() || null,
        stylePreset: input.stylePreset?.trim() || null,
        referenceImageAssetIdsJson: JSON.stringify(normalizeReferenceImageAssetIds(input.referenceImageAssetIds)),
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

  async createNovelCoverTask(input: NovelCoverImageGenerationRequest): Promise<ImageGenerationTask> {
    const provider: LLMProvider = input.provider ?? "openai";
    if (!isImageProviderSupported(provider)) {
      throw new AppError(`Provider ${provider} is not supported for image generation yet.`, 400);
    }

    const novel = await loadNovelCoverNovel(input.novelId);
    const model = await resolveImageModel(provider, input.model);
    const prompt = input.promptMode === "direct"
      ? input.prompt.trim()
      : await buildNovelCoverTaskPrompt({
        novelId: novel.id,
        sourcePrompt: input.prompt,
        stylePreset: input.stylePreset?.trim() || DEFAULT_NOVEL_COVER_STYLE_PRESET,
      });
    const task = await prisma.imageGenerationTask.create({
      data: {
        sceneType: "novel_cover",
        baseCharacterId: null,
        novelId: novel.id,
        provider,
        model,
        prompt,
        negativePrompt: mergeNovelCoverNegativePrompt(input.negativePrompt),
        stylePreset: input.stylePreset?.trim() || DEFAULT_NOVEL_COVER_STYLE_PRESET,
        referenceImageAssetIdsJson: JSON.stringify(normalizeReferenceImageAssetIds(input.referenceImageAssetIds)),
        size: input.size ?? DEFAULT_NOVEL_COVER_IMAGE_SIZE,
        imageCount: input.count ?? DEFAULT_NOVEL_COVER_IMAGE_COUNT,
        seed: input.seed,
        status: "queued",
        maxRetries: input.maxRetries ?? 2,
        heartbeatAt: null,
        currentStage: "queued",
        currentItemKey: novel.id,
        currentItemLabel: novel.title,
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
      select: {
        id: true,
        status: true,
        sceneType: true,
        baseCharacterId: true,
        novelId: true,
        bookAnalysisCharacterId: true,
      },
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
        pendingManualRecovery: false,
        progress: 0,
        retryCount: 0,
        error: null,
        startedAt: null,
        finishedAt: null,
        heartbeatAt: null,
        currentStage: "queued",
        currentItemKey: resolveTaskOwnerKey(task),
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

  async listBookAnalysisCharacterAssets(bookAnalysisCharacterId: string): Promise<ImageAsset[]> {
    const assets = await prisma.imageAsset.findMany({
      where: {
        sceneType: "book_analysis_character",
        bookAnalysisCharacterId,
      },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }],
    });
    return assets.map((item) => toImageAsset(item));
  }

  async listNovelCoverAssets(novelId: string): Promise<ImageAsset[]> {
    const assets = await prisma.imageAsset.findMany({
      where: {
        sceneType: "novel_cover",
        novelId,
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

    const sceneType = resolveSceneType(asset.sceneType);
    const ownerWhere = buildAssetOwnerWhere({
      sceneType,
      baseCharacterId: asset.baseCharacterId,
      novelId: asset.novelId,
      bookAnalysisCharacterId: asset.bookAnalysisCharacterId,
    });

    await prisma.$transaction(async (tx) => {
      await tx.imageAsset.updateMany({
        where: ownerWhere,
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

  async deleteAsset(assetId: string): Promise<ImageAsset> {
    const asset = await prisma.imageAsset.findUnique({
      where: { id: assetId },
    });
    if (!asset) {
      throw new AppError("Image asset not found.", 404);
    }

    const sceneType = resolveSceneType(asset.sceneType);
    const ownerWhere = buildAssetOwnerWhere({
      sceneType,
      baseCharacterId: asset.baseCharacterId,
      novelId: asset.novelId,
      bookAnalysisCharacterId: asset.bookAnalysisCharacterId,
    });

    await prisma.$transaction(async (tx) => {
      await tx.imageAsset.delete({
        where: { id: asset.id },
      });

      if (!asset.isPrimary) {
        return;
      }

      const replacement = await tx.imageAsset.findFirst({
        where: ownerWhere,
        orderBy: [{ createdAt: "desc" }],
      });

      if (!replacement) {
        return;
      }

      await tx.imageAsset.update({
        where: { id: replacement.id },
        data: { isPrimary: true },
      });
    });

    try {
      await removeStoredImageAssetFile({
        assetId: asset.id,
        url: asset.url,
        metadata: asset.metadata,
      });
    } catch (error) {
      console.warn(`[image] failed to remove stored asset file for ${asset.id}.`, error);
    }

    return toImageAsset(asset);
  }

  async getAssetFile(assetId: string): Promise<{ localPath?: string; stream?: NodeJS.ReadableStream; mimeType: string | null }> {
    const asset = await prisma.imageAsset.findUnique({
      where: { id: assetId },
      select: {
        id: true,
        url: true,
        mimeType: true,
        metadata: true,
      },
    });
    if (!asset) {
      throw new AppError("Image asset not found.", 404);
    }

    const resolved = await resolveImageAssetFile({
      assetId: asset.id,
      url: asset.url,
      mimeType: asset.mimeType ?? null,
      metadata: asset.metadata,
    });

    return {
      localPath: resolved.localPath,
      stream: resolved.stream,
      mimeType: resolved.mimeType ?? asset.mimeType ?? null,
    };
  }

  async markPendingTasksForManualRecovery(): Promise<void> {
    try {
      const rows = await prisma.imageGenerationTask.findMany({
        where: {
          status: { in: ["queued", "running"] },
          pendingManualRecovery: false,
        },
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
            pendingManualRecovery: true,
            error: "服务重启后任务已暂停，等待手动恢复。",
            heartbeatAt: null,
            currentStage: "queued",
            currentItemKey: null,
            currentItemLabel: null,
            cancelRequestedAt: null,
          },
        });
      }
      const queuedIds = rows.filter((item) => item.status === "queued").map((item) => item.id);
      if (queuedIds.length > 0) {
        await prisma.imageGenerationTask.updateMany({
          where: { id: { in: queuedIds } },
          data: {
            pendingManualRecovery: true,
            error: "服务重启后任务已暂停，等待手动恢复。",
            heartbeatAt: null,
            cancelRequestedAt: null,
          },
        });
      }
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
    await executeImageGenerationTask(taskId, {
      requeueTask: (id) => this.enqueueTask(id),
    });
  }

  async resumeTask(taskId: string): Promise<ImageGenerationTask> {
    const task = await prisma.imageGenerationTask.findUnique({
      where: { id: taskId },
      select: {
        status: true,
      },
    });
    if (!task) {
      throw new AppError("Image task not found.", 404);
    }
    if (task.status !== "queued" && task.status !== "running") {
      throw new AppError("Only queued or running image tasks can be resumed.", 400);
    }

    await prisma.imageGenerationTask.update({
      where: { id: taskId },
      data: {
        status: "queued",
        pendingManualRecovery: false,
        heartbeatAt: null,
        cancelRequestedAt: null,
      },
    });
    this.enqueueTask(taskId);
    return this.getTask(taskId);
  }
}

export const imageGenerationService = new ImageGenerationService();
