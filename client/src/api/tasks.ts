import type { ApiResponse } from "@ai-novel/shared/types/api";
import type {
  TaskKind,
  TaskStatus,
  UnifiedTaskDetail,
  UnifiedTaskListResponse,
} from "@ai-novel/shared/types/task";
import type { DirectorLLMOptions } from "@ai-novel/shared/types/novelDirector";
import { apiClient, type ApiHttpError } from "./client";

export async function listTasks(params?: {
  kind?: TaskKind;
  status?: TaskStatus;
  keyword?: string;
  limit?: number;
  cursor?: string;
}) {
  const { data } = await apiClient.get<ApiResponse<UnifiedTaskListResponse>>("/tasks", {
    params,
  });
  return data;
}

export async function getTaskDetail(kind: TaskKind, id: string) {
  try {
    const { data } = await apiClient.get<ApiResponse<UnifiedTaskDetail | null>>(`/tasks/${kind}/${id}`, {
      silentErrorStatuses: [404],
    });
    return data;
  } catch (error) {
    const httpError = error as ApiHttpError;
    if (httpError.status === 404) {
      return {
        success: true,
        data: null,
        message: "Task not found.",
      } satisfies ApiResponse<UnifiedTaskDetail | null>;
    }
    throw error;
  }
}

export async function retryTask(
  kind: TaskKind,
  id: string,
  options?: {
    llmOverride?: Pick<DirectorLLMOptions, "provider" | "model" | "temperature">;
    resume?: boolean;
  },
) {
  const { data } = await apiClient.post<ApiResponse<UnifiedTaskDetail>>(`/tasks/${kind}/${id}/retry`, options ?? {});
  return data;
}

export async function cancelTask(kind: TaskKind, id: string) {
  const { data } = await apiClient.post<ApiResponse<UnifiedTaskDetail>>(`/tasks/${kind}/${id}/cancel`, {});
  return data;
}

export async function archiveTask(kind: TaskKind, id: string) {
  const { data } = await apiClient.post<ApiResponse<UnifiedTaskDetail | null>>(`/tasks/${kind}/${id}/archive`, {});
  return data;
}
