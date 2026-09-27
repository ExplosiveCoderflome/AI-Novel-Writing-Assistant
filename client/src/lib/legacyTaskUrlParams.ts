const LEGACY_TASK_KEYS = ["directorTaskId", "workspaceTaskId", "taskId"] as const;

export function stripLegacyTaskUrlParams(searchParams: URLSearchParams): URLSearchParams {
  const cleaned = new URLSearchParams(searchParams);
  for (const key of LEGACY_TASK_KEYS) {
    cleaned.delete(key);
  }
  return cleaned;
}

export function readCandidateTaskId(searchParams: URLSearchParams): string | null {
  return searchParams.get("taskId");
}

export function readLegacyDirectorTaskId(searchParams: URLSearchParams): string | null {
  return searchParams.get("directorTaskId") || searchParams.get("taskId");
}

export function buildCandidateTaskHref(taskId: string, otherParams?: URLSearchParams): string {
  const searchParams = new URLSearchParams(otherParams);
  searchParams.set("taskId", taskId);
  return `/novels/auto-director?${searchParams.toString()}`;
}
