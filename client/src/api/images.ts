import type { ApiResponse } from "@ai-novel/shared/types/api";
import type { ImageAsset, ImageGenerationTask } from "@ai-novel/shared/types/image";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { apiClient } from "./client";
import { API_BASE_URL } from "@/lib/constants";

export type ImagePromptMode = "character_chain" | "direct";
export type ImagePromptOutputLanguage = "zh" | "en";

export interface GenerateCharacterImagePayload {
  sceneType: "character";
  sceneId: string;
  prompt: string;
  promptMode?: ImagePromptMode;
  negativePrompt?: string;
  stylePreset?: string;
  provider?: LLMProvider;
  model?: string;
  size?: "512x512" | "768x768" | "1024x1024" | "1024x1536" | "1536x1024";
  count?: number;
  seed?: number;
  maxRetries?: number;
}

export interface OptimizeCharacterImagePromptPayload {
  sceneType: "character";
  sceneId: string;
  sourcePrompt: string;
  stylePreset?: string;
  outputLanguage?: ImagePromptOutputLanguage;
}

export async function generateCharacterImages(payload: GenerateCharacterImagePayload) {
  const { data } = await apiClient.post<ApiResponse<ImageGenerationTask>>("/images/generate", payload);
  return data;
}

export async function optimizeCharacterImagePrompt(payload: OptimizeCharacterImagePromptPayload) {
  const { data } = await apiClient.post<ApiResponse<{
    prompt: string;
    outputLanguage: ImagePromptOutputLanguage;
  }>>("/images/optimize-prompt", payload);
  return data;
}

export async function getImageTask(taskId: string) {
  const { data } = await apiClient.get<ApiResponse<ImageGenerationTask>>(`/images/tasks/${taskId}`);
  return data;
}

export async function listImageAssets(params: { sceneType: "character"; sceneId: string }) {
  const { data } = await apiClient.get<ApiResponse<ImageAsset[]>>("/images/assets", {
    params,
  });
  return data;
}

export async function setPrimaryImageAsset(assetId: string) {
  const { data } = await apiClient.post<ApiResponse<ImageAsset>>(`/images/assets/${assetId}/set-primary`);
  return data;
}

export function resolveImageAssetUrl(url: string): string {
  if (!url.trim()) {
    return url;
  }
  if (/^(https?:|data:|blob:)/i.test(url)) {
    return url;
  }
  const apiOrigin = API_BASE_URL.replace(/\/api\/?$/i, "");
  return `${apiOrigin}${url.startsWith("/") ? url : `/${url}`}`;
}
