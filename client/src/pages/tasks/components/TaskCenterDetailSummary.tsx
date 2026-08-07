import type { DirectorDashboardView } from "@ai-novel/shared/types/directorRuntime";
import type { UnifiedTaskDetail } from "@ai-novel/shared/types/task";
import { TaskQueueStatusBadge } from "@/components/taskQueue";
import {
  formatCheckpoint,
  formatDate,
  formatKind,
  formatResumeTarget,
  formatStatus,
  formatTokenCount,
  getTaskQueueLevelLabel,
  getTaskQueueTone,
} from "../taskCenterUtils";

interface TaskCenterDetailSummaryProps {
  task: UnifiedTaskDetail;
  isAutoDirectorTask: boolean;
  currentModelLabel: string;
  dashboardView?: DirectorDashboardView | null;
}

export default function TaskCenterDetailSummary({
  task,
  isAutoDirectorTask,
  currentModelLabel,
  dashboardView,
}: TaskCenterDetailSummaryProps) {
  const progressPercent = typeof dashboardView?.progressPercent === "number"
    ? dashboardView.progressPercent
    : Math.round(task.progress * 100);
  const currentStage = dashboardView?.stageLabel ?? task.currentStage ?? "None yet";
  const currentItem = dashboardView?.currentAction ?? task.currentItemLabel ?? "None yet";
  const tone = getTaskQueueTone(task);

  return (
    <>
      <div className="space-y-1">
        <div className="font-medium">{task.title}</div>
        <div className="text-xs text-muted-foreground">
          {formatKind(task.kind)} | Attribution:{task.ownerLabel}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <TaskQueueStatusBadge label={getTaskQueueLevelLabel(task)} tone={tone} />
        <TaskQueueStatusBadge label={formatStatus(task.status)} tone="neutral" />
        <TaskQueueStatusBadge label={`进度 ${progressPercent}%`} tone="neutral" />
      </div>
      <div className="space-y-1 text-muted-foreground">
        <div>Display status:{dashboardView?.statusLabel ?? task.displayStatus ?? formatStatus(task.status)}</div>
        <div>Current stage:{currentStage}</div>
        <div>Current item:{currentItem}</div>
        {task.kind === "novel_workflow" ? (
          <>
            <div>Recent checkpoints:{formatCheckpoint(task.checkpointType, task.executionScopeLabel)}</div>
            <div>Restore target page:{formatResumeTarget(task.resumeTarget)}</div>
            <div>It is recommended to continue:{task.resumeAction ?? task.nextActionLabel ?? "Continue the main flow of the novel"}</div>
            <div>Recent health stage:{task.lastHealthyStage ?? "None yet"}</div>
          </>
        ) : null}
        {task.blockingReason ? (
          <div>Reason for blocking:{task.blockingReason}</div>
        ) : null}
        <div>Recent heartbeat:{formatDate(task.heartbeatAt)}</div>
        <div>Start time:{formatDate(task.startedAt)}</div>
        <div>End time:{formatDate(task.finishedAt)}</div>
        <div>Retry count:{task.retryCountLabel}</div>
        {(task.provider || task.model) ? (
          <div>Call model:{task.provider ?? "None yet"} / {task.model ?? "None yet"}</div>
        ) : null}
        {isAutoDirectorTask ? (
          <div>Current interface model:{currentModelLabel}</div>
        ) : null}
        {(task.tokenUsage || task.provider || task.model) ? (
          <>
            <div>Cumulative calls:{formatTokenCount(task.tokenUsage?.llmCallCount ?? 0)}</div>
            <div>Enter Tokens:{formatTokenCount(task.tokenUsage?.promptTokens ?? 0)}</div>
            <div>Output Tokens:{formatTokenCount(task.tokenUsage?.completionTokens ?? 0)}</div>
            <div>Cumulative total Tokens:{formatTokenCount(task.tokenUsage?.totalTokens ?? 0)}</div>
            <div>Recent records:{formatDate(task.tokenUsage?.lastRecordedAt)}</div>
          </>
        ) : null}
      </div>
    </>
  );
}
