import i18next from "i18next";
const t = (key: string, options?: any) => i18next.t(key, options) as string;
import type { UnifiedTaskSummary } from "@ai-novel/shared/types/task";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatCheckpoint,
  formatDate,
  formatKind,
  formatStatus,
  toStatusVariant,
} from "../taskCenterUtils";

interface TaskCenterListPanelProps {
  tasks: UnifiedTaskSummary[];
  selectedKind: string | null;
  selectedId: string | null;
  onSelectTask: (task: UnifiedTaskSummary) => void;
}

export default function TaskCenterListPanel({
  tasks,
  selectedKind,
  selectedId,
  onSelectTask,
}: TaskCenterListPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("gen.pages.tasks.components.TaskCenterListPanel.taskList")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {tasks.map((task) => {
          const isSelected = task.kind === selectedKind && task.id === selectedId;
          return (
            <button
              key={`${task.kind}:${task.id}`}
              type="button"
              className={`w-full rounded-md border p-3 text-left transition-colors ${
                isSelected ? "border-primary bg-primary/5" : "hover:bg-muted/40"
              }`}
              onClick={() => onSelectTask(task)}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-medium">{task.title}</div>
                <Badge variant={toStatusVariant(task.status)}>{formatStatus(task.status)}</Badge>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                {formatKind(task.kind)} | 进度 {Math.round(task.progress * 100)}%
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                阶段：{task.currentStage ?? t("gen.pages.tasks.components.TaskCenterListPanel.gen_f61f4cf6")} | 当前项：{task.currentItemLabel ?? t("gen.pages.tasks.components.TaskCenterListPanel.gen_f61f4cf6")}
              </div>
              {task.displayStatus || task.lastHealthyStage ? (
                <div className="mt-1 text-xs text-muted-foreground">
                  状态：{task.displayStatus ?? formatStatus(task.status)} | 最近健康阶段：{task.lastHealthyStage ?? t("gen.pages.tasks.components.TaskCenterListPanel.gen_f61f4cf6")}
                </div>
              ) : null}
              {task.kind === "novel_workflow" ? (
                <div className="mt-1 text-xs text-muted-foreground">
                  检查点：{formatCheckpoint(task.checkpointType, task.executionScopeLabel)} | 建议继续：{task.resumeAction ?? task.nextActionLabel ?? t("gen.pages.tasks.components.TaskCenterListPanel.gen_5c3a622e")}
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
            </button>
          );
        })}
        {tasks.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
            当前没有符合条件的任务。
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
