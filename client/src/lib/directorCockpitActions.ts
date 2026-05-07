import type {
  DirectorBookAutomationAction,
  DirectorBookAutomationProjection,
} from "@ai-novel/shared/types/directorRuntime";

export function isDirectorCockpitContinuationAction(action: DirectorBookAutomationAction): boolean {
  return action.type === "continue" || action.type === "auto_execute_range";
}

export function getDirectorCockpitContinuationMode(
  action: DirectorBookAutomationAction,
): "resume" | "auto_execute_range" | undefined {
  if (action.type === "auto_execute_range") {
    return "auto_execute_range";
  }
  if (action.type === "continue") {
    return action.commandPayload?.continuationMode ?? "resume";
  }
  return undefined;
}

export function getDirectorCockpitActionHref(
  projection: DirectorBookAutomationProjection,
  action: DirectorBookAutomationAction,
): string {
  if (action.target.href?.trim()) {
    return action.target.href;
  }
  if (action.target.tab) {
    const params = new URLSearchParams();
    params.set("stage", action.target.tab);
    if (action.target.taskId) {
      params.set("taskId", action.target.taskId);
    }
    if (action.type === "open_details") {
      params.set("taskPanel", "1");
    }
    return `/novels/${projection.novelId}/edit?${params.toString()}`;
  }
  if (action.type === "open_details" && action.target.taskId) {
    const params = new URLSearchParams();
    params.set("taskId", action.target.taskId);
    params.set("taskPanel", "1");
    return `/novels/${projection.novelId}/edit?${params.toString()}`;
  }
  return projection.focusNovel.href;
}
