import i18next from "i18next";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  const task = props.task;

  return (
    <TaskQueueSection title={t("gen.pages.tasks.components.TaskCenterDetailPanel.gen_4a98bf0c", "任务详情")} description={t("gen.pages.tasks.components.TaskCenterDetailPanel.gen_9577cb4e", "先判断是否阻塞，再决定继续、恢复或只记录质量提醒。")}>
      <div className="space-y-4 text-sm">
        {props.loading ? (
          <WorkspaceStateNotice loading title={t("gen.pages.tasks.components.TaskCenterDetailPanel.gen_d72a825f", "正在读取任务详情")} description={t("gen.pages.tasks.components.TaskCenterDetailPanel.gen_4e00e335", "正在同步任务状态、检查点和最近步骤。")} />
        ) : null}
        {props.errorMessage ? (
          <WorkspaceStateNotice
            tone="danger"
            title={t("gen.pages.tasks.components.TaskCenterDetailPanel.gen_1e5a4495", "任务详情读取失败")}
            description={props.errorMessage}
            action={<Button size="sm" variant="outline" onClick={props.onRetryLoad}>{t("gen.pages.tasks.components.TaskCenterDetailPanel.gen_9e56f482", "重新读取")}</Button>}
          />
        ) : null}
        {!props.loading && !props.errorMessage && !task ? (
          <WorkspaceStateNotice title={t("gen.pages.tasks.components.TaskCenterDetailPanel.gen_86bb1ef0", "请选择一个任务")} description={t("gen.pages.tasks.components.TaskCenterDetailPanel.gen_944abf97", "从任务列表选择一项后，可查看影响范围、恢复位置和可执行动作。")} />
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
              <WorkspaceStateNotice tone="danger" title={t("gen.pages.tasks.components.TaskCenterDetailPanel.gen_30590f5e", "最近一次执行失败")} description={task.lastError} />
            ) : null}

            {task.kind === "novel_workflow" && task.checkpointSummary ? (
              <WorkspaceStateNotice compact title={t("gen.pages.tasks.components.TaskCenterDetailPanel.gen_067d1583", "最近检查点")} description={task.checkpointSummary} />
            ) : null}

            {props.isAutoDirectorTask ? <DirectorRuntimeProjectionCard projection={props.runtimeProjection} /> : null}

            {props.isAutoDirectorTask ? (
              <WorkspaceStateNotice
                compact
                tone="info"
                title={t("gen.pages.tasks.components.TaskCenterDetailPanel.gen_fab2c45a", "导演任务操作入口")}
                description={t("gen.pages.tasks.components.TaskCenterDetailPanel.gen_b55c56ac", "继续、恢复、切换模型和推进策略请回到小说页面的执行详情处理；任务中心保留状态、取消、归档和来源入口。")}
              />
            ) : null}

            {props.actions.length > 0 ? (
              <div className="space-y-2">
                <div className="font-medium">{t("gen.pages.tasks.components.TaskCenterDetailPanel.gen_bdd966d4", "可执行动作")}</div>
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
                  title={t("gen.pages.tasks.components.TaskCenterDetailPanel.gen_492476d9", "打开来源页面")}
                  consequence={t("gen.pages.tasks.components.TaskCenterDetailPanel.gen_931d5a21", "只打开任务来源，不会改变任务状态。")}
                  action={<Button asChild size="sm" variant="outline"><Link to={task.sourceRoute}>{t("gen.pages.tasks.components.TaskCenterDetailPanel.gen_492476d9", "打开来源页面")}</Link></Button>}
                />
              </div>
            ) : (
              <TaskQueueActionRow
                title={t("gen.pages.tasks.components.TaskCenterDetailPanel.gen_492476d9", "打开来源页面")}
                consequence={t("gen.pages.tasks.components.TaskCenterDetailPanel.gen_931d5a21", "只打开任务来源，不会改变任务状态。")}
                action={<Button asChild size="sm" variant="outline"><Link to={task.sourceRoute}>{t("gen.pages.tasks.components.TaskCenterDetailPanel.gen_492476d9", "打开来源页面")}</Link></Button>}
              />
            )}

            <div className="space-y-2">
              <div className="font-medium">{t("gen.pages.tasks.components.TaskCenterDetailPanel.gen_d96a7b07", "步骤状态")}</div>
              {props.steps.length === 0 ? (
                <WorkspaceStateNotice compact title={t("gen.pages.tasks.components.TaskCenterDetailPanel.gen_7759c707", "暂无步骤状态")} description={t("gen.pages.tasks.components.TaskCenterDetailPanel.gen_a7436090", "该任务尚未提供可展示的细分步骤。")} />
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
