import i18next from "i18next";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  return (
    <TaskQueueSection title={t("tasks.listTitle", "任务列表")} description={t("tasks.listDesc", "阻塞任务优先，质量提醒不会自动等同于全局失败。")}>
      <div className="space-y-3">
        {loading ? (
          <WorkspaceStateNotice compact loading title={i18next.t("tasks.taskCenterListPanel.l8sug6")} description={i18next.t("tasks.taskCenterListPanel.4slp8c")} />
        ) : null}
        {errorMessage ? (
          <WorkspaceStateNotice
            compact
            tone="danger"
            title={i18next.t("tasks.taskCenterListPanel.mgtm86")}
            description={errorMessage}
            action={<Button size="sm" variant="outline" onClick={onRetry}>{i18next.t("autoDirectorFollowUps.autoDirectorFollowUpCenterPage.itle66")}</Button>}
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
                {formatKind(task.kind)} | 进度 {Math.round(task.progress * 100)}%
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                阶段：{task.currentStage ?? "暂无"} | 当前项：{task.currentItemLabel ?? "暂无"}
              </div>
              {task.displayStatus || task.lastHealthyStage ? (
                <div className="mt-1 text-xs text-muted-foreground">
                  状态：{task.displayStatus ?? formatStatus(task.status)} | 最近健康阶段：{task.lastHealthyStage ?? "暂无"}
                </div>
              ) : null}
              {task.kind === "novel_workflow" ? (
                <div className="mt-1 text-xs text-muted-foreground">
                  检查点：{formatCheckpoint(task.checkpointType, task.executionScopeLabel)} | 建议继续：{task.resumeAction ?? task.nextActionLabel ?? "继续主流程"}
                </div>
              ) : null}
              {task.blockingReason ? (
                <div className="mt-1 text-xs text-muted-foreground line-clamp-2">
                  原因：{task.blockingReason}
                </div>
              ) : null}
              <div className="mt-1 text-xs text-muted-foreground">
                最近心跳：{formatDate(task.heartbeatAt)} | 更新时间：{formatDate(task.updatedAt)}
              </div>
            </TaskQueueItem>
          );
        })}
        {!loading && !errorMessage && tasks.length === 0 ? (
          <TaskQueueEmptyState
            title={i18next.t("tasks.taskCenterListPanel.4wlbd7")}
            description={i18next.t("tasks.taskCenterListPanel.rich36")}
          />
        ) : null}
      </div>
    </TaskQueueSection>
  );
}
