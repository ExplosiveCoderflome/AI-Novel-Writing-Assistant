import type {
  DirectorBookAutomationProjection,
  DirectorBookAutomationStatus,
} from "@ai-novel/shared/types/directorRuntime";
import type { TaskStatus, UnifiedTaskDetail } from "@ai-novel/shared/types/task";
import type { NovelEditTakeoverState } from "./components/NovelEditView.types";

function projectionMatchesTask(
  projection: DirectorBookAutomationProjection | null | undefined,
  task: UnifiedTaskDetail | null | undefined,
): projection is DirectorBookAutomationProjection {
  return Boolean(projection && task && projection.latestTask?.id === task.id);
}

function projectionMessage(projection: DirectorBookAutomationProjection): string | null {
  return projection.blockedReason?.trim()
    || projection.detail?.trim()
    || projection.currentLabel?.trim()
    || projection.headline?.trim()
    || null;
}

function taskStatusFromProjection(status: DirectorBookAutomationStatus): TaskStatus | null {
  if (status === "queued") return "queued";
  if (status === "running") return "running";
  if (status === "waiting_approval") return "waiting_approval";
  if (status === "failed" || status === "blocked") return "failed";
  if (status === "cancelled") return "cancelled";
  if (status === "completed") return "succeeded";
  if (status === "waiting_recovery") return "queued";
  return null;
}

function isTerminalWorkflowTaskStatus(status: string | null | undefined): boolean {
  return status === "failed" || status === "cancelled" || status === "succeeded";
}

export function shouldPreserveRequestedDirectorTaskId(input: {
  directorTaskId: string | null | undefined;
  requestedTask: Pick<UnifiedTaskDetail, "id" | "status"> | null | undefined;
}): boolean {
  const pinnedTaskId = input.directorTaskId?.trim() || "";
  if (!pinnedTaskId || !input.requestedTask) {
    return false;
  }
  if (input.requestedTask.id !== pinnedTaskId) {
    return false;
  }
  return input.requestedTask.status !== "cancelled";
}

export function shouldShowPinnedBookAutomationProjection(input: {
  projection: {
    status: DirectorBookAutomationProjection["status"];
    latestTask?: { id?: string | null } | null;
  } | null | undefined;
  directorTaskId: string | null | undefined;
}): boolean {
  const pinnedTaskId = input.directorTaskId?.trim() || "";
  if (!pinnedTaskId || !input.projection?.latestTask?.id) {
    return false;
  }
  if (input.projection.latestTask.id !== pinnedTaskId) {
    return false;
  }
  return input.projection.status === "failed"
    || input.projection.status === "completed"
    || input.projection.status === "cancelled";
}

export function shouldAutofocusProjectedDirectorTask(
  projection: DirectorBookAutomationProjection | null | undefined,
): boolean {
  if (!projection?.latestTask?.id) {
    return false;
  }
  if (
    projection.status === "failed"
    || projection.status === "blocked"
    || projection.status === "waiting_recovery"
  ) {
    return true;
  }
  if (isTerminalWorkflowTaskStatus(projection.latestTask?.status ?? null)) {
    return false;
  }
  return projection.status === "queued"
    || projection.status === "running"
    || projection.status === "waiting_approval";
}

export function resolveTakeoverDialogContextTaskId(input: {
  directorTaskId?: string | null;
  activeAutoDirectorTask?: Pick<UnifiedTaskDetail, "id"> | null;
  projection?: DirectorBookAutomationProjection | null;
}): string {
  const pinnedDirectorTaskId = input.directorTaskId?.trim() || "";
  if (pinnedDirectorTaskId) {
    return pinnedDirectorTaskId;
  }
  const activeTaskId = input.activeAutoDirectorTask?.id?.trim() || "";
  if (activeTaskId) {
    return activeTaskId;
  }
  if (shouldAutofocusProjectedDirectorTask(input.projection)) {
    return input.projection?.latestTask?.id?.trim() || "";
  }
  return "";
}

export function buildDisplayAutoDirectorTask(
  task: UnifiedTaskDetail | null,
  projection: DirectorBookAutomationProjection | null | undefined,
): UnifiedTaskDetail | null {
  if (task?.status === "cancelled") {
    return task;
  }
  if (!task || !projectionMatchesTask(projection, task)) {
    return task;
  }
  if (isTerminalWorkflowTaskStatus(task.status) && projection.status !== "failed" && projection.status !== "blocked") {
    return task;
  }
  const projectedStatus = taskStatusFromProjection(projection.status);
  if (!projectedStatus) {
    return task;
  }
  const isLiveTask = task.status === "queued" || task.status === "running";
  if (isLiveTask && projectedStatus === "succeeded") {
    return {
      ...task,
      displayStatus: projection.status,
    };
  }
  const message = projectionMessage(projection);
  const pendingManualRecovery = projection.status === "waiting_recovery"
    ? true
    : task.pendingManualRecovery;

  return {
    ...task,
    status: projectedStatus,
    pendingManualRecovery,
    currentItemLabel: projection.currentLabel?.trim() || task.currentItemLabel,
    displayStatus: projection.status,
    blockingReason: projection.requiresUserAction
      ? message ?? task.blockingReason
      : task.blockingReason,
    lastError: projectedStatus === "failed"
      ? message ?? task.lastError
      : task.lastError,
    failureSummary: projectedStatus === "failed"
      ? message ?? task.failureSummary
      : task.failureSummary,
  };
}

export function canArchiveCompletedAutoDirectorTask(
  task?: Pick<UnifiedTaskDetail, "status" | "checkpointType"> | null,
): boolean {
  return Boolean(
    task
      && task.status === "succeeded"
      && task.checkpointType === "workflow_completed",
  );
}

export function resolveTakeoverModeFromAutomation(input: {
  task: UnifiedTaskDetail;
  projection: DirectorBookAutomationProjection | null | undefined;
}): NovelEditTakeoverState["mode"] {
  const { task, projection } = input;
  if (task.status === "waiting_approval" && task.checkpointType === "replan_required") {
    return "action_required";
  }
  if (projectionMatchesTask(projection, task)) {
    if (projection.status === "failed") return "failed";
    if (projection.status === "blocked") return "action_required";
    if (projection.status === "waiting_recovery") return "waiting";
    if (projection.status === "waiting_approval") return "waiting";
    if (projection.status === "queued" || projection.status === "running") return "running";
  }
  if (task.pendingManualRecovery) {
    return "waiting";
  }
  if (task.status === "failed" || task.status === "cancelled") {
    return "failed";
  }
  if (task.status === "queued" || task.status === "running") {
    return "running";
  }
  return "waiting";
}

export function resolveAutomationActionText(input: {
  task: UnifiedTaskDetail;
  projection: DirectorBookAutomationProjection | null | undefined;
}): string | null {
  const { task, projection } = input;
  if (!projectionMatchesTask(projection, task)) {
    return null;
  }
  if (projection.status === "failed" || projection.status === "blocked" || projection.status === "waiting_recovery") {
    return projectionMessage(projection);
  }
  return projection.currentLabel?.trim() || null;
}
