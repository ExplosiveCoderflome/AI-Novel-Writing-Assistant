const LEGACY_TASK_KEYS = ["directorTaskId", "workspaceTaskId", "taskId"] as const;

export function stripLegacyTaskUrlParams(searchParams: URLSearchParams): URLSearchParams {
  const cleaned = new URLSearchParams(searchParams);
  for (const key of LEGACY_TASK_KEYS) {
    cleaned.delete(key);
  }
  return cleaned;
}
