import type { ApiResponse } from "@ai-novel/shared/types/api";
import type {
  CreationStudioConfirmRequest,
  CreationStudioInterpretRequest,
  CreationStudioRegenerateRequest,
  CreationStudioTaskProjection,
  DeriveLongFormResponse,
  ShortStoryProjection,
  ShortStoryRevisionImpact,
  ShortStoryRevisionPreviewRequest,
  ShortStorySegmentUpdateRequest,
} from "@ai-novel/shared/types/creationStudio";
import { apiClient } from "./client";

export async function interpretCreationIdea(payload: CreationStudioInterpretRequest) {
  const { data } = await apiClient.post<ApiResponse<CreationStudioTaskProjection>>(
    "/creation-studio/interpret",
    payload,
  );
  return data;
}

export async function getCreationStudioTask(taskId: string) {
  const { data } = await apiClient.get<ApiResponse<CreationStudioTaskProjection>>(
    `/creation-studio/${taskId}`,
  );
  return data;
}

export async function regenerateCreationDirections(taskId: string, payload: CreationStudioRegenerateRequest) {
  const { data } = await apiClient.post<ApiResponse<CreationStudioTaskProjection>>(
    `/creation-studio/${taskId}/regenerate`,
    payload,
  );
  return data;
}

export async function confirmCreationDirection(taskId: string, payload: CreationStudioConfirmRequest) {
  const { data } = await apiClient.post<ApiResponse<{
    taskId: string;
    novelId: string;
    productionTaskId: string;
    narrativeForm: "short_story" | "long_novel";
    resumeRoute: string;
  }>>(`/creation-studio/${taskId}/confirm`, payload);
  return data;
}

export async function getShortStory(novelId: string) {
  const { data } = await apiClient.get<ApiResponse<ShortStoryProjection>>(
    `/novels/${novelId}/short-story`,
  );
  return data;
}

export async function retryShortStoryProduction(novelId: string) {
  const { data } = await apiClient.post<ApiResponse<{ taskId: string }>>(
    `/novels/${novelId}/short-story/retry`,
    {},
  );
  return data;
}

export async function updateShortStorySegment(
  novelId: string,
  segmentId: string,
  payload: ShortStorySegmentUpdateRequest,
) {
  const { data } = await apiClient.put<ApiResponse<{
    id: string;
    content: string;
    version: number;
  }>>(`/novels/${novelId}/short-story/segments/${segmentId}`, payload);
  return data;
}

export async function previewShortStoryRevision(
  novelId: string,
  payload: ShortStoryRevisionPreviewRequest,
) {
  const { data } = await apiClient.post<ApiResponse<ShortStoryRevisionImpact>>(
    `/novels/${novelId}/short-story/revision-preview`,
    payload,
  );
  return data;
}

export async function applyShortStoryRevision(novelId: string, intentVersionId: string) {
  const { data } = await apiClient.post<ApiResponse<{ taskId: string }>>(
    `/novels/${novelId}/short-story/revisions/${intentVersionId}/apply`,
    { confirmed: true },
  );
  return data;
}

export async function deriveShortStoryLongForm(novelId: string) {
  const { data } = await apiClient.post<ApiResponse<DeriveLongFormResponse>>(
    `/novels/${novelId}/short-story/derive-long-form`,
    {},
  );
  return data;
}
