export type ImageSceneType = "character" | "novel_cover" | "chapter_illustration";

export type ImageTaskStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export const DEFAULT_NOVEL_COVER_IMAGE_SIZE = "1024x1536";
export const DEFAULT_NOVEL_COVER_IMAGE_COUNT = 2;

interface BaseImageGenerationTask {
  id: string;
  sceneType: ImageSceneType;
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

export type CharacterImageGenerationTask = BaseImageGenerationTask & {
  sceneType: "character";
  baseCharacterId: string;
  novelId?: null;
};

export type NovelCoverImageGenerationTask = BaseImageGenerationTask & {
  sceneType: "novel_cover";
  novelId: string;
  baseCharacterId?: null;
};

export type ChapterIllustrationImageGenerationTask = BaseImageGenerationTask & {
  sceneType: "chapter_illustration";
  baseCharacterId?: string | null;
  novelId?: string | null;
};

export type ImageGenerationTask =
  | CharacterImageGenerationTask
  | NovelCoverImageGenerationTask
  | ChapterIllustrationImageGenerationTask;

interface BaseImageAsset {
  id: string;
  taskId: string;
  sceneType: ImageSceneType;
  provider: string;
  model: string;
  url: string;
  localPath?: string | null;
  sourceUrl?: string | null;
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

export type CharacterImageAsset = BaseImageAsset & {
  sceneType: "character";
  baseCharacterId: string;
  novelId?: null;
};

export type NovelCoverImageAsset = BaseImageAsset & {
  sceneType: "novel_cover";
  novelId: string;
  baseCharacterId?: null;
};

export type ChapterIllustrationImageAsset = BaseImageAsset & {
  sceneType: "chapter_illustration";
  baseCharacterId?: string | null;
  novelId?: string | null;
};

export type ImageAsset =
  | CharacterImageAsset
  | NovelCoverImageAsset
  | ChapterIllustrationImageAsset;
