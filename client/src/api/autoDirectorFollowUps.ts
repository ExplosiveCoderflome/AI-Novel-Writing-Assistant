import type { ApiResponse } from "@ai-novel/shared/types/api";
import type {
  AutoDirectorActionExecutionResult,
  AutoDirectorBatchActionExecutionResult,
  AutoDirectorFollowUpDetail,
  AutoDirectorFollowUpListInput,
  AutoDirectorFollowUpListResponse,
  AutoDirectorFollowUpOverview,
  AutoDirectorMutationActionCode,
} from "@ai-novel/shared/types/autoDirectorFollowUp";
import type { ApiHttpError } from "./client";
import { apiClient } from "./client";

export async function getAutoDirectorFollowUpOverview() {
  const { data } = await apiClient.get<ApiResponse<AutoDirectorFollowUpOverview>>("/auto-director/follow-ups/overview");
  return data;
}

export async function listAutoDirectorFollowUps(params?: AutoDirectorFollowUpListInput) {
  const { data } = await apiClient.get<ApiResponse<AutoDirectorFollowUpListResponse>>("/auto-director/follow-ups", {
    params,
  });
  return data;
}

export async function getAutoDirectorFollowUpDetail(taskId: string) {
  try {
    const { data } = await apiClient.get<ApiResponse<AutoDirectorFollowUpDetail | null>>(
      `/auto-director/follow-ups/${taskId}`,
      {
        silentErrorStatuses: [404],
      },
    );
    return data;
  } catch (error) {
    const httpError = error as ApiHttpError;
    if (httpError.status === 404) {
      return {
        success: true,
        data: null,
        message: "Follow-up not found.",
      } satisfies ApiResponse<AutoDirectorFollowUpDetail | null>;
    }
    throw error;
  }
}

export async function executeAutoDirectorFollowUpAction(
  taskId: string,
  input: {
    actionCode: AutoDirectorMutationActionCode;
    idempotencyKey: string;
  },
) {
  const { data } = await apiClient.post<ApiResponse<AutoDirectorActionExecutionResult>>(
    `/auto-director/follow-ups/${taskId}/actions`,
    input,
  );
  return data;
}

export async function executeAutoDirectorFollowUpBatchAction(input: {
  actionCode: Extract<AutoDirectorMutationActionCode, "continue_auto_execution" | "retry_with_task_model">;
  taskIds: string[];
  batchRequestKey: string;
}) {
  const { data } = await apiClient.post<ApiResponse<AutoDirectorBatchActionExecutionResult>>(
    "/auto-director/follow-ups/batch-actions",
    input,
  );
  return data;
}
