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
