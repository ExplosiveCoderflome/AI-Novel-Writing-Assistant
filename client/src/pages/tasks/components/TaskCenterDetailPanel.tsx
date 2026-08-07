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
    <TaskQueueSection title="Mission details" description="Determine whether it is blocked first, and then decide to continue, resume or only record quality reminders.">
      <div className="space-y-4 text-sm">
        {props.loading ? (
          <WorkspaceStateNotice loading title="Reading task details" description="Synchronizing task status, checkpoints, and recent steps." />
        ) : null}
        {props.errorMessage ? (
          <WorkspaceStateNotice
            tone="danger"
            title="Failed to read task details"
            description={props.errorMessage}
            action={<Button size="sm" variant="outline" onClick={props.onRetryLoad}>reread</Button>}
          />
        ) : null}
        {!props.loading && !props.errorMessage && !task ? (
          <WorkspaceStateNotice title="Please select a task" description="After selecting an item from the task list, you can view the impact area, recovery location, and executable actions." />
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
                description={task.noticeSummary ?? "The task has recorded a result reminder that needs to be viewed."}
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
                title={props.failureIsQualityReminder ? "Quality reminder" : "Task blocking"}
                description={task.failureSummary ?? "The task records the failure status that needs to be handled."}
                action={props.failureAction ? (
                  <Button size="sm" variant="outline" disabled={props.failureAction.disabled} onClick={props.failureAction.onClick}>
                    {props.failureAction.label}
                  </Button>
                ) : undefined}
              />
            ) : null}

            {task.lastError && !props.failureIsQualityReminder && !task.failureCode && !task.failureSummary ? (
              <WorkspaceStateNotice tone="danger" title="The latest execution failed" description={task.lastError} />
            ) : null}

            {task.kind === "novel_workflow" && task.checkpointSummary ? (
              <WorkspaceStateNotice compact title="latest checkpoint" description={task.checkpointSummary} />
            ) : null}

            {props.isAutoDirectorTask ? <DirectorRuntimeProjectionCard projection={props.runtimeProjection} /> : null}

            {props.isAutoDirectorTask ? (
              <WorkspaceStateNotice
                compact
                tone="info"
                title="Director task operation entrance"
                description="Please return to the execution details of the novel page for continuation, recovery, switching models and advancement strategies; the task center retains status, cancellation, archiving and source entries."
              />
            ) : null}

            {props.actions.length > 0 ? (
              <div className="space-y-2">
                <div className="font-medium">Executable actions</div>
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
                  title="Open source page"
                  consequence="Only the task source is opened and the task status will not be changed."
                  action={<Button asChild size="sm" variant="outline"><Link to={task.sourceRoute}>Open source page</Link></Button>}
                />
              </div>
            ) : (
              <TaskQueueActionRow
                title="Open source page"
                consequence="Only the task source is opened and the task status will not be changed."
                action={<Button asChild size="sm" variant="outline"><Link to={task.sourceRoute}>Open source page</Link></Button>}
              />
            )}

            <div className="space-y-2">
              <div className="font-medium">step status</div>
              {props.steps.length === 0 ? (
                <WorkspaceStateNotice compact title="No step status yet" description="Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know." />
              ) : props.steps.map((step) => (
                <div key={step.key} className="flex items-center justify-between rounded-md border border-border/70 px-3 py-2">
                  <div>{step.label}</div>
                  <TaskQueueStatusBadge
                    label={step.status === "succeeded" ? "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know." : step.status === "failed" ? "fail" : step.status === "running" ? "in progress" : step.status === "cancelled" ? "Canceled" : "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know."}
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
