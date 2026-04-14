import path from "node:path";
import type { ImageAsset, ImageGenerationTask } from "@ai-novel/shared/types/image";
import { AppError } from "../../middleware/errorHandler";
import { buildImageAssetPublicUrl, parseImageAssetMetadata } from "./imageAssetStorage";

export function isMissingTableError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2021"
  );
}

export function normalizeImageGenerationError(error: unknown): string {
  if (error instanceof Error) {
    return error.message.slice(0, 1000);
  }
  return "Unknown image generation error.";
}

export function toImageTask(row: Awaited<{
  id: string;
  sceneType: string;
  baseCharacterId: string | null;
  provider: string;
  model: string;
  prompt: string;
  negativePrompt: string | null;
  stylePreset: string | null;
  size: string;
  imageCount: number;
  seed: number | null;
  status: string;
  progress: number;
  retryCount: number;
  maxRetries: number;
  heartbeatAt: Date | null;
  currentStage: string | null;
  currentItemKey: string | null;
  currentItemLabel: string | null;
  cancelRequestedAt: Date | null;
  error: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
} | null>): ImageGenerationTask {
  if (!row) {
    throw new AppError("Image task not found.", 404);
  }
  return {
    id: row.id,
    sceneType: row.sceneType as ImageGenerationTask["sceneType"],
    baseCharacterId: row.baseCharacterId,
    provider: row.provider,
    model: row.model,
    prompt: row.prompt,
    negativePrompt: row.negativePrompt,
    stylePreset: row.stylePreset,
    size: row.size,
    imageCount: row.imageCount,
    seed: row.seed,
    status: row.status as ImageGenerationTask["status"],
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

export function toImageAsset(row: Awaited<{
  id: string;
  taskId: string;
  sceneType: string;
  baseCharacterId: string | null;
  provider: string;
  model: string;
  url: string;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  seed: number | null;
  prompt: string | null;
  isPrimary: boolean;
  sortOrder: number;
  metadata: string | null;
  createdAt: Date;
  updatedAt: Date;
} | null>): ImageAsset {
  if (!row) {
    throw new AppError("Image asset not found.", 404);
  }
  const metadata = parseImageAssetMetadata(row.metadata);
  const publicUrl = buildImageAssetPublicUrl(row.id);
  const isStoredAsset = Boolean(path.isAbsolute(row.url) || !/^[a-z][a-z0-9+.-]*:/i.test(row.url));
  const sourceUrl = isStoredAsset ? null : (metadata.sourceUrl ?? row.url);
  return {
    id: row.id,
    taskId: row.taskId,
    sceneType: row.sceneType as ImageAsset["sceneType"],
    baseCharacterId: row.baseCharacterId,
    provider: row.provider,
    model: row.model,
    url: isStoredAsset ? publicUrl : row.url,
    localPath: null,
    sourceUrl,
    mimeType: row.mimeType,
    width: row.width,
    height: row.height,
    seed: row.seed,
    prompt: row.prompt,
    isPrimary: row.isPrimary,
    sortOrder: row.sortOrder,
    metadata: null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function buildCharacterPrompt(
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
