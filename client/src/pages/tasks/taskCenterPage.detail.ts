import type { AutoDirectorAction, AutoDirectorMutationActionCode } from "@ai-novel/shared/types/autoDirectorFollowUp";
import type { TaskKind, UnifiedTaskDetail, UnifiedTaskStep } from "@ai-novel/shared/types/task";
import type { TaskLlmInvocationDiagnostic } from "@ai-novel/shared/types/task";
import type { NovelWorkflowMilestone } from "@ai-novel/shared/types/novelWorkflow";
import {
  ACTIVE_STATUSES,
  createIdempotencyKey,
  formatDate,
  formatFollowUpPriority,
  formatKind,
  formatResumeTarget,
  formatStatus,
  formatTokenCount,
  followUpActionVariant,
  normalizeTaskMeta,
  normalizeTaskSteps,
  toStatusVariant,
  type TaskSortMode,
} from "./taskCenterPage.shared";

export type TaskCenterSelectionState = {
  selectedTask: UnifiedTaskDetail | undefined;
  selectedTaskMeta: Record<string, unknown>;
  selectedTaskSteps: UnifiedTaskStep[];
  isAutoDirectorTask: boolean;
  isActiveAutoDirectorTask: boolean;
  canResumeFront10AutoExecution: boolean;
  needsCandidateSelection: boolean;
  selectedTaskNotice: ReturnType<typeof import("@/lib/directorTaskNotice").parseDirectorTaskNotice>;
  selectedTaskNoticeRoute: string | null;
  selectedTaskChapterTitleWarning: ReturnType<typeof import("@/lib/directorTaskNotice").resolveChapterTitleWarning>;
  selectedTaskFailureRepairRoute: string | null;
  selectedTaskHasChapterTitleFailure: boolean;
  canRetryWithSelectedModel: boolean;
  selectedAutoDirectorFollowUp: {
    reasonLabel: string;
    priority: "P0" | "P1" | "P2";
    followUpSummary: string;
    blockingReason?: string | null;
    currentModel?: string | null;
    availableActions: AutoDirectorAction[];
    task?: { status: string } | null;
  } | null;
};

export function buildTaskCenterSelectionState(input: {
  selectedTask: UnifiedTaskDetail | undefined;
  selectedId: string | null;
  retryOverride: { provider?: string; model: string };
  selectedTaskNotice: ReturnType<typeof import("@/lib/directorTaskNotice").parseDirectorTaskNotice>;
  selectedTaskNoticeRoute: string | null;
  selectedTaskChapterTitleWarning: ReturnType<typeof import("@/lib/directorTaskNotice").resolveChapterTitleWarning>;
  selectedAutoDirectorFollowUp: TaskCenterSelectionState["selectedAutoDirectorFollowUp"];
}): TaskCenterSelectionState {
  const selectedTaskMeta = normalizeTaskMeta(input.selectedTask?.meta);
  const selectedTaskSteps = normalizeTaskSteps(input.selectedTask?.steps);
  const isAutoDirectorTask = Boolean(
    input.selectedTask
    && input.selectedTask.kind === "novel_workflow"
    && selectedTaskMeta.lane === "auto_director",
  );
  const isActiveAutoDirectorTask = Boolean(
    input.selectedTask
    && isAutoDirectorTask
    && ACTIVE_STATUSES.has(input.selectedTask.status),
  );
  const canResumeFront10AutoExecution = Boolean(
    input.selectedTask
    && input.selectedTask.kind === "novel_workflow"
    && input.selectedTask.resumeAction,
  );
  const needsCandidateSelection = Boolean(
    input.selectedTask
    && input.selectedTask.kind === "novel_workflow"
    && input.selectedTask.checkpointType === "candidate_selection_required",
  );
  const selectedTaskHasChapterTitleFailure = Boolean(
    input.selectedTask
    && input.selectedTask.kind === "novel_workflow"
    && typeof input.selectedTask.failureSummary === "string"
    && input.selectedTask.failureSummary.includes("标题"),
  );
  const canRetryWithSelectedModel = Boolean(input.retryOverride.provider && input.retryOverride.model.trim());

  return {
    selectedTask: input.selectedTask,
    selectedTaskMeta,
    selectedTaskSteps,
    isAutoDirectorTask,
    isActiveAutoDirectorTask,
    canResumeFront10AutoExecution,
    needsCandidateSelection,
    selectedTaskNotice: input.selectedTaskNotice,
    selectedTaskNoticeRoute: input.selectedTaskNoticeRoute,
    selectedTaskChapterTitleWarning: input.selectedTaskChapterTitleWarning,
    selectedTaskFailureRepairRoute: input.selectedTaskChapterTitleWarning?.route ?? null,
    selectedTaskHasChapterTitleFailure,
    canRetryWithSelectedModel,
    selectedAutoDirectorFollowUp: input.selectedAutoDirectorFollowUp,
  };
}

export function createTaskCenterFollowUpActionHandler(input: {
  selectedTask: UnifiedTaskDetail | undefined;
  navigate: (target: string) => void;
  resolveInternalNavigationTarget: (value: string) => string | null;
  executeFollowUpAction: (payload: { taskId: string; actionCode: AutoDirectorMutationActionCode; idempotencyKey: string }) => void;
}): (action: AutoDirectorAction) => void {
  return (action) => {
    if (!input.selectedTask) {
      return;
    }
    if (action.kind === "navigation") {
      const targetUrl = action.targetUrl ?? input.selectedTask.sourceRoute;
      const internalTarget = input.resolveInternalNavigationTarget(targetUrl);
      if (internalTarget) {
        input.navigate(internalTarget);
        return;
      }
      const externalTarget = targetUrl?.trim();
      if (externalTarget && /^https?:\/\//i.test(externalTarget)) {
        window.location.assign(externalTarget);
      }
      return;
    }
    if (action.requiresConfirm) {
      const confirmed = window.confirm(`确认执行“${action.label}”？`);
      if (!confirmed) {
        return;
      }
    }
    input.executeFollowUpAction({
      taskId: input.selectedTask.id,
      actionCode: action.code as AutoDirectorMutationActionCode,
      idempotencyKey: createIdempotencyKey(input.selectedTask.id, action.code),
    });
  };
}
