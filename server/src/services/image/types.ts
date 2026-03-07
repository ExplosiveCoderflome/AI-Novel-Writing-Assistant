import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { ImageSceneType } from "@ai-novel/shared/types/image";

export const IMAGE_SIZES = ["512x512", "768x768", "1024x1024", "1024x1536", "1536x1024"] as const;

export type ImageSize = (typeof IMAGE_SIZES)[number];

export interface ImageGenerationRequest {
  sceneType: Extract<ImageSceneType, "character">;
  baseCharacterId: string;
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

export interface ImageProviderGenerateInput {
  provider: LLMProvider;
  model: string;
  prompt: string;
  negativePrompt?: string;
  size: ImageSize;
  count: number;
  seed?: number;
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
