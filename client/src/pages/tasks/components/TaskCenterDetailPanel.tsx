import type { DirectorDashboardView, DirectorRuntimeProjection } from "@ai-novel/shared/types/directorRuntime";
import type { NovelWorkflowMilestone } from "@ai-novel/shared/types/novelWorkflow";
import type { UnifiedTaskDetail, UnifiedTaskStep } from "@ai-novel/shared/types/task";
import { Link } from "react-router-dom";
import DirectorRuntimeProjectionCard from "@/components/autoDirector/DirectorRuntimeProjectionCard";
import {
  TaskQueueActionRow,
  TaskQueueImpactNotice,
  TaskQueueSection,
  TaskQueueStatusBadge,
  type TaskQueueSeverity,
} from "@/components/taskQueue";
import { Button } from "@/components/ui/button";
import { WorkspaceStateNotice, type WorkspaceTone } from "@/components/workspace";
import TaskCenterDetailSummary from "./TaskCenterDetailSummary";
import TaskCenterMilestoneHistory from "./TaskCenterMilestoneHistory";

export interface TaskCenterActionSpec {
  key: string;
  title: string;
  label: string;
  consequence: string;
  tone?: WorkspaceTone;
  variant?: "default" | "outline" | "destructive";
  disabled?: boolean;
  onClick: () => void;
}

interface InlineTaskAction {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}

interface TaskCenterDetailPanelProps {
  task?: UnifiedTaskDetail | null;
  loading: boolean;
  errorMessage?: string | null;
  onRetryLoad: () => void;
  isAutoDirectorTask: boolean;
  currentModelLabel: string;
  dashboardView?: DirectorDashboardView | null;
  runtimeProjection?: DirectorRuntimeProjection | null;
  noticeAction?: InlineTaskAction | null;
  noticeSeverity: TaskQueueSeverity;
  noticeTitle: string;
  failureAction?: InlineTaskAction | null;
  failureIsQualityReminder: boolean;
  actions: TaskCenterActionSpec[];
  steps: UnifiedTaskStep[];
  milestones: NovelWorkflowMilestone[];
}

export default function TaskCenterDetailPanel(props: TaskCenterDetailPanelProps) {
  const task = props.task;

  return (
    <TaskQueueSection title="任务详情" description="先判断是否阻塞，再决定继续、恢复或只记录质量提醒。">
      <div className="space-y-4 text-sm">
        {props.loading ? (
          <WorkspaceStateNotice loading title="正在读取任务详情" description="正在同步任务状态、检查点和最近步骤。" />
        ) : null}
        {props.errorMessage ? (
          <WorkspaceStateNotice
            tone="danger"
            title="任务详情读取失败"
            description={props.errorMessage}
            action={<Button size="sm" variant="outline" onClick={props.onRetryLoad}>重新读取</Button>}
          />
        ) : null}
        {!props.loading && !props.errorMessage && !task ? (
          <WorkspaceStateNotice title="请选择一个任务" description="从任务列表选择一项后，可查看影响范围、恢复位置和可执行动作。" />
        ) : null}

        {task ? (
          <>
            <TaskCenterDetailSummary
              task={task}
              isAutoDirectorTask={props.isAutoDirectorTask}
              currentModelLabel={props.currentModelLabel}
              dashboardView={props.dashboardView}
            />

            {task.noticeCode || task.noticeSummary ? (
              <TaskQueueImpactNotice
                severity={props.noticeSeverity}
                title={props.noticeTitle}
                description={task.noticeSummary ?? "任务已记录一条需要查看的结果提醒。"}
                action={props.noticeAction ? (
                  <Button size="sm" variant="outline" disabled={props.noticeAction.disabled} onClick={props.noticeAction.onClick}>
                    {props.noticeAction.label}
                  </Button>
                ) : undefined}
              />
            ) : null}

            {task.failureCode || task.failureSummary ? (
              <TaskQueueImpactNotice
                severity={props.failureIsQualityReminder ? "quality" : "blocking"}
                title={props.failureIsQualityReminder ? "质量提醒" : "任务阻塞"}
                description={task.failureSummary ?? "任务记录了需要处理的失败状态。"}
                action={props.failureAction ? (
                  <Button size="sm" variant="outline" disabled={props.failureAction.disabled} onClick={props.failureAction.onClick}>
                    {props.failureAction.label}
                  </Button>
                ) : undefined}
              />
            ) : null}

            {task.lastError && !props.failureIsQualityReminder && !task.failureCode && !task.failureSummary ? (
              <WorkspaceStateNotice tone="danger" title="最近一次执行失败" description={task.lastError} />
            ) : null}

            {task.kind === "novel_workflow" && task.checkpointSummary ? (
              <WorkspaceStateNotice compact title="最近检查点" description={task.checkpointSummary} />
            ) : null}

            {props.isAutoDirectorTask ? <DirectorRuntimeProjectionCard projection={props.runtimeProjection} /> : null}

            {props.isAutoDirectorTask ? (
              <WorkspaceStateNotice
                compact
                tone="info"
                title="导演任务操作入口"
                description="继续、恢复、切换模型和推进策略请回到小说页面的执行详情处理；任务中心保留状态、取消、归档和来源入口。"
              />
            ) : null}

            {props.actions.length > 0 ? (
              <div className="space-y-2">
                <div className="font-medium">可执行动作</div>
                {props.actions.map((action) => (
                  <TaskQueueActionRow
                    key={action.key}
                    title={action.title}
                    consequence={action.consequence}
                    tone={action.tone}
                    action={(
                      <Button
                        size="sm"
                        variant={action.variant ?? "outline"}
                        disabled={action.disabled}
                        onClick={action.onClick}
                      >
                        {action.label}
                      </Button>
                    )}
                  />
                ))}
                <TaskQueueActionRow
                  title="打开来源页面"
                  consequence="只打开任务来源，不会改变任务状态。"
                  action={<Button asChild size="sm" variant="outline"><Link to={task.sourceRoute}>打开来源页面</Link></Button>}
                />
              </div>
            ) : (
              <TaskQueueActionRow
                title="打开来源页面"
                consequence="只打开任务来源，不会改变任务状态。"
                action={<Button asChild size="sm" variant="outline"><Link to={task.sourceRoute}>打开来源页面</Link></Button>}
              />
            )}

            <div className="space-y-2">
              <div className="font-medium">步骤状态</div>
              {props.steps.length === 0 ? (
                <WorkspaceStateNotice compact title="暂无步骤状态" description="该任务尚未提供可展示的细分步骤。" />
              ) : props.steps.map((step) => (
                <div key={step.key} className="flex items-center justify-between rounded-md border border-border/70 px-3 py-2">
                  <div>{step.label}</div>
                  <TaskQueueStatusBadge
                    label={step.status === "succeeded" ? "已完成" : step.status === "failed" ? "失败" : step.status === "running" ? "进行中" : step.status === "cancelled" ? "已取消" : "未开始"}
                    tone={step.status === "succeeded" ? "success" : step.status === "failed" ? "danger" : step.status === "running" ? "info" : "neutral"}
                  />
                </div>
              ))}
            </div>

            {task.kind === "novel_workflow" ? <TaskCenterMilestoneHistory milestones={props.milestones} /> : null}
          </>
        ) : null}
      </div>
    </TaskQueueSection>
  );
}
