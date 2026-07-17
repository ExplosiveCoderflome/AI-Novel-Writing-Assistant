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
  const currentStage = dashboardView?.stageLabel ?? task.currentStage ?? "暂无";
  const currentItem = dashboardView?.currentAction ?? task.currentItemLabel ?? "暂无";
  const tone = getTaskQueueTone(task);

  return (
    <>
      <div className="space-y-1">
        <div className="font-medium">{task.title}</div>
        <div className="text-xs text-muted-foreground">
          {formatKind(task.kind)} | 归属：{task.ownerLabel}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <TaskQueueStatusBadge label={getTaskQueueLevelLabel(task)} tone={tone} />
        <TaskQueueStatusBadge label={formatStatus(task.status)} tone="neutral" />
        <TaskQueueStatusBadge label={`进度 ${progressPercent}%`} tone="neutral" />
      </div>
      <div className="space-y-1 text-muted-foreground">
        <div>展示状态：{dashboardView?.statusLabel ?? task.displayStatus ?? formatStatus(task.status)}</div>
        <div>当前阶段：{currentStage}</div>
        <div>当前项：{currentItem}</div>
        {task.kind === "novel_workflow" ? (
          <>
            <div>最近检查点：{formatCheckpoint(task.checkpointType, task.executionScopeLabel)}</div>
            <div>恢复目标页：{formatResumeTarget(task.resumeTarget)}</div>
            <div>建议继续：{task.resumeAction ?? task.nextActionLabel ?? "继续小说主流程"}</div>
            <div>最近健康阶段：{task.lastHealthyStage ?? "暂无"}</div>
          </>
        ) : null}
        {task.blockingReason ? (
          <div>阻塞原因：{task.blockingReason}</div>
        ) : null}
        <div>最近心跳：{formatDate(task.heartbeatAt)}</div>
        <div>开始时间：{formatDate(task.startedAt)}</div>
        <div>结束时间：{formatDate(task.finishedAt)}</div>
        <div>重试计数：{task.retryCountLabel}</div>
        {(task.provider || task.model) ? (
          <div>调用模型：{task.provider ?? "暂无"} / {task.model ?? "暂无"}</div>
        ) : null}
        {isAutoDirectorTask ? (
          <div>当前界面模型：{currentModelLabel}</div>
        ) : null}
        {(task.tokenUsage || task.provider || task.model) ? (
          <>
            <div>累计调用：{formatTokenCount(task.tokenUsage?.llmCallCount ?? 0)}</div>
            <div>输入 Tokens：{formatTokenCount(task.tokenUsage?.promptTokens ?? 0)}</div>
            <div>输出 Tokens：{formatTokenCount(task.tokenUsage?.completionTokens ?? 0)}</div>
            <div>累计总 Tokens：{formatTokenCount(task.tokenUsage?.totalTokens ?? 0)}</div>
            <div>最近记录：{formatDate(task.tokenUsage?.lastRecordedAt)}</div>
          </>
        ) : null}
      </div>
    </>
  );
}
