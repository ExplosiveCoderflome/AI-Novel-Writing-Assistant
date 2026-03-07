import type { ApiResponse } from "@ai-novel/shared/types/api";
import type { ImageAsset, ImageGenerationTask } from "@ai-novel/shared/types/image";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { apiClient } from "./client";

export interface GenerateCharacterImagePayload {
  sceneType: "character";
  sceneId: string;
  prompt: string;
  negativePrompt?: string;
  stylePreset?: string;
  provider?: LLMProvider;
  model?: string;
  size?: "512x512" | "768x768" | "1024x1024" | "1024x1536" | "1536x1024";
  count?: number;
  seed?: number;
  maxRetries?: number;
}

export async function generateCharacterImages(payload: GenerateCharacterImagePayload) {
  const { data } = await apiClient.post<ApiResponse<ImageGenerationTask>>("/images/generate", payload);
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
