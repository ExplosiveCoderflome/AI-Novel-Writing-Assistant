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
  formatCheckpoint,
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
    <TaskQueueSection title="task list" description="Blocking tasks take priority, and quality reminders do not automatically equate to global failure.">
      <div className="space-y-3">
        {loading ? (
          <WorkspaceStateNotice compact loading title="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know." description="Summarizing task status and recent progress." />
        ) : null}
        {errorMessage ? (
          <WorkspaceStateNotice
            compact
            tone="danger"
            title="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."
            description={errorMessage}
            action={<Button size="sm" variant="outline" onClick={onRetry}>reread</Button>}
          />
        ) : null}
        {tasks.map((task) => {
          const isSelected = task.kind === selectedKind && task.id === selectedId;
          const tone = getTaskQueueTone(task);
          return (
            <TaskQueueItem
              key={`${task.kind}:${task.id}`}
              selected={isSelected}
              tone={tone}
              onClick={() => onSelectTask(task)}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium">{task.title}</div>
                <div className="flex flex-wrap gap-2">
                  <TaskQueueSeverityBadge severity={getTaskQueueSeverity(task)} label={getTaskQueueLevelLabel(task)} />
                  <TaskQueueStatusBadge label={formatStatus(task.status)} tone="neutral" />
                </div>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                {formatKind(task.kind)} | progress {Math.round(task.progress * 100)}%
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                stage:{task.currentStage ?? "None yet"} | Current item:{task.currentItemLabel ?? "None yet"}
              </div>
              {task.displayStatus || task.lastHealthyStage ? (
                <div className="mt-1 text-xs text-muted-foreground">
                  state:{task.displayStatus ?? formatStatus(task.status)} | Recent health stage:{task.lastHealthyStage ?? "None yet"}
                </div>
              ) : null}
              {task.kind === "novel_workflow" ? (
                <div className="mt-1 text-xs text-muted-foreground">
                  Checkpoint:{formatCheckpoint(task.checkpointType, task.executionScopeLabel)} | It is recommended to continue:{task.resumeAction ?? task.nextActionLabel ?? "Continue the main process"}
                </div>
              ) : null}
              {task.blockingReason ? (
                <div className="mt-1 text-xs text-muted-foreground line-clamp-2">
                  reason:{task.blockingReason}
                </div>
              ) : null}
              <div className="mt-1 text-xs text-muted-foreground">
                Recent heartbeat:{formatDate(task.heartbeatAt)} | Update time:{formatDate(task.updatedAt)}
              </div>
            </TaskQueueItem>
          );
        })}
        {!loading && !errorMessage && tasks.length === 0 ? (
          <TaskQueueEmptyState
            title="There are no matching tasks"
            description="You can clear the filter conditions, or return to the source page to initiate new creation and data processing tasks."
          />
        ) : null}
      </div>
    </TaskQueueSection>
  );
}
