import type { QueryClient } from "@tanstack/react-query";
import type { ApiResponse } from "@ai-novel/shared/types/api";
import type { UnifiedTaskDetail } from "@ai-novel/shared/types/task";
import { queryKeys } from "@/api/queryKeys";

function mergeTaskResponse(
  previous: ApiResponse<UnifiedTaskDetail | null> | undefined,
  task: UnifiedTaskDetail,
  fallbackMessage: string,
): ApiResponse<UnifiedTaskDetail | null> {
  return {
    success: previous?.success ?? true,
    data: task,
    error: undefined,
    message: previous?.message ?? fallbackMessage,
  };
}

export function syncTaskDetailCache(queryClient: QueryClient, task: UnifiedTaskDetail | null | undefined): void {
  if (!task) {
    return;
  }
  queryClient.setQueryData<ApiResponse<UnifiedTaskDetail | null>>(
    queryKeys.tasks.detail(task.kind, task.id),
    (previous) => mergeTaskResponse(previous, task, "Task detail loaded."),
  );
}

export function syncAutoDirectorTaskCache(
  queryClient: QueryClient,
  novelId: string,
  task: UnifiedTaskDetail | null | undefined,
): void {
  if (!task) {
    return;
  }
  queryClient.setQueryData<ApiResponse<UnifiedTaskDetail | null>>(
    queryKeys.novels.autoDirectorTask(novelId),
    (previous) => mergeTaskResponse(previous, task, "Latest auto director task loaded."),
  );
  syncTaskDetailCache(queryClient, task);
}

export function syncKnownTaskCaches(queryClient: QueryClient, task: UnifiedTaskDetail | null | undefined): void {
  if (!task) {
    return;
  }
  const lane = typeof task.meta?.lane === "string" ? task.meta.lane : null;
  if (task.kind === "novel_workflow" && lane === "auto_director" && task.sourceResource?.type === "novel") {
    syncAutoDirectorTaskCache(queryClient, task.sourceResource.id, task);
    return;
  }
  syncTaskDetailCache(queryClient, task);
}
