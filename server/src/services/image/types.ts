import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { ImageSceneType } from "@ai-novel/shared/types/image";

export const IMAGE_SIZES = ["512x512", "768x768", "1024x1024", "1024x1536", "1536x1024"] as const;
export const IMAGE_PROMPT_MODES = ["character_chain", "novel_cover_chain", "direct"] as const;
export const IMAGE_PROMPT_OUTPUT_LANGUAGES = ["zh", "en"] as const;
export const IMAGE_OUTPUT_FORMATS = ["png", "jpeg", "webp"] as const;
export const IMAGE_BACKGROUNDS = ["transparent", "opaque", "auto"] as const;
export const IMAGE_QUALITIES = ["low", "medium", "high", "auto"] as const;
export const IMAGE_MODERATION_LEVELS = ["low", "auto"] as const;

export type ImageSize = (typeof IMAGE_SIZES)[number];
export type ImagePromptMode = (typeof IMAGE_PROMPT_MODES)[number];
export type ImagePromptOutputLanguage = (typeof IMAGE_PROMPT_OUTPUT_LANGUAGES)[number];
export type ImageOutputFormat = (typeof IMAGE_OUTPUT_FORMATS)[number];
export type ImageBackground = (typeof IMAGE_BACKGROUNDS)[number];
export type ImageQuality = (typeof IMAGE_QUALITIES)[number];
export type ImageModerationLevel = (typeof IMAGE_MODERATION_LEVELS)[number];

interface BaseImageGenerationRequest {
  prompt: string;
  negativePrompt?: string;
  stylePreset?: string;
  provider?: LLMProvider;
  model?: string;
  size?: ImageSize;
  count?: number;
  seed?: number;
  maxRetries?: number;
}

export interface CharacterImageGenerationRequest extends BaseImageGenerationRequest {
  sceneType: Extract<ImageSceneType, "character">;
  baseCharacterId: string;
  promptMode?: Extract<ImagePromptMode, "character_chain" | "direct">;
}

export interface NovelCoverImageGenerationRequest extends BaseImageGenerationRequest {
  sceneType: Extract<ImageSceneType, "novel_cover">;
  novelId: string;
  promptMode?: Extract<ImagePromptMode, "novel_cover_chain" | "direct">;
}

export type ImageGenerationRequest =
  | CharacterImageGenerationRequest
  | NovelCoverImageGenerationRequest;

export interface OptimizeCharacterImagePromptRequest {
  sceneType: Extract<ImageSceneType, "character">;
  baseCharacterId: string;
  sourcePrompt: string;
  stylePreset?: string;
  outputLanguage: ImagePromptOutputLanguage;
}

export interface OptimizeNovelCoverImagePromptRequest {
  sceneType: Extract<ImageSceneType, "novel_cover">;
  novelId: string;
  sourcePrompt: string;
  stylePreset?: string;
  outputLanguage: ImagePromptOutputLanguage;
}

export type OptimizeImagePromptRequest =
  | OptimizeCharacterImagePromptRequest
  | OptimizeNovelCoverImagePromptRequest;

export interface ImageProviderGenerateInput {
  sceneType: Extract<ImageSceneType, "character" | "novel_cover">;
  provider: LLMProvider;
  model: string;
  prompt: string;
  negativePrompt?: string;
  size: ImageSize;
  count: number;
  seed?: number;
  quality?: ImageQuality;
  background?: ImageBackground;
  outputFormat?: ImageOutputFormat;
  outputCompression?: number;
  moderation?: ImageModerationLevel;
}

export interface GeneratedImage {
  url: string;
  mimeType?: string;
  width?: number;
  height?: number;
  seed?: number;
  metadata?: Record<string, unknown>;
}

export interface ImageProviderGenerateResult {
  provider: LLMProvider;
  model: string;
  images: GeneratedImage[];
}
