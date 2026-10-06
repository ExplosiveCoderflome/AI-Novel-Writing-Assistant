import type { DirectorBookAutomationAction } from "@ai-novel/shared/types/directorRuntime";
import type { DirectorContinuationMode } from "@ai-novel/shared/types/novelDirector";

export function isDirectorCockpitContinuationAction(action: DirectorBookAutomationAction): boolean {
  return action.type === "continue" || action.type === "auto_execute_range";
}

export function getDirectorCockpitContinuationMode(
  action: DirectorBookAutomationAction,
): DirectorContinuationMode | undefined {
  if (action.type === "auto_execute_range") {
    return "auto_execute_range";
  }
  if (action.type === "continue") {
    return action.commandPayload?.continuationMode ?? "resume";
  }
  return undefined;
}
