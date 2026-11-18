import type { UnifiedTaskSummary } from "@ai-novel/shared/types/task";
import { Button } from "@/components/ui/button";
import {
  TaskQueueEmptyState,
  TaskQueueItem,
  TaskQueueSection,
  TaskQueueSeverityBadge,
  TaskQueueStatusBadge,
} from "@/components/taskQueue";
import { WorkspaceStateNotice } from "@/components/workspace";
import {
  formatDate,
  formatKind,
  formatStatus,
  getTaskQueueLevelLabel,
  getTaskQueueSeverity,
  getTaskQueueTone,
} from "../taskCenterUtils";

interface TaskCenterListPanelProps {
  tasks: UnifiedTaskSummary[];
  selectedKind: string | null;
  selectedId: string | null;
  loading: boolean;
  errorMessage?: string | null;
  onRetry: () => void;
  onSelectTask: (task: UnifiedTaskSummary) => void;
}

export default function TaskCenterListPanel({
  tasks,
  selectedKind,
  selectedId,
  loading,
  errorMessage,
  onRetry,
  onSelectTask,
}: TaskCenterListPanelProps) {
  return (
    <TaskQueueSection
      title="任务记录"
      description={`${tasks.length} 项结果，优先展示需要处理和等待操作的任务。`}
      className="overflow-hidden rounded-2xl border-border/40 bg-card/60 shadow-[0_12px_36px_rgba(15,23,42,0.035)]"
    >
      <div className="space-y-3">
        {loading ? (
          <WorkspaceStateNotice compact loading title="正在读取任务" description="正在汇总任务状态和最近进度。" />
        ) : null}
        {errorMessage ? (
          <WorkspaceStateNotice
            compact
            tone="danger"
            title="任务列表读取失败"
            description={errorMessage}
            action={<Button size="sm" variant="outline" onClick={onRetry}>重新读取</Button>}
          />
        ) : null}
        {tasks.map((task) => {
          const isSelected = task.kind === selectedKind && task.id === selectedId;
          const tone = getTaskQueueTone(task);
          const severity = getTaskQueueSeverity(task);
          const progressPercent = Math.round(task.progress * 100);
          return (
            <TaskQueueItem
              key={`${task.kind}:${task.id}`}
              selected={isSelected}
              tone={tone}
              onClick={() => onSelectTask(task)}
              className={isSelected
                ? "rounded-xl border-primary/35 bg-primary/[0.045] p-4 shadow-[inset_3px_0_0_hsl(var(--primary))]"
                : "rounded-xl border-border/30 bg-background/65 p-4 hover:border-border/60 hover:bg-muted/25"}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-foreground">{task.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{formatKind(task.kind)} · {task.ownerLabel}</div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-1.5">
                  {severity !== "normal" ? (
                    <TaskQueueSeverityBadge severity={severity} label={getTaskQueueLevelLabel(task)} />
                  ) : null}
                  <TaskQueueStatusBadge label={formatStatus(task.status)} tone="neutral" className="border-0 bg-muted/60 font-normal" />
                </div>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary/70 transition-[width]" style={{ width: `${progressPercent}%` }} />
                </div>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{progressPercent}%</span>
              </div>
              <div className="mt-3 text-sm leading-5 text-foreground/85">
                {task.currentItemLabel ?? task.displayStatus ?? task.currentStage ?? "等待任务更新"}
              </div>
              {task.blockingReason ? (
                <div className="mt-2 line-clamp-2 rounded-lg bg-destructive/[0.055] px-3 py-2 text-xs leading-5 text-destructive">
                  {task.blockingReason}
                </div>
              ) : null}
              <div className="mt-3 text-[11px] text-muted-foreground">
                更新于 {formatDate(task.updatedAt)}
              </div>
            </TaskQueueItem>
          );
        })}
        {!loading && !errorMessage && tasks.length === 0 ? (
          <TaskQueueEmptyState
            title="没有符合条件的任务"
            description="可以清除筛选条件，或回到来源页面发起新的创作与资料处理任务。"
          />
        ) : null}
      </div>
    </TaskQueueSection>
  );
}
