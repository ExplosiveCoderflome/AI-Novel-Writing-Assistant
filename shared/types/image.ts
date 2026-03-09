export type ImageSceneType = "character" | "novel_cover" | "chapter_illustration";

export type ImageTaskStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export interface ImageGenerationTask {
  id: string;
  sceneType: ImageSceneType;
  baseCharacterId?: string | null;
  provider: string;
  model: string;
  prompt: string;
  negativePrompt?: string | null;
  stylePreset?: string | null;
  size: string;
  imageCount: number;
  seed?: number | null;
  status: ImageTaskStatus;
  progress: number;
  retryCount: number;
  maxRetries: number;
  heartbeatAt?: string | null;
  currentStage?: string | null;
  currentItemKey?: string | null;
  currentItemLabel?: string | null;
  cancelRequestedAt?: string | null;
  error?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ImageAsset {
  id: string;
  taskId: string;
  sceneType: ImageSceneType;
  baseCharacterId?: string | null;
  provider: string;
  model: string;
  url: string;
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
  seed?: number | null;
  prompt?: string | null;
  isPrimary: boolean;
  sortOrder: number;
  metadata?: string | null;
  createdAt: string;
  updatedAt: string;
}
