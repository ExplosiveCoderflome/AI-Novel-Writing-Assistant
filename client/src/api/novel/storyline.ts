import type { ApiResponse } from "@ai-novel/shared/types/api";
import type {
  StorylineDiff,
  StorylineVersion,
} from "@ai-novel/shared/types/novel";
import { apiClient } from "../client";

export async function listStorylineVersions(id: string) {
  const { data } = await apiClient.get<ApiResponse<StorylineVersion[]>>(`/novels/${id}/storyline/versions`);
  return data;
}

export async function createStorylineDraft(
  id: string,
  payload: {
    content: string;
    diffSummary?: string;
    baseVersion?: number;
  },
) {
  const { data } = await apiClient.post<ApiResponse<StorylineVersion>>(`/novels/${id}/storyline/versions/draft`, payload);
  return data;
}

export async function activateStorylineVersion(id: string, versionId: string) {
  const { data } = await apiClient.post<ApiResponse<StorylineVersion>>(
    `/novels/${id}/storyline/versions/${versionId}/activate`,
    {},
  );
  return data;
}

export async function freezeStorylineVersion(id: string, versionId: string) {
  const { data } = await apiClient.post<ApiResponse<StorylineVersion>>(
    `/novels/${id}/storyline/versions/${versionId}/freeze`,
    {},
  );
  return data;
}

export async function getStorylineDiff(id: string, versionId: string, compareVersion?: number) {
  const { data } = await apiClient.get<ApiResponse<StorylineDiff>>(
    `/novels/${id}/storyline/versions/${versionId}/diff`,
    {
      params: { compareVersion },
    },
  );
  return data;
}

export async function analyzeStorylineImpact(
  id: string,
  payload: {
    content?: string;
    versionId?: string;
  },
) {
  const { data } = await apiClient.post<
    ApiResponse<{
      novelId: string;
      sourceVersion: number | null;
      affectedCharacters: number;
      affectedChapters: number;
      changedLines: number;
      requiresOutlineRebuild: boolean;
      recommendations: {
        shouldSyncOutline: boolean;
        shouldRecheckCharacters: boolean;
        suggestedStrategy: "rebuild_outline" | "incremental_sync";
      };
    }>
  >(`/novels/${id}/storyline/impact-analysis`, payload);
  return data;
}
