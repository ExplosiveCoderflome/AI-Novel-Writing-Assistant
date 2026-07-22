import i18next from "i18next";
﻿import type { NovelAutoDirectorTaskSummary } from "@ai-novel/shared/types/novel";
import type { NovelWorkflowCheckpoint } from "@ai-novel/shared/types/novelWorkflow";
import type { TaskStatus } from "@ai-novel/shared/types/task";

export type WorkflowBadgeVariant = "default" | "outline" | "secondary" | "destructive";

type WorkflowTaskLike = {
  id: string;
  status: TaskStatus;
  checkpointType?: NovelWorkflowCheckpoint | null;
  executionScopeLabel?: string | null;
  pendingManualRecovery?: boolean | null;
};

export const LIVE_TASK_STATUSES = new Set<TaskStatus>(["queued", "running", "waiting_approval"]);
export const BACKGROUND_RUNNING_TASK_STATUSES = new Set<TaskStatus>(["running"]);

function getExecutionScopeLabel(scopeLabel?: string | null, fallback = i18next.t("gen.lib.novelWorkflowTaskUi.gen_fe4033ac")): string {
  return scopeLabel?.trim() || fallback;
}

function buildAutoExecutionRunningLabel(scopeLabel?: string | null): string {
  return `${getExecutionScopeLabel(scopeLabel)}自动执行中`;
}

function buildAutoExecutionPausedLabel(scopeLabel?: string | null): string {
  return `${getExecutionScopeLabel(scopeLabel)}自动执行已暂停`;
}

function buildAutoExecutionCancelledLabel(scopeLabel?: string | null): string {
  return `${getExecutionScopeLabel(scopeLabel)}自动执行已取消`;
}

export function formatWorkflowCheckpoint(checkpoint?: NovelWorkflowCheckpoint | null, scopeLabel?: string | null): string {
  if (checkpoint === "candidate_selection_required") {
    return i18next.t("gen.lib.novelWorkflowTaskUi.gen_dbc67929");
  }
  if (checkpoint === "book_contract_ready") {
    return i18next.t("gen.lib.novelWorkflowTaskUi.gen_BookContra_ppep");
  }
  if (checkpoint === "character_setup_required") {
    return i18next.t("gen.lib.novelWorkflowTaskUi.gen_67358797");
  }
  if (checkpoint === "volume_strategy_ready") {
    return i18next.t("gen.lib.novelWorkflowTaskUi.gen_1172d3de");
  }
  if (checkpoint === "chapter_batch_ready") {
    return buildAutoExecutionPausedLabel(scopeLabel);
  }
  if (checkpoint === "replan_required") {
    return i18next.t("gen.lib.novelWorkflowTaskUi.gen_930a7919");
  }
  if (checkpoint === "workflow_completed") {
    return i18next.t("gen.lib.novelWorkflowTaskUi.gen_ccb5c92e");
  }
  return i18next.t("gen.lib.novelWorkflowTaskUi.gen_1772aede");
}

export function getWorkflowBadge(task?: NovelAutoDirectorTaskSummary | null): {
  label: string;
  variant: WorkflowBadgeVariant;
} | null {
  if (!task) {
    return null;
  }
  const displayStatus = task.displayStatus?.trim() || null;
  if (
    (task.status === "queued" || task.status === "running")
    && task.checkpointType === "chapter_batch_ready"
  ) {
    return {
      label: displayStatus ?? buildAutoExecutionRunningLabel(task.executionScopeLabel),
      variant: "default",
    };
  }
  if ((task.status === "failed" || task.status === "cancelled") && task.checkpointType === "chapter_batch_ready") {
    return {
      label: displayStatus ?? (task.status === "failed"
        ? buildAutoExecutionPausedLabel(task.executionScopeLabel)
        : buildAutoExecutionCancelledLabel(task.executionScopeLabel)),
      variant: task.status === "failed" ? "destructive" : "outline",
    };
  }
  if (task.status === "waiting_approval") {
    return {
      label: displayStatus ?? formatWorkflowCheckpoint(task.checkpointType, task.executionScopeLabel),
      variant: "secondary",
    };
  }
  if (task.status === "running") {
    return {
      label: displayStatus ?? i18next.t("gen.lib.novelWorkflowTaskUi.gen_ce6c5058"),
      variant: "default",
    };
  }
  if (task.status === "queued") {
    return {
      label: displayStatus ?? i18next.t("gen.lib.novelWorkflowTaskUi.gen_c26287bc"),
      variant: "secondary",
    };
  }
  if (task.status === "failed") {
    return {
      label: displayStatus ?? i18next.t("gen.lib.novelWorkflowTaskUi.gen_8a03db74"),
      variant: "destructive",
    };
  }
  if (task.status === "cancelled") {
    return {
      label: displayStatus ?? i18next.t("gen.lib.novelWorkflowTaskUi.gen_6f6440f0"),
      variant: "outline",
    };
  }
  return {
    label: displayStatus ?? (task.checkpointType === "workflow_completed"
      ? i18next.t("gen.lib.novelWorkflowTaskUi.gen_ccb5c92e")
      : formatWorkflowCheckpoint(task.checkpointType, task.executionScopeLabel)),
    variant: "outline",
  };
}

export function getWorkflowDescription(task?: NovelAutoDirectorTaskSummary | null): string | null {
  if (!task) {
    return null;
  }
  if (
    (task.status === "queued" || task.status === "running")
    && task.checkpointType === "chapter_batch_ready"
  ) {
    return `AI 正在后台继续执行${getExecutionScopeLabel(task.executionScopeLabel)}，当前进度 ${Math.round(task.progress * 100)}%。`;
  }
  if ((task.status === "failed" || task.status === "cancelled") && task.checkpointType === "chapter_batch_ready") {
    return `${getExecutionScopeLabel(task.executionScopeLabel)}自动执行在批量阶段暂停了，建议先查看任务，再决定是否继续自动执行。`;
  }
  if (task.blockingReason?.trim()) {
    return task.blockingReason.trim();
  }
  if (task.checkpointSummary?.trim()) {
    return task.checkpointSummary.trim();
  }
  if (task.currentItemLabel?.trim()) {
    return task.currentItemLabel.trim();
  }
  if (task.resumeAction?.trim()) {
    return `推荐继续：${task.resumeAction.trim()}`;
  }
  if (task.nextActionLabel?.trim()) {
    return `下一步：${task.nextActionLabel.trim()}`;
  }
  return null;
}

export function canContinueDirector(task?: NovelAutoDirectorTaskSummary | null): boolean {
  return Boolean(
    task
      && task.status === "waiting_approval"
      && task.checkpointType !== "candidate_selection_required"
      && task.checkpointType !== "chapter_batch_ready",
  );
}

export function canCancelDirectorTask(
  task?: Pick<WorkflowTaskLike, "status" | "pendingManualRecovery"> | null,
): boolean {
  if (!task) {
    return false;
  }
  if (task.pendingManualRecovery) {
    return true;
  }
  return task.status === "queued"
    || task.status === "running"
    || task.status === "waiting_approval"
    || task.status === "failed";
}

export function requiresCandidateSelection(task?: Pick<WorkflowTaskLike, "status" | "checkpointType"> | null): boolean {
  return Boolean(task && task.status === "waiting_approval" && task.checkpointType === "candidate_selection_required");
}

export function canContinueChapterBatchAutoExecution(task?: NovelAutoDirectorTaskSummary | null): boolean {
  if (!task) {
    return false;
  }
  return (task.status === "failed" || task.status === "cancelled") && task.checkpointType === "chapter_batch_ready";
}

export function canEnterChapterExecution(task?: NovelAutoDirectorTaskSummary | null): boolean {
  return Boolean(
    task
      && (task.checkpointType === "chapter_batch_ready"
        || task.checkpointType === "workflow_completed"),
  );
}

export function isLiveWorkflowTask(task?: NovelAutoDirectorTaskSummary | null): boolean {
  return Boolean(task && LIVE_TASK_STATUSES.has(task.status));
}

export function isWorkflowRunningInBackground(task?: NovelAutoDirectorTaskSummary | null): boolean {
  return Boolean(task && BACKGROUND_RUNNING_TASK_STATUSES.has(task.status));
}

export function isWorkflowActionRequired(task?: NovelAutoDirectorTaskSummary | null): boolean {
  return Boolean(
    task
      && (task.status === "waiting_approval"
        || task.status === "failed"
        || task.status === "cancelled"),
  );
}

export function getTaskCenterLink(taskId: string): string {
  return `/tasks?kind=novel_workflow&id=${taskId}`;
}

export function getCandidateSelectionLink(taskId: string): string {
  const searchParams = new URLSearchParams();
  searchParams.set("taskId", taskId);
  return `/novels/auto-director?${searchParams.toString()}`;
}
