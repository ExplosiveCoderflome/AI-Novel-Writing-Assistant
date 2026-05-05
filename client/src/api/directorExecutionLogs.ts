import type { DirectorExecutionLogListResponse } from "@ai-novel/shared/types/directorExecutionLog";
import { apiClient } from "./client";

export async function getDirectorExecutionLogs(
  taskId: string,
  options?: { limit?: number; offset?: number },
): Promise<DirectorExecutionLogListResponse> {
  const params = new URLSearchParams();
  if (options?.limit != null) params.set("limit", String(options.limit));
  if (options?.offset != null) params.set("offset", String(options.offset));
  const qs = params.toString();
  const url = `/api/tasks/execution-logs/${taskId}${qs ? `?${qs}` : ""}`;
  const response = await apiClient.get(url);
  return response.data.data;
}
