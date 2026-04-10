import type { NovelAutoDirectorTaskSummary } from "@ai-novel/shared/types/novel";
import type { NovelWorkflowCheckpoint } from "@ai-novel/shared/types/novelWorkflow";
import type { TaskStatus } from "@ai-novel/shared/types/task";

export type WorkflowBadgeVariant = "default" | "outline" | "secondary" | "destructive";

type WorkflowTaskLike = {
  id: string;
  status: TaskStatus;
  checkpointType?: NovelWorkflowCheckpoint | null;
};

export const LIVE_TASK_STATUSES = new Set<TaskStatus>(["queued", "running", "waiting_approval"]);

export function formatWorkflowCheckpoint(checkpoint?: NovelWorkflowCheckpoint | null): string {
  if (checkpoint === "candidate_selection_required") {
    return "等待确认书级方向";
  }
  if (checkpoint === "book_contract_ready") {
    return "Book Contract 已就绪";
  }
  if (checkpoint === "character_setup_required") {
    return "角色准备待审核";
  }
  if (checkpoint === "volume_strategy_ready") {
    return "卷战略待审核";
  }
  if (checkpoint === "front10_ready") {
    return "前 10 章可开写";
  }
  if (checkpoint === "chapter_batch_ready") {
    return "前 10 章自动执行已暂停";
  }
  if (checkpoint === "replan_required") {
    return "等待重规划";
  }
  if (checkpoint === "workflow_completed") {
    return "自动导演已完成";
  }
  return "自动导演";
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
    && (task.checkpointType === "front10_ready" || task.checkpointType === "chapter_batch_ready")
  ) {
    return {
      label: displayStatus ?? "前 10 章自动执行中",
      variant: "default",
    };
  }
  if ((task.status === "failed" || task.status === "cancelled") && task.checkpointType === "chapter_batch_ready") {
    return {
      label: displayStatus ?? (task.status === "failed" ? "前 10 章自动执行已暂停" : "前 10 章自动执行已取消"),
      variant: task.status === "failed" ? "destructive" : "outline",
    };
  }
  if (task.status === "waiting_approval") {
    return {
      label: displayStatus ?? formatWorkflowCheckpoint(task.checkpointType),
      variant: "secondary",
    };
  }
  if (task.status === "running") {
    return {
      label: displayStatus ?? "自动导演进行中",
      variant: "default",
    };
  }
  if (task.status === "queued") {
    return {
      label: displayStatus ?? "自动导演排队中",
      variant: "secondary",
    };
  }
  if (task.status === "failed") {
    return {
      label: displayStatus ?? "自动导演失败",
      variant: "destructive",
    };
  }
  if (task.status === "cancelled") {
    return {
      label: displayStatus ?? "自动导演已取消",
      variant: "outline",
    };
  }
  return {
    label: displayStatus ?? (task.checkpointType === "workflow_completed" ? "自动导演已完成" : formatWorkflowCheckpoint(task.checkpointType)),
    variant: "outline",
  };
}

export function getWorkflowDescription(task?: NovelAutoDirectorTaskSummary | null): string | null {
  if (!task) {
    return null;
  }
  if (
    (task.status === "queued" || task.status === "running")
    && (task.checkpointType === "front10_ready" || task.checkpointType === "chapter_batch_ready")
  ) {
    return `AI 正在后台继续执行前 10 章，当前进度 ${Math.round(task.progress * 100)}%。`;
  }
  if ((task.status === "failed" || task.status === "cancelled") && task.checkpointType === "chapter_batch_ready") {
    return "前 10 章自动执行在批量阶段暂停了，建议先查看任务，再决定是否继续自动执行。";
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
      && task.checkpointType !== "front10_ready"
      && task.checkpointType !== "chapter_batch_ready",
  );
}

export function requiresCandidateSelection(task?: Pick<WorkflowTaskLike, "status" | "checkpointType"> | null): boolean {
  return Boolean(task && task.status === "waiting_approval" && task.checkpointType === "candidate_selection_required");
}

export function canContinueFront10AutoExecution(task?: NovelAutoDirectorTaskSummary | null): boolean {
  if (!task) {
    return false;
  }
  if (task.status === "waiting_approval" && task.checkpointType === "front10_ready") {
    return true;
  }
  if (task.status === "waiting_approval" && task.checkpointType === "chapter_batch_ready") {
    return true;
  }
  return (task.status === "failed" || task.status === "cancelled") && task.checkpointType === "chapter_batch_ready";
}

export function canEnterChapterExecution(task?: NovelAutoDirectorTaskSummary | null): boolean {
  return Boolean(
    task
      && (task.checkpointType === "front10_ready"
        || task.checkpointType === "chapter_batch_ready"
        || task.checkpointType === "workflow_completed"),
  );
}

export function isLiveWorkflowTask(task?: NovelAutoDirectorTaskSummary | null): boolean {
  return Boolean(task && LIVE_TASK_STATUSES.has(task.status));
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
  searchParams.set("workflowTaskId", taskId);
  searchParams.set("mode", "director");
  return `/novels/create?${searchParams.toString()}`;
}
