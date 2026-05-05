import type { ApiResponse } from "@ai-novel/shared/types/api";
import type {
  DirectorBookAutomationProjectionResponse,
  DirectorRuntimePolicyUpdateRequest,
  DirectorRuntimeEventHistoryResponse,
  DirectorRuntimeProjection,
  DirectorRuntimeSnapshotResponse,
  DirectorCommandAcceptedResponse,
  DirectorCommandResultResponse,
  DirectorManualEditImpactResponse,
  DirectorWorkspaceAnalysisResponse,
} from "@ai-novel/shared/types/directorRuntime";
import type {
  DirectorCandidatePatchRequest,
  DirectorCandidatePatchResponse,
  DirectorCandidateTitleRefineRequest,
  DirectorCandidateTitleRefineResponse,
  DirectorCandidatesRequest,
  DirectorCandidatesResponse,
  DirectorConfirmRequest,
  DirectorRefineResponse,
  DirectorRefinementRequest,
  DirectorTakeoverReadinessResponse,
  DirectorTakeoverRequest,
} from "@ai-novel/shared/types/novelDirector";
import { apiClient } from "./client";

export async function generateDirectorCandidates(payload: DirectorCandidatesRequest): Promise<ApiResponse<DirectorCommandAcceptedResponse>> {
  const { data } = await apiClient.post<ApiResponse<DirectorCommandAcceptedResponse>>("/novels/director/candidates", payload);
  return data;
}

export async function refineDirectorCandidates(payload: DirectorRefinementRequest): Promise<ApiResponse<DirectorCommandAcceptedResponse>> {
  const { data } = await apiClient.post<ApiResponse<DirectorCommandAcceptedResponse>>("/novels/director/refine", payload);
  return data;
}

export async function patchDirectorCandidate(payload: DirectorCandidatePatchRequest): Promise<ApiResponse<DirectorCommandAcceptedResponse>> {
  const { data } = await apiClient.post<ApiResponse<DirectorCommandAcceptedResponse>>("/novels/director/patch-candidate", payload);
  return data;
}

export async function refineDirectorCandidateTitles(payload: DirectorCandidateTitleRefineRequest): Promise<ApiResponse<DirectorCommandAcceptedResponse>> {
  const { data } = await apiClient.post<ApiResponse<DirectorCommandAcceptedResponse>>("/novels/director/refine-titles", payload);
  return data;
}

export async function getDirectorCommandResult<T = unknown>(commandId: string) {
  const { data } = await apiClient.get<ApiResponse<DirectorCommandResultResponse<T>>>(
    `/novels/director/commands/${commandId}/result`,
  );
  return data;
}

export async function confirmDirectorCandidate(payload: DirectorConfirmRequest) {
  const { data } = await apiClient.post<ApiResponse<DirectorCommandAcceptedResponse>>("/novels/director/confirm", payload);
  return data;
}

export async function getDirectorTakeoverReadiness(novelId: string) {
  const { data } = await apiClient.get<ApiResponse<DirectorTakeoverReadinessResponse>>(`/novels/director/takeover-readiness/${novelId}`);
  return data;
}

export async function getDirectorBookAutomationProjection(novelId: string) {
  const { data } = await apiClient.get<ApiResponse<DirectorBookAutomationProjectionResponse>>(
    `/novels/director/book-automation/${novelId}`,
  );
  return data;
}

export async function startDirectorTakeover(payload: DirectorTakeoverRequest) {
  const { data } = await apiClient.post<ApiResponse<DirectorCommandAcceptedResponse>>("/novels/director/takeover", payload);
  return data;
}

export async function getDirectorWorkspaceAnalysis(
  novelId: string,
  options?: {
    workflowTaskId?: string;
    ai?: boolean;
  },
) {
  const { data } = await apiClient.get<ApiResponse<DirectorWorkspaceAnalysisResponse>>(
    `/novels/director/workspace-analysis/${novelId}`,
    {
      params: {
        workflowTaskId: options?.workflowTaskId,
        ai: typeof options?.ai === "boolean" ? String(options.ai) : undefined,
      },
    },
  );
  return data;
}

export async function getDirectorRuntimeSnapshot(taskId: string) {
  const { data } = await apiClient.get<ApiResponse<DirectorRuntimeSnapshotResponse>>(`/novels/director/runtime/${taskId}`);
  return data;
}

export async function getDirectorRuntimeProjection(taskId: string) {
  const { data } = await apiClient.get<ApiResponse<{ projection: DirectorRuntimeProjection | null }>>(
    `/novels/director/runtime/${taskId}/projection`,
  );
  return data;
}

export async function getDirectorRuntimeEventHistory(taskId: string, options?: { limit?: number }) {
  const { data } = await apiClient.get<ApiResponse<DirectorRuntimeEventHistoryResponse>>(
    `/novels/director/runtime/${taskId}/events`,
    { params: { limit: options?.limit } },
  );
  return data;
}

export async function getDirectorManualEditImpact(
  novelId: string,
  options?: {
    workflowTaskId?: string;
    chapterId?: string;
    ai?: boolean;
  },
) {
  const { data } = await apiClient.get<ApiResponse<DirectorManualEditImpactResponse>>(
    `/novels/director/manual-edit-impact/${novelId}`,
    {
      params: {
        workflowTaskId: options?.workflowTaskId,
        chapterId: options?.chapterId,
        ai: typeof options?.ai === "boolean" ? String(options.ai) : undefined,
      },
    },
  );
  return data;
}

export async function updateDirectorRuntimePolicy(
  taskId: string,
  payload: DirectorRuntimePolicyUpdateRequest,
): Promise<ApiResponse<DirectorCommandAcceptedResponse>> {
  const { data } = await apiClient.post<ApiResponse<DirectorCommandAcceptedResponse>>(
    `/novels/director/runtime/${taskId}/policy`,
    payload,
  );
  return data;
}

export async function approveDirectorGate(taskId: string): Promise<ApiResponse<DirectorCommandAcceptedResponse>> {
  const { data } = await apiClient.post<ApiResponse<DirectorCommandAcceptedResponse>>(
    `/novels/director/runtime/${taskId}/continue`,
    { continuationMode: "resume" },
  );
  return data;
}

export async function continueDirectorRuntime(
  taskId: string,
  payload?: Partial<DirectorRuntimePolicyUpdateRequest> & {
    continuationMode?: "resume" | "auto_execute_range" | "auto_execute_front10";
    batchAlreadyStartedCount?: number;
  },
) {
  const { data } = await apiClient.post<ApiResponse<DirectorCommandAcceptedResponse>>(
    `/novels/director/runtime/${taskId}/continue`,
    payload ?? {},
  );
  return data;
}
