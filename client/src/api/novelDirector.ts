import type { ApiResponse } from "@ai-novel/shared/types/api";
import type {
  DirectorBookAutomationProjectionResponse,
  DirectorCommandResultResponse,
  DirectorRuntimePolicyUpdateRequest,
  DirectorRuntimeEventHistoryResponse,
  DirectorRuntimeProjection,
  DirectorRuntimeSnapshotResponse,
  DirectorCommandAcceptedResponse,
  DirectorManualEditImpactResponse,
  DirectorTaskSnapshotResponse,
  DirectorWorkspaceAnalysisResponse,
} from "@ai-novel/shared/types/directorRuntime";
import type {
  DirectorCandidatePatchRequest,
  DirectorCandidateTitleRefineRequest,
  DirectorCandidatesRequest,
  DirectorConfirmRequest,
  DirectorRefinementRequest,
  DirectorTakeoverReadinessResponse,
  DirectorTakeoverRequest,
} from "@ai-novel/shared/types/novelDirector";
import { apiClient } from "./client";

async function getDirectorTaskSnapshot(taskId: string) {
  const { data } = await apiClient.get<ApiResponse<DirectorTaskSnapshotResponse>>(`/novels/director/tasks/${taskId}`);
  return data;
}

export async function generateDirectorCandidates(payload: DirectorCandidatesRequest): Promise<ApiResponse<DirectorCommandAcceptedResponse>> {
  const { data } = await apiClient.post<ApiResponse<DirectorCommandAcceptedResponse>>("/novels/director/tasks", {
    taskType: "generate_candidates",
    payload,
  });
  return data;
}

export async function refineDirectorCandidates(payload: DirectorRefinementRequest): Promise<ApiResponse<DirectorCommandAcceptedResponse>> {
  const taskId = payload.workflowTaskId?.trim();
  if (!taskId) {
    throw new Error("Refine candidates requires an existing workflowTaskId.");
  }
  const { data } = await apiClient.post<ApiResponse<DirectorCommandAcceptedResponse>>(`/novels/director/tasks/${taskId}/commands`, {
    commandType: "refine_candidates",
    payload,
  });
  return data;
}

export async function patchDirectorCandidate(payload: DirectorCandidatePatchRequest): Promise<ApiResponse<DirectorCommandAcceptedResponse>> {
  const taskId = payload.workflowTaskId?.trim();
  if (!taskId) {
    throw new Error("Patch candidate requires an existing workflowTaskId.");
  }
  const { data } = await apiClient.post<ApiResponse<DirectorCommandAcceptedResponse>>(`/novels/director/tasks/${taskId}/commands`, {
    commandType: "patch_candidate",
    payload,
  });
  return data;
}

export async function refineDirectorCandidateTitles(payload: DirectorCandidateTitleRefineRequest): Promise<ApiResponse<DirectorCommandAcceptedResponse>> {
  const taskId = payload.workflowTaskId?.trim();
  if (!taskId) {
    throw new Error("Refine titles requires an existing workflowTaskId.");
  }
  const { data } = await apiClient.post<ApiResponse<DirectorCommandAcceptedResponse>>(`/novels/director/tasks/${taskId}/commands`, {
    commandType: "refine_titles",
    payload,
  });
  return data;
}

export async function confirmDirectorCandidate(payload: DirectorConfirmRequest) {
  const taskId = payload.workflowTaskId?.trim();
  if (!taskId) {
    throw new Error("Confirm candidate requires an existing workflowTaskId.");
  }
  const { data } = await apiClient.post<ApiResponse<DirectorCommandAcceptedResponse>>(`/novels/director/tasks/${taskId}/commands`, {
    commandType: "confirm_candidate",
    payload,
  });
  return data;
}

export async function getDirectorCommandResult<T = unknown>(commandId: string) {
  const { data } = await apiClient.get<ApiResponse<DirectorCommandResultResponse<T>>>(
    `/novels/director/commands/${commandId}/result`,
  );
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
  const { data } = await apiClient.post<ApiResponse<DirectorCommandAcceptedResponse>>("/novels/director/tasks", {
    taskType: "takeover",
    payload,
  });
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
  const snapshot = await getDirectorTaskSnapshot(taskId);
  return {
    ...snapshot,
    data: {
      snapshot: snapshot.data?.snapshot?.runtime ?? null,
      projection: snapshot.data?.snapshot?.projection ?? null,
    } satisfies DirectorRuntimeSnapshotResponse,
  };
}

export async function getDirectorRuntimeProjection(taskId: string) {
  const snapshot = await getDirectorTaskSnapshot(taskId);
  return {
    ...snapshot,
    data: {
      projection: snapshot.data?.snapshot?.projection ?? null,
    } satisfies { projection: DirectorRuntimeProjection | null },
  };
}

export async function getDirectorRuntimeEventHistory(taskId: string, options?: { limit?: number }) {
  const snapshot = await getDirectorTaskSnapshot(taskId);
  const events = snapshot.data?.snapshot?.recentEvents ?? [];
  const limit = options?.limit ?? events.length;
  return {
    ...snapshot,
    data: {
      events: events.slice(-limit),
      totalCount: events.length,
      limit,
    } satisfies DirectorRuntimeEventHistoryResponse,
  };
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
    `/novels/director/tasks/${taskId}/commands`,
    {
      commandType: "policy_update",
      payload,
    },
  );
  return data;
}

export async function approveDirectorGate(taskId: string): Promise<ApiResponse<DirectorCommandAcceptedResponse>> {
  const { data } = await apiClient.post<ApiResponse<DirectorCommandAcceptedResponse>>(
    `/novels/director/tasks/${taskId}/commands`,
    { commandType: "approve_gate", payload: {} },
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
    `/novels/director/tasks/${taskId}/commands`,
    {
      commandType: "continue",
      payload: payload ?? {},
    },
  );
  return data;
}
