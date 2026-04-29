import type {
  DirectorAutoExecutionState,
  DirectorConfirmRequest,
  DirectorQualityRepairRisk,
} from "@ai-novel/shared/types/novelDirector";
import type { PipelineJobStatus } from "@ai-novel/shared/types/novel";
import type { NovelWorkflowCheckpoint } from "@ai-novel/shared/types/novelWorkflow";
import { buildNovelEditResumeTarget } from "../workflow/novelWorkflow.shared";
import {
  buildDirectorAutoExecutionCompletedLabel,
  buildDirectorAutoExecutionCompletedSummary,
  buildDirectorAutoExecutionPausedLabel,
  buildDirectorAutoExecutionPausedSummary,
  buildDirectorAutoExecutionScopeLabelFromState,
  type DirectorAutoExecutionRange,
} from "./novelDirectorAutoExecution";
import { buildDirectorSessionState } from "./novelDirectorHelpers";
import { PIPELINE_REPLAN_NOTICE_CODE, parsePipelinePayload } from "../pipelineJobState";
import { buildDirectorQualityRepairRisk } from "./novelDirectorQualityRepairRisk";

export type AutoExecutionResumeStage = "chapter" | "pipeline";

export interface AutoExecutionWorkflowCheckpointPort {
  bootstrapTask(input: {
    workflowTaskId: string;
    novelId: string;
    lane: "auto_director";
    title: string;
    seedPayload?: Record<string, unknown>;
  }): Promise<unknown>;
  recordCheckpoint(taskId: string, input: {
    stage: "quality_repair";
    checkpointType: "workflow_completed" | "chapter_batch_ready" | "replan_required";
    checkpointSummary: string;
    itemLabel: string;
    progress?: number;
    chapterId?: string | null;
    seedPayload?: Record<string, unknown>;
  }): Promise<unknown>;
}

export interface AutoExecutionCheckpointRuntimeDeps {
  workflowService: AutoExecutionWorkflowCheckpointPort;
  buildDirectorSeedPayload: (
    input: DirectorConfirmRequest,
    novelId: string,
    extra?: Record<string, unknown>,
  ) => Record<string, unknown>;
  shouldAutoContinueQualityRepair?: (input: {
    request: DirectorConfirmRequest;
    qualityRepairRisk: DirectorQualityRepairRisk;
    remainingChapterCount: number;
  }) => Promise<boolean> | boolean;
  recordAutoApproval?: (input: {
    taskId: string;
    checkpointType: NovelWorkflowCheckpoint;
    qualityRepairRisk: DirectorQualityRepairRisk;
    checkpointSummary?: string | null;
  }) => Promise<unknown>;
}

export interface AutoExecutionCheckpointBaseInput {
  taskId: string;
  novelId: string;
  request: DirectorConfirmRequest;
  range: DirectorAutoExecutionRange;
  autoExecution: DirectorAutoExecutionState;
}

export async function syncAutoExecutionTaskState(
  deps: AutoExecutionCheckpointRuntimeDeps,
  input: AutoExecutionCheckpointBaseInput & {
    isBackgroundRunning: boolean;
    resumeStage?: AutoExecutionResumeStage;
  },
): Promise<void> {
  const directorSession = buildDirectorSessionState({
    runMode: input.request.runMode,
    phase: "front10_ready",
    isBackgroundRunning: input.isBackgroundRunning,
  });
  const resumeTarget = buildNovelEditResumeTarget({
    novelId: input.novelId,
    taskId: input.taskId,
    stage: input.resumeStage ?? "pipeline",
    chapterId: input.autoExecution.nextChapterId ?? input.range.firstChapterId,
  });
  await deps.workflowService.bootstrapTask({
    workflowTaskId: input.taskId,
    novelId: input.novelId,
    lane: "auto_director",
    title: input.request.candidate.workingTitle,
    seedPayload: deps.buildDirectorSeedPayload(input.request, input.novelId, {
      directorSession,
      resumeTarget,
      autoExecution: input.autoExecution,
    }),
  });
}

export async function recordCompletedCheckpoint(
  deps: AutoExecutionCheckpointRuntimeDeps,
  input: AutoExecutionCheckpointBaseInput & {
    pipelineJobId?: string | null;
    pipelineStatus?: PipelineJobStatus | null;
  },
): Promise<void> {
  const completedState = {
    ...input.autoExecution,
    pipelineJobId: input.pipelineJobId ?? input.autoExecution.pipelineJobId ?? null,
    pipelineStatus: input.pipelineStatus ?? input.autoExecution.pipelineStatus ?? null,
  };
  const scopeLabel = buildDirectorAutoExecutionScopeLabelFromState(completedState, input.range.totalChapterCount);
  await deps.workflowService.recordCheckpoint(input.taskId, {
    stage: "quality_repair",
    checkpointType: "workflow_completed",
    checkpointSummary: buildDirectorAutoExecutionCompletedSummary({
      title: input.request.candidate.workingTitle.trim() || input.request.title?.trim() || "当前项目",
      scopeLabel,
      autoReview: completedState.autoReview,
      autoRepair: completedState.autoRepair,
    }),
    itemLabel: buildDirectorAutoExecutionCompletedLabel(scopeLabel),
    progress: 1,
    chapterId: completedState.firstChapterId ?? input.range.firstChapterId,
    seedPayload: deps.buildDirectorSeedPayload(input.request, input.novelId, {
      directorSession: buildDirectorSessionState({
        runMode: input.request.runMode,
        phase: "front10_ready",
        isBackgroundRunning: false,
      }),
      resumeTarget: buildNovelEditResumeTarget({
        novelId: input.novelId,
        taskId: input.taskId,
        stage: "pipeline",
        chapterId: completedState.firstChapterId ?? input.range.firstChapterId,
      }),
      autoExecution: completedState,
    }),
  });
}

export async function recordQualityRepairCheckpoint(
  deps: AutoExecutionCheckpointRuntimeDeps,
  input: AutoExecutionCheckpointBaseInput & {
    pipelineJobId: string;
    pipelineStatus: PipelineJobStatus;
    checkpointType: "chapter_batch_ready" | "replan_required";
    pauseMessage: string;
    qualityRepairRisk: DirectorQualityRepairRisk;
  },
): Promise<DirectorAutoExecutionState> {
  const checkpointState = {
    ...input.autoExecution,
    pipelineJobId: input.pipelineJobId,
    pipelineStatus: input.pipelineStatus,
    qualityRepairRisk: input.qualityRepairRisk,
  };
  const scopeLabel = buildDirectorAutoExecutionScopeLabelFromState(checkpointState, input.range.totalChapterCount);
  const pauseMessage = input.checkpointType === "replan_required"
    ? input.pauseMessage
    : input.qualityRepairRisk.reason;
  await deps.workflowService.recordCheckpoint(input.taskId, {
    stage: "quality_repair",
    checkpointType: input.checkpointType,
    itemLabel: input.checkpointType === "replan_required"
      ? `${scopeLabel}等待处理重规划建议`
      : buildDirectorAutoExecutionPausedLabel(checkpointState),
    checkpointSummary: buildDirectorAutoExecutionPausedSummary({
      scopeLabel,
      remainingChapterCount: checkpointState.remainingChapterCount ?? 0,
      nextChapterOrder: checkpointState.nextChapterOrder ?? null,
      failureMessage: pauseMessage,
    }),
    chapterId: checkpointState.nextChapterId ?? input.range.firstChapterId,
    progress: 0.98,
    seedPayload: deps.buildDirectorSeedPayload(input.request, input.novelId, {
      directorSession: buildDirectorSessionState({
        runMode: input.request.runMode,
        phase: "front10_ready",
        isBackgroundRunning: false,
      }),
      resumeTarget: buildNovelEditResumeTarget({
        novelId: input.novelId,
        taskId: input.taskId,
        stage: "pipeline",
        chapterId: checkpointState.nextChapterId ?? input.range.firstChapterId,
      }),
      autoExecution: checkpointState,
    }),
  });
  return checkpointState;
}

export async function resolveQualityRepairNoticeAction(
  deps: AutoExecutionCheckpointRuntimeDeps,
  input: AutoExecutionCheckpointBaseInput & {
    pipelineJobId: string;
    pipelineStatus: PipelineJobStatus;
    noticeCode?: string | null;
    noticeSummary: string;
    payload?: string | null;
  },
): Promise<{
  action: "auto_continue" | "pause";
  checkpointType: "chapter_batch_ready" | "replan_required";
  checkpointState: DirectorAutoExecutionState;
  qualityRepairRisk: DirectorQualityRepairRisk;
}> {
  const isLegacyReplanNotice = input.noticeCode === PIPELINE_REPLAN_NOTICE_CODE;
  const checkpointType = "chapter_batch_ready";
  const qualityRepairRisk = buildDirectorQualityRepairRisk({
    noticeCode: input.noticeCode,
    noticeSummary: input.noticeSummary,
    payload: input.payload,
    remainingChapterCount: input.autoExecution.remainingChapterCount ?? 0,
    totalChapterCount: input.range.totalChapterCount,
  });
  const checkpointState = {
    ...input.autoExecution,
    pipelineJobId: input.pipelineJobId,
    pipelineStatus: input.pipelineStatus,
    qualityRepairRisk,
  };
  const remainingChapterCount = checkpointState.remainingChapterCount ?? 0;
  const isAiDriverExecution = input.request.runMode === "auto_to_execution";
  const hasQualityAlertDetails = (parsePipelinePayload(input.payload).qualityAlertDetails?.length ?? 0) > 0;
  const shouldNotifyAndContinueAiDriverQualityNotice = checkpointType === "chapter_batch_ready"
    && qualityRepairRisk.autoContinuable
    && isAiDriverExecution
    && (hasQualityAlertDetails || isLegacyReplanNotice);
  const canAutoContinue = checkpointType === "chapter_batch_ready"
    && qualityRepairRisk.autoContinuable
    && remainingChapterCount > 0
    && (
      shouldNotifyAndContinueAiDriverQualityNotice
      || await deps.shouldAutoContinueQualityRepair?.({
        request: input.request,
        qualityRepairRisk,
        remainingChapterCount,
      })
    );

  if (canAutoContinue || shouldNotifyAndContinueAiDriverQualityNotice) {
    await deps.recordAutoApproval?.({
      taskId: input.taskId,
      checkpointType,
      qualityRepairRisk,
      checkpointSummary: input.noticeSummary,
    });
  }

  if (canAutoContinue) {
    return {
      action: "auto_continue",
      checkpointType,
      checkpointState,
      qualityRepairRisk,
    };
  }

  if (shouldNotifyAndContinueAiDriverQualityNotice) {
    return {
      action: "auto_continue",
      checkpointType,
      checkpointState,
      qualityRepairRisk,
    };
  }

  return {
    action: "pause",
    checkpointType,
    checkpointState,
    qualityRepairRisk,
  };
}
