import type { ApiResponse } from "@ai-novel/shared/types/api";
import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type {
  CreativeDecision,
  Novel,
  NovelSnapshot,
  PipelineJob,
  PipelineRepairMode,
  PipelineRunMode,
} from "@ai-novel/shared/types/novel";
import { apiClient } from "../client";

export async function runNovelPipeline(
  id: string,
  payload: {
    startOrder: number;
    endOrder: number;
    maxRetries?: number;
    runMode?: PipelineRunMode;
    autoReview?: boolean;
    autoRepair?: boolean;
    skipCompleted?: boolean;
    qualityThreshold?: number;
    repairMode?: PipelineRepairMode;
    provider?: LLMProvider;
    model?: string;
    temperature?: number;
  },
) {
  const { data } = await apiClient.post<ApiResponse<PipelineJob>>(`/novels/${id}/pipeline/run`, payload);
  return data;
}

export async function getNovelPipelineJob(id: string, jobId: string) {
  const { data } = await apiClient.get<ApiResponse<PipelineJob>>(`/novels/${id}/pipeline/jobs/${jobId}`);
  return data;
}

export async function listNovelSnapshots(id: string) {
  const { data } = await apiClient.get<ApiResponse<NovelSnapshot[]>>(`/novels/${id}/snapshots`);
  return data;
}

export async function createNovelSnapshot(
  id: string,
  payload: { triggerType: "manual" | "auto_milestone" | "before_pipeline"; label?: string },
) {
  const { data } = await apiClient.post<ApiResponse<NovelSnapshot>>(`/novels/${id}/snapshots`, payload);
  return data;
}

export async function restoreNovelSnapshot(id: string, snapshotId: string) {
  const { data } = await apiClient.post<ApiResponse<Novel>>(`/novels/${id}/snapshots/restore`, { snapshotId });
  return data;
}

export async function listCreativeDecisions(id: string) {
  const { data } = await apiClient.get<ApiResponse<CreativeDecision[]>>(`/novels/${id}/creative-decisions`);
  return data;
}

export async function createCreativeDecision(
  id: string,
  payload: Omit<CreativeDecision, "id" | "novelId" | "createdAt" | "updatedAt">,
) {
  const { data } = await apiClient.post<ApiResponse<CreativeDecision>>(`/novels/${id}/creative-decisions`, payload);
  return data;
}

export async function updateCreativeDecision(
  id: string,
  decisionId: string,
  payload: Partial<Omit<CreativeDecision, "id" | "novelId" | "createdAt" | "updatedAt">>,
) {
  const { data } = await apiClient.put<ApiResponse<CreativeDecision>>(
    `/novels/${id}/creative-decisions/${decisionId}`,
    payload,
  );
  return data;
}

export async function deleteCreativeDecision(id: string, decisionId: string) {
  const { data } = await apiClient.delete<ApiResponse<null>>(`/novels/${id}/creative-decisions/${decisionId}`);
  return data;
}

export async function batchInvalidateCreativeDecisions(id: string, decisionIds: string[]) {
  const { data } = await apiClient.post<ApiResponse<{ count: number; expiresAt: number }>>(
    `/novels/${id}/creative-decisions/batch-invalidate`,
    { decisionIds },
  );
  return data;
}
