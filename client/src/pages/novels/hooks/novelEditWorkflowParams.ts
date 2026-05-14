export interface NovelEditWorkflowTaskIds {
  directorTaskId: string;
  workspaceTaskId: string;
}

export function readNovelEditWorkflowTaskIds(searchParams: URLSearchParams): NovelEditWorkflowTaskIds {
  return {
    directorTaskId: searchParams.get("directorTaskId") ?? searchParams.get("taskId") ?? "",
    workspaceTaskId: searchParams.get("workspaceTaskId") ?? "",
  };
}

export function withNovelEditWorkspaceTaskId(searchParams: URLSearchParams, taskId: string): URLSearchParams {
  const next = new URLSearchParams(searchParams);
  if (taskId) {
    next.set("workspaceTaskId", taskId);
  } else {
    next.delete("workspaceTaskId");
  }
  return next;
}

export function withNovelEditDirectorTaskId(searchParams: URLSearchParams, taskId: string): URLSearchParams {
  const next = new URLSearchParams(searchParams);
  if (taskId) {
    next.set("directorTaskId", taskId);
  } else {
    next.delete("directorTaskId");
  }
  next.delete("taskId");
  return next;
}
