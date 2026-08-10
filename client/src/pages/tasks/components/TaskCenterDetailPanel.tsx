import i18next from "i18next";
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
    <TaskQueueSection
      title={i18next.t("dict.taskIdDetails")}
      description={i18next.t("tasks.taskCenterDetailPanel.337t8q")}
      className="overflow-hidden rounded-2xl border-border/40 bg-card/60 shadow-[0_12px_36px_rgba(15,23,42,0.035)]"
    >
      <div className="space-y-4 text-sm">
        {props.loading ? (
          <WorkspaceStateNotice loading title={i18next.t("tasks.taskCenterDetailPanel.u3def9")} description={i18next.t("tasks.taskCenterDetailPanel.hqjq08")} />
        ) : null}
        {props.errorMessage ? (
          <WorkspaceStateNotice
            tone="danger"
            title={i18next.t("tasks.taskCenterDetailPanel.fkj558")}
            description={props.errorMessage}
            action={<Button size="sm" variant="outline" onClick={props.onRetryLoad}>{i18next.t("autoDirectorFollowUps.autoDirectorFollowUpCenterPage.itle66")}</Button>}
          />
        ) : null}
        {!props.loading && !props.errorMessage && !task ? (
          <WorkspaceStateNotice title={i18next.t("tasks.taskCenterDetailPanel.tylw13")} description={i18next.t("tasks.taskCenterDetailPanel.osb17j")} />
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
              <WorkspaceStateNotice tone="danger" title={i18next.t("tasks.taskCenterDetailPanel.udgblh")} description={task.lastError} />
            ) : null}

            {task.kind === "novel_workflow" && task.checkpointSummary ? (
              <WorkspaceStateNotice compact title={i18next.t("dict.gen_067d1583")} description={task.checkpointSummary} />
            ) : null}

            {props.isAutoDirectorTask ? <DirectorRuntimeProjectionCard projection={props.runtimeProjection} /> : null}

            {props.isAutoDirectorTask ? (
              <WorkspaceStateNotice
                compact
                tone="info"
                title={i18next.t("tasks.taskCenterDetailPanel.gn57f9")}
                description={i18next.t("tasks.taskCenterDetailPanel.3w2i19")}
              />
            ) : null}

            {props.actions.length > 0 ? (
              <div className="space-y-2">
                <div className="font-medium">{i18next.t("dict.gen_bdd966d4")}</div>
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
                  title={i18next.t("dict.gen_492476d9")}
                  consequence="只打开任务来源，不会改变任务状态。"
                  action={<Button asChild size="sm" variant="outline"><Link to={task.sourceRoute}>{i18next.t("dict.gen_492476d9")}</Link></Button>}
                />
              </div>
            ) : (
              <TaskQueueActionRow
                title={i18next.t("dict.gen_492476d9")}
                consequence="只打开任务来源，不会改变任务状态。"
                action={<Button asChild size="sm" variant="outline"><Link to={task.sourceRoute}>{i18next.t("dict.gen_492476d9")}</Link></Button>}
              />
            )}

            <details className="group border-t border-border/35 pt-3">
              <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium marker:hidden">
                <span>执行步骤 {props.steps.length > 0 ? `(${props.steps.length})` : ""}</span>
                <span className="text-xs font-normal text-muted-foreground group-open:hidden">{i18next.t("dict.gen_e2edde5a")}</span>
                <span className="hidden text-xs font-normal text-muted-foreground group-open:inline">{i18next.t("dict.gen_def9e98b")}</span>
              </summary>
              <div className="mt-3 space-y-2">
                {props.steps.length === 0 ? (
                  <WorkspaceStateNotice compact title={i18next.t("tasks.taskCenterDetailPanel.j6b0vs")} description={i18next.t("tasks.taskCenterDetailPanel.ihackt")} />
                ) : props.steps.map((step) => (
                  <div key={step.key} className="flex items-center justify-between rounded-xl bg-muted/25 px-3 py-2">
                    <div>{step.label}</div>
                    <TaskQueueStatusBadge
                      label={step.status === "succeeded" ? "已完成" : step.status === "failed" ? "失败" : step.status === "running" ? "进行中" : step.status === "cancelled" ? "已取消" : "未开始"}
                      tone={step.status === "succeeded" ? "success" : step.status === "failed" ? "danger" : step.status === "running" ? "info" : "neutral"}
                      className="border-0 bg-background/70 font-normal"
                    />
                  </div>
                ))}
              </div>
            </details>

            {task.kind === "novel_workflow" ? <TaskCenterMilestoneHistory milestones={props.milestones} /> : null}
          </>
        ) : null}
      </div>
    </TaskQueueSection>
  );
}
