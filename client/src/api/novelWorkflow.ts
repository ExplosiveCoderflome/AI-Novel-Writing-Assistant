import type { ApiResponse } from "@ai-novel/shared/types/api";
import type { DirectorCommandAcceptedResponse } from "@ai-novel/shared/types/directorRuntime";
import type { DirectorContinuationMode } from "@ai-novel/shared/types/novelDirector";
import type {
  NovelWorkflowCheckpoint,
  NovelWorkflowStage,
} from "@ai-novel/shared/types/novelWorkflow";
import type { TaskStatus, UnifiedTaskDetail } from "@ai-novel/shared/types/task";
import { apiClient } from "./client";

export async function bootstrapNovelWorkflow(payload: {
  workflowTaskId?: string;
  novelId?: string;
  lane: "manual_create" | "auto_director";
  title?: string;
  seedPayload?: Record<string, unknown>;
}) {
  const { data } = await apiClient.post<ApiResponse<UnifiedTaskDetail | null>>("/novel-workflows/bootstrap", payload);
  return data;
}

export async function continueNovelWorkflow(directorTaskId: string, payload?: {
  continuationMode?: DirectorContinuationMode;
}) {
  const { data } = await apiClient.post<ApiResponse<DirectorCommandAcceptedResponse>>(`/novel-workflows/${directorTaskId}/continue`, payload ?? {});
  return data;
}

export async function repairNovelWorkflowChapterTitles(directorTaskId: string, payload?: {
  volumeId?: string;
}) {
  const { data } = await apiClient.post<ApiResponse<DirectorCommandAcceptedResponse>>(
    `/novel-workflows/${directorTaskId}/repair-chapter-titles`,
    payload ?? {},
  );
  return data;
}

export async function getActiveAutoDirectorTask(novelId: string) {
  const { data } = await apiClient.get<ApiResponse<UnifiedTaskDetail | null>>(`/novel-workflows/novels/${novelId}/auto-director`);
  return data;
}

export async function syncNovelWorkflowStage(payload: {
  novelId: string;
  stage: NovelWorkflowStage;
  itemLabel: string;
  itemKey?: string;
  checkpointType?: NovelWorkflowCheckpoint | null;
  checkpointSummary?: string;
  chapterId?: string;
  volumeId?: string;
  progress?: number;
  status?: TaskStatus;
}) {
  const { data } = await apiClient.post<ApiResponse<UnifiedTaskDetail | null>>("/novel-workflows/sync-stage", payload);
  return data;
}
