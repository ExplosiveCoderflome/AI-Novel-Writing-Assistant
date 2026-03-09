import type { ApiResponse } from "@ai-novel/shared/types/api";
import type {
  TaskKind,
  TaskStatus,
  UnifiedTaskDetail,
  UnifiedTaskListResponse,
} from "@ai-novel/shared/types/task";
import { apiClient } from "./client";

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
  const { data } = await apiClient.get<ApiResponse<UnifiedTaskDetail>>(`/tasks/${kind}/${id}`);
  return data;
}

export async function retryTask(kind: TaskKind, id: string) {
  const { data } = await apiClient.post<ApiResponse<UnifiedTaskDetail>>(`/tasks/${kind}/${id}/retry`, {});
  return data;
}

export async function cancelTask(kind: TaskKind, id: string) {
  const { data } = await apiClient.post<ApiResponse<UnifiedTaskDetail>>(`/tasks/${kind}/${id}/cancel`, {});
  return data;
}
