import type {
  AutoDirectorAction,
  AutoDirectorFollowUpDetail,
  AutoDirectorMutationActionCode,
} from "@ai-novel/shared/types/autoDirectorFollowUp";
import type { UnifiedTaskDetail, UnifiedTaskStep } from "@ai-novel/shared/types/task";
import {
  buildTaskNoticeRoute,
  isChapterTitleDiversitySummary,
  parseDirectorTaskNotice,
  resolveChapterTitleWarning,
} from "@/lib/directorTaskNotice";
import {
  canContinueFront10AutoExecution,
  requiresCandidateSelection,
} from "@/lib/novelWorkflowTaskUi";
import {
  ACTIVE_STATUSES,
  createIdempotencyKey,
  normalizeTaskMeta,
  normalizeTaskSteps,
} from "./taskCenterPage.shared";

export type TaskCenterSelectionState = {
  selectedTask: UnifiedTaskDetail | undefined;
  selectedTaskMeta: Record<string, unknown>;
  selectedTaskSteps: UnifiedTaskStep[];
  isAutoDirectorTask: boolean;
  isActiveAutoDirectorTask: boolean;
  canResumeFront10AutoExecution: boolean;
  needsCandidateSelection: boolean;
  selectedTaskNotice: ReturnType<typeof parseDirectorTaskNotice>;
  selectedTaskNoticeRoute: string | null;
  selectedTaskChapterTitleWarning: ReturnType<typeof resolveChapterTitleWarning>;
  selectedTaskFailureRepairRoute: string | null;
  selectedTaskHasChapterTitleFailure: boolean;
  canRetryWithSelectedModel: boolean;
  selectedAutoDirectorFollowUp: AutoDirectorFollowUpDetail | null;
};

export function buildTaskCenterSelectionState(input: {
  selectedTask: UnifiedTaskDetail | undefined;
  retryOverride: { provider?: string; model: string };
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
    && canContinueFront10AutoExecution(input.selectedTask),
  );
  const needsCandidateSelection = Boolean(
    input.selectedTask
    && input.selectedTask.kind === "novel_workflow"
    && requiresCandidateSelection(input.selectedTask),
  );
  const selectedTaskNotice = parseDirectorTaskNotice(input.selectedTask ? selectedTaskMeta : null);
  const selectedTaskNoticeRoute = input.selectedTask
    ? buildTaskNoticeRoute(input.selectedTask, selectedTaskNotice)
    : null;
  const selectedTaskChapterTitleWarning = isAutoDirectorTask
    ? resolveChapterTitleWarning(input.selectedTask ?? null)
    : null;
  const selectedTaskHasChapterTitleFailure = Boolean(
    input.selectedTask
    && isChapterTitleDiversitySummary(
      input.selectedTask.failureSummary ?? input.selectedTask.lastError ?? null,
    ),
  );
  const canRetryWithSelectedModel = Boolean(
    input.retryOverride.provider && input.retryOverride.model.trim(),
  );

  return {
    selectedTask: input.selectedTask,
    selectedTaskMeta,
    selectedTaskSteps,
    isAutoDirectorTask,
    isActiveAutoDirectorTask,
    canResumeFront10AutoExecution,
    needsCandidateSelection,
    selectedTaskNotice,
    selectedTaskNoticeRoute,
    selectedTaskChapterTitleWarning,
    selectedTaskFailureRepairRoute: selectedTaskChapterTitleWarning?.route ?? null,
    selectedTaskHasChapterTitleFailure,
    canRetryWithSelectedModel,
    selectedAutoDirectorFollowUp: input.selectedAutoDirectorFollowUp,
  };
}

export function createTaskCenterFollowUpActionHandler(input: {
  selectedTask: UnifiedTaskDetail | undefined;
  navigate: (target: string) => void;
  resolveInternalNavigationTarget: (value: string) => string | null;
  executeFollowUpAction: (payload: {
    taskId: string;
    actionCode: AutoDirectorMutationActionCode;
    idempotencyKey: string;
  }) => void;
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
