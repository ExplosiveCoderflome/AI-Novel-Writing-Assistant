import type { ApiResponse } from "@ai-novel/shared/types/api";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type {
  VolumeChapterListGenerationMode,
  VolumeImpactResult,
  VolumeGenerationScopeInput,
  VolumePlan,
  VolumePlanDiff,
  VolumePlanDocument,
  VolumePlanVersion,
  VolumeSyncPreview,
} from "@ai-novel/shared/types/novel";
import { apiClient } from "../client";

export async function getNovelVolumeWorkspace(id: string) {
  const { data } = await apiClient.get<ApiResponse<VolumePlanDocument>>(`/novels/${id}/volumes`);
  return data;
}

export async function updateNovelVolumes(
  id: string,
  payload: Partial<VolumePlanDocument> & {
    volumes: VolumePlan[];
  },
) {
  const { data } = await apiClient.put<ApiResponse<VolumePlanDocument>>(`/novels/${id}/volumes`, payload);
  return data;
}

export async function generateNovelVolumes(
  id: string,
  payload?: {
    provider?: LLMProvider;
    model?: string;
    temperature?: number;
    guidance?: string;
    scope?: VolumeGenerationScopeInput;
    generationMode?: VolumeChapterListGenerationMode;
    targetVolumeId?: string;
    targetBeatKey?: string;
    targetChapterId?: string;
    detailMode?: "purpose" | "boundary" | "task_sheet";
    estimatedChapterCount?: number;
    userPreferredVolumeCount?: number;
    respectExistingVolumeCount?: boolean;
    draftVolumes?: VolumePlan[];
    draftWorkspace?: Partial<VolumePlanDocument>;
  },
) {
  const { data } = await apiClient.post<ApiResponse<VolumePlanDocument>>(`/novels/${id}/volumes/generate`, payload ?? {});
  return data;
}

export async function listVolumeVersions(id: string) {
  const { data } = await apiClient.get<ApiResponse<VolumePlanVersion[]>>(`/novels/${id}/volumes/versions`);
  return data;
}

export async function createVolumeDraft(
  id: string,
  payload: Partial<VolumePlanDocument> & {
    volumes?: VolumePlan[];
    diffSummary?: string;
    baseVersion?: number;
  },
) {
  const { data } = await apiClient.post<ApiResponse<VolumePlanVersion>>(`/novels/${id}/volumes/versions/draft`, payload);
  return data;
}

export async function activateVolumeVersion(id: string, versionId: string) {
  const { data } = await apiClient.post<ApiResponse<VolumePlanVersion>>(
    `/novels/${id}/volumes/versions/${versionId}/activate`,
    {},
  );
  return data;
}

export async function freezeVolumeVersion(id: string, versionId: string) {
  const { data } = await apiClient.post<ApiResponse<VolumePlanVersion>>(
    `/novels/${id}/volumes/versions/${versionId}/freeze`,
    {},
  );
  return data;
}

export async function getVolumeDiff(id: string, versionId: string, compareVersion?: number) {
  const { data } = await apiClient.get<ApiResponse<VolumePlanDiff>>(
    `/novels/${id}/volumes/versions/${versionId}/diff`,
    {
      params: { compareVersion },
    },
  );
  return data;
}

export async function analyzeVolumeImpact(
  id: string,
  payload: {
    volumes?: VolumePlan[];
    versionId?: string;
  },
) {
  const { data } = await apiClient.post<ApiResponse<VolumeImpactResult>>(`/novels/${id}/volumes/impact-analysis`, payload);
  return data;
}

export async function syncNovelVolumeChapters(
  id: string,
  payload: {
    volumes: VolumePlan[];
    preserveContent?: boolean;
    applyDeletes?: boolean;
  },
) {
  const { data } = await apiClient.post<ApiResponse<VolumeSyncPreview>>(`/novels/${id}/volumes/sync-chapters`, payload);
  return data;
}

export async function migrateLegacyVolumes(id: string) {
  const { data } = await apiClient.post<ApiResponse<VolumePlanDocument>>(`/novels/${id}/volumes/migrate-legacy`, {});
  return data;
}
