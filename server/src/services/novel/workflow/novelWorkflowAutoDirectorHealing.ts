import type {
  NovelWorkflowLane,
  NovelWorkflowResumeTarget,
  NovelWorkflowStage,
} from "@ai-novel/shared/types/novelWorkflow";
import { prisma } from "../../../db/prisma";
import type { DirectorWorkflowSeedPayload } from "../../director/helpers";
import {
  buildChapterDetailBundleLabel,
  buildChapterDetailBundleProgress,
  DIRECTOR_PROGRESS,
} from "../../director/progress";
import {
  normalizeDirectorRunMode,
} from "../../director/helpers";
import {
  buildDirectorAutoExecutionScopeLabel,
  normalizeDirectorAutoExecutionPlan,
  resolveDirectorAutoExecutionBookRange,
  resolveDirectorAutoExecutionRangeFromState,
  resolveDirectorAutoExecutionWorkflowState,
} from "../../director/autoExecution";
import { resolveStructuredOutlineRecoveryCursor } from "../../director/structuredOutlineRecovery";
import { isChapterTitleDiversityIssue } from "../volume/chapterTitleDiversity";
import {
  appendMilestone,
  buildNovelCreateResumeTarget,
  buildNovelEditResumeTarget,
  mergeSeedPayload,
  parseResumeTarget,
  parseSeedPayload,
  stringifyResumeTarget,
} from "./novelWorkflow.shared";
import {
  buildChapterTitleDiversityTaskNotice,
  CHECKPOINT_ITEM_LABELS,
  defaultProgressForStage,
  isChapterBatchCheckpointRow,
  isPreNovelAutoDirectorCandidateTask,
  isQueuedWorkflowItemKey,
  isStructuredOutlineItemKey,
  isTaskCancellationRequested,
  mapStageToTab,
  mergeResumeTargets,
  parseSeedResumeTarget,
  stageLabel,
} from "./novelWorkflowServiceSupport";
import {
  isHistoricalAutoDirectorFront10RecoveryUnsupportedFailure,
  isHistoricalAutoDirectorRecoveryNotNeededFailure,
} from "./novelWorkflowRecoveryHeuristics";
import { syncAutoDirectorChapterBatchCheckpoint } from "./novelWorkflowAutoDirectorReconciliation";
import { repairAutoDirectorCandidateSeedPayload } from "./novelWorkflowCandidateSeedRepair";
import {
  isStaleAutoDirectorRunningTask,
  STALE_AUTO_DIRECTOR_RUNNING_MESSAGE,
} from "./autoDirectorStaleTaskRecovery";

export interface StructuredOutlineTaskProgress {
  step: "beat_sheet" | "chapter_list" | "chapter_detail_bundle" | "chapter_sync" | "completed";
  currentItemKey: "beat_sheet" | "chapter_list" | "chapter_detail_bundle" | "chapter_sync";
  currentItemLabel: string;
  progress: number;
  scopeLabel: string;
  volumeId: string | null;
  chapterId: string | null;
}

export interface WorkflowHealingDeps {
  volumeService: {
    getVolumes(novelId: string): Promise<unknown>;
  };
  getVisibleRowByIdRaw(taskId: string): Promise<any>;
  updateTaskWithRetry(args: Parameters<typeof prisma.novelWorkflowTask.update>[0]): Promise<any>;
  markTaskFailed(taskId: string, message: string, patch?: unknown): Promise<any>;
  restoreTaskToCheckpoint(
    taskId: string,
    row?: Awaited<ReturnType<typeof prisma.novelWorkflowTask.findUnique>> | null,
  ): Promise<any>;
  buildResumeTarget(input: {
    taskId: string;
    novelId?: string | null;
    lane: NovelWorkflowLane;
    stage: NovelWorkflowStage;
    chapterId?: string | null;
    volumeId?: string | null;
  }): NovelWorkflowResumeTarget;
}

export async function resolveStructuredOutlineTaskProgress(
  deps: WorkflowHealingDeps,
  input: {
    novelId: string;
    seedPayloadJson?: string | null;
  },
): Promise<StructuredOutlineTaskProgress | null> {
  const seedPayload = parseSeedPayload<DirectorWorkflowSeedPayload>(input.seedPayloadJson);
  const runMode = normalizeDirectorRunMode(
    seedPayload?.directorInput?.runMode
    ?? seedPayload?.runMode,
  );
  const plan = normalizeDirectorAutoExecutionPlan(
    runMode === "auto_to_execution"
      ? (seedPayload?.autoExecutionPlan ?? seedPayload?.directorInput?.autoExecutionPlan)
      : undefined,
  );

  const workspace = await deps.volumeService.getVolumes(input.novelId).catch(() => null);
  if (!workspace) {
    return null;
  }
  const recoveryCursor = resolveStructuredOutlineRecoveryCursor({
    workspace: workspace as Parameters<typeof resolveStructuredOutlineRecoveryCursor>[0]["workspace"],
    plan,
  });
  if (recoveryCursor.step === "completed") {
    return null;
  }

  if (recoveryCursor.step === "beat_sheet") {
    return {
      step: "beat_sheet",
      currentItemKey: "beat_sheet",
      currentItemLabel: `正在生成第 ${recoveryCursor.volumeOrder} 卷节奏板`,
      progress: DIRECTOR_PROGRESS.beatSheet,
      scopeLabel: recoveryCursor.scopeLabel,
      volumeId: recoveryCursor.volumeId,
      chapterId: null,
    };
  }

  if (recoveryCursor.step === "chapter_list") {
    const targetLabel = recoveryCursor.beatLabel?.trim()
      ? `正在生成第 ${recoveryCursor.volumeOrder} 卷节奏段：${recoveryCursor.beatLabel.trim()}`
      : `正在生成第 ${recoveryCursor.volumeOrder} 卷章节列表`;
    return {
      step: "chapter_list",
      currentItemKey: "chapter_list",
      currentItemLabel: targetLabel,
      progress: DIRECTOR_PROGRESS.chapterList,
      scopeLabel: recoveryCursor.scopeLabel,
      volumeId: recoveryCursor.volumeId,
      chapterId: null,
    };
  }

  if (recoveryCursor.step === "chapter_sync") {
    return {
      step: "chapter_sync",
      currentItemKey: "chapter_sync",
      currentItemLabel: `${recoveryCursor.scopeLabel}细化已完成，正在同步章节执行资源`,
      progress: DIRECTOR_PROGRESS.chapterDetailDone,
      scopeLabel: recoveryCursor.scopeLabel,
      volumeId: recoveryCursor.selectedChapters[0]?.volumeId ?? null,
      chapterId: recoveryCursor.selectedChapters[0]?.id ?? null,
    };
  }

  return {
    step: "chapter_detail_bundle",
    currentItemKey: "chapter_detail_bundle",
    currentItemLabel: buildChapterDetailBundleLabel(
      (recoveryCursor.nextChapterIndex ?? 0) + 1,
      recoveryCursor.totalChapterCount,
      recoveryCursor.detailMode ?? "task_sheet",
    ),
    progress: buildChapterDetailBundleProgress(
      recoveryCursor.completedDetailSteps,
      recoveryCursor.totalDetailSteps,
    ),
    scopeLabel: recoveryCursor.scopeLabel,
    volumeId: recoveryCursor.volumeId,
    chapterId: recoveryCursor.chapterId,
  };
}

export async function healBrokenAutoDirectorCandidateSeedPayload(
  deps: WorkflowHealingDeps,
  taskId: string,
  row = null as {
    lane?: string | null;
    novelId?: string | null;
    status?: string | null;
    currentItemKey?: string | null;
    checkpointType?: string | null;
    checkpointSummary?: string | null;
    resumeTargetJson?: string | null;
    seedPayloadJson?: string | null;
  } | null,
): Promise<boolean> {
  const candidate = row ?? await deps.getVisibleRowByIdRaw(taskId);
  if (!candidate || candidate.lane !== "auto_director") {
    return false;
  }

  const repaired = repairAutoDirectorCandidateSeedPayload(candidate.seedPayloadJson);
  if (!repaired) {
    return false;
  }

  const shouldRestoreCandidateSelection = repaired.staleTargetedCandidate
    && isPreNovelAutoDirectorCandidateTask(candidate);
  await deps.updateTaskWithRetry({
    where: { id: taskId },
    data: {
      seedPayloadJson: repaired.seedPayloadJson,
      heartbeatAt: new Date(),
      status: shouldRestoreCandidateSelection ? "waiting_approval" : undefined,
      currentStage: shouldRestoreCandidateSelection ? stageLabel("auto_director") : undefined,
      currentItemKey: shouldRestoreCandidateSelection ? "auto_director" : undefined,
      currentItemLabel: shouldRestoreCandidateSelection
        ? CHECKPOINT_ITEM_LABELS.candidate_selection_required
        : undefined,
      checkpointType: shouldRestoreCandidateSelection ? "candidate_selection_required" : undefined,
      checkpointSummary: shouldRestoreCandidateSelection
        ? (candidate.checkpointSummary ?? "候选方案已恢复，请重新确认或继续微调。")
        : undefined,
      resumeTargetJson: shouldRestoreCandidateSelection
        ? stringifyResumeTarget(buildNovelCreateResumeTarget(taskId, "director"))
        : undefined,
      lastError: shouldRestoreCandidateSelection ? null : undefined,
      finishedAt: shouldRestoreCandidateSelection ? null : undefined,
      cancelRequestedAt: shouldRestoreCandidateSelection ? null : undefined,
    },
  });
  return true;
}

export async function healStaleAutoDirectorRunningTask(
  deps: WorkflowHealingDeps,
  taskId: string,
  row = null as {
    lane?: string | null;
    status?: string | null;
    currentItemKey?: string | null;
    pendingManualRecovery?: boolean | null;
    cancelRequestedAt?: Date | null;
    heartbeatAt?: Date | null;
    updatedAt?: Date | null;
  } | null,
): Promise<boolean> {
  const candidate = row ?? await deps.getVisibleRowByIdRaw(taskId);
  if (!candidate || !isStaleAutoDirectorRunningTask(candidate)) {
    return false;
  }
  await deps.markTaskFailed(taskId, STALE_AUTO_DIRECTOR_RUNNING_MESSAGE);
  return true;
}

export async function healStaleAutoDirectorQueuedProgress(
  deps: WorkflowHealingDeps,
  taskId: string,
  row = null as {
    lane?: string | null;
    status?: string | null;
    currentItemKey?: string | null;
    checkpointType?: string | null;
    checkpointSummary?: string | null;
    heartbeatAt?: Date | null;
    lastError?: string | null;
    cancelRequestedAt?: Date | null;
  } | null,
): Promise<boolean> {
  const candidate = row ?? await deps.getVisibleRowByIdRaw(taskId);
  if (!candidate || candidate.lane !== "auto_director" || isTaskCancellationRequested(candidate)) {
    return false;
  }

  const shouldPromoteToRunning = candidate.status === "queued"
    && !isQueuedWorkflowItemKey(candidate.currentItemKey);
  const hasStaleCandidateCheckpoint = candidate.checkpointType === "candidate_selection_required"
    && !isPreNovelAutoDirectorCandidateTask({
      lane: candidate.lane,
      novelId: candidate.novelId ?? null,
      checkpointType: candidate.checkpointType,
      currentItemKey: candidate.currentItemKey,
      seedPayloadJson: candidate.seedPayloadJson,
    });

  if (!shouldPromoteToRunning && !hasStaleCandidateCheckpoint) {
    return false;
  }

  await deps.updateTaskWithRetry({
    where: { id: taskId },
    data: {
      status: shouldPromoteToRunning ? "running" : undefined,
      checkpointType: hasStaleCandidateCheckpoint ? null : undefined,
      checkpointSummary: hasStaleCandidateCheckpoint ? null : undefined,
      heartbeatAt: candidate.heartbeatAt ?? new Date(),
      finishedAt: shouldPromoteToRunning ? null : undefined,
      cancelRequestedAt: shouldPromoteToRunning ? null : undefined,
      lastError: shouldPromoteToRunning && candidate.lastError?.includes("恢复失败")
        ? null
        : undefined,
    },
  });
  return true;
}

export async function healHistoricalAutoDirectorRecoveryFailure(
  deps: WorkflowHealingDeps,
  taskId: string,
  row = null as {
    lane?: string | null;
    status?: string | null;
    checkpointType?: string | null;
    lastError?: string | null;
  } | null,
): Promise<boolean> {
  const candidate = row ?? await deps.getVisibleRowByIdRaw(taskId);
  if (!candidate || !isHistoricalAutoDirectorRecoveryNotNeededFailure(candidate)) {
    return false;
  }
  const existing = await deps.getVisibleRowByIdRaw(taskId);
  if (!existing) {
    return false;
  }
  await deps.restoreTaskToCheckpoint(taskId, existing);
  return true;
}

export async function healHistoricalAutoDirectorFront10RecoveryFailure(
  deps: WorkflowHealingDeps,
  taskId: string,
  row = null as {
    lane?: string | null;
    status?: string | null;
    novelId?: string | null;
    seedPayloadJson?: string | null;
    checkpointType?: string | null;
    progress?: number | null;
    lastError?: string | null;
  } | null,
): Promise<boolean> {
  const candidate = row ?? await deps.getVisibleRowByIdRaw(taskId);
  if (!candidate || !isHistoricalAutoDirectorFront10RecoveryUnsupportedFailure(candidate)) {
    return false;
  }

  const existing = await deps.getVisibleRowByIdRaw(taskId);
  if (!existing) {
    return false;
  }

  const seedPayload = parseSeedPayload<DirectorWorkflowSeedPayload>(existing.seedPayloadJson);
  const directorSession = seedPayload?.directorSession;
  const autoExecution = seedPayload?.autoExecution;
  const pipelineJobId = autoExecution?.pipelineJobId?.trim();
  if (
    !existing.novelId
    || !autoExecution
    || !pipelineJobId
    || directorSession?.phase !== "front10_ready"
  ) {
    return false;
  }

  const job = await prisma.generationJob.findUnique({
    where: { id: pipelineJobId },
    select: {
      id: true,
      status: true,
      progress: true,
      currentStage: true,
      currentItemLabel: true,
      payload: true,
    },
  });
  if (!job || (job.status !== "queued" && job.status !== "running")) {
    return false;
  }

  const chapters = autoExecution.mode === "book"
    ? await prisma.chapter.findMany({
        where: { novelId: existing.novelId },
        orderBy: { order: "asc" },
        select: { id: true, order: true },
      })
    : [];
  const range = autoExecution.mode === "book"
    ? resolveDirectorAutoExecutionBookRange(chapters)
    : resolveDirectorAutoExecutionRangeFromState(autoExecution);
  if (!range) {
    return false;
  }

  const runningState = resolveDirectorAutoExecutionWorkflowState({
    progress: job.progress,
    currentStage: job.currentStage,
    currentItemLabel: job.currentItemLabel,
    payload: job.payload,
  }, range, autoExecution);
  const nextResumeTarget = buildNovelEditResumeTarget({
    novelId: existing.novelId,
    taskId,
    stage: runningState.stage === "quality_repair" ? "pipeline" : "chapter",
    chapterId: autoExecution?.nextChapterId ?? autoExecution?.firstChapterId ?? null,
  });

  await deps.updateTaskWithRetry({
    where: { id: taskId },
    data: {
      status: job.status === "queued" ? "queued" : "running",
      progress: Math.max(existing.progress ?? 0, runningState.progress ?? defaultProgressForStage(runningState.stage)),
      currentStage: stageLabel(runningState.stage),
      currentItemKey: runningState.itemKey,
      currentItemLabel: runningState.itemLabel,
      checkpointType: null,
      checkpointSummary: null,
      resumeTargetJson: stringifyResumeTarget(nextResumeTarget),
      heartbeatAt: new Date(),
      finishedAt: null,
      cancelRequestedAt: null,
      lastError: null,
    },
  });
  return true;
}

export async function healChapterTitleDiversitySoftFailure(
  deps: WorkflowHealingDeps,
  taskId: string,
  row = null as {
    lane?: string | null;
    novelId?: string | null;
    status?: string | null;
    currentItemKey?: string | null;
    currentItemLabel?: string | null;
    resumeTargetJson?: string | null;
    seedPayloadJson?: string | null;
    lastError?: string | null;
  } | null,
): Promise<boolean> {
  const candidate = row ?? await deps.getVisibleRowByIdRaw(taskId);
  const issue = candidate?.lastError?.trim() || "";
  if (
    !candidate
    || candidate.lane !== "auto_director"
    || candidate.status !== "failed"
    || !isChapterTitleDiversityIssue(issue)
  ) {
    return false;
  }

  const existing = await deps.getVisibleRowByIdRaw(taskId);
  if (!existing) {
    return false;
  }

  const resumeTarget = mergeResumeTargets(
    parseResumeTarget(existing.resumeTargetJson),
    parseSeedResumeTarget(existing.seedPayloadJson),
  );
  const notice = buildChapterTitleDiversityTaskNotice({
    issue,
    volumeId: resumeTarget?.volumeId ?? null,
  });
  const nextResumeTarget = (resumeTarget && resumeTarget.stage !== "basic")
    ? {
      ...resumeTarget,
      volumeId: resumeTarget.volumeId ?? notice.action.volumeId ?? null,
    }
    : buildNovelEditResumeTarget({
      novelId: existing.novelId ?? resumeTarget?.novelId ?? "",
      taskId,
      stage: "structured",
      volumeId: resumeTarget?.volumeId ?? notice.action.volumeId ?? null,
    });

  await deps.updateTaskWithRetry({
    where: { id: taskId },
    data: {
      status: "waiting_approval",
      currentStage: stageLabel("structured_outline"),
      currentItemKey: existing.currentItemKey ?? "chapter_list",
      currentItemLabel: "章节列表已生成，但标题结构仍需分散",
      checkpointType: null,
      checkpointSummary: null,
      resumeTargetJson: stringifyResumeTarget(nextResumeTarget),
      seedPayloadJson: mergeSeedPayload(existing.seedPayloadJson, {
        taskNotice: notice,
      }),
      heartbeatAt: new Date(),
      finishedAt: null,
      cancelRequestedAt: null,
      lastError: null,
    },
  });
  return true;
}

export async function healStaleAutoDirectorStructuredOutlineProgress(
  deps: WorkflowHealingDeps,
  taskId: string,
  row = null as {
    novelId?: string | null;
    lane?: string | null;
    status?: string | null;
    currentStage?: string | null;
    currentItemKey?: string | null;
    currentItemLabel?: string | null;
    checkpointType?: string | null;
    progress?: number | null;
    seedPayloadJson?: string | null;
    cancelRequestedAt?: Date | null;
  } | null,
): Promise<boolean> {
  const candidate = row ?? await deps.getVisibleRowByIdRaw(taskId);
  if (
    !candidate
    || candidate.lane !== "auto_director"
    || !candidate.novelId
    || candidate.status !== "running"
    || candidate.checkpointType
    || isTaskCancellationRequested(candidate)
    || (!isStructuredOutlineItemKey(candidate.currentItemKey) && candidate.currentStage !== stageLabel("structured_outline"))
  ) {
    return false;
  }

  const progressState = await resolveStructuredOutlineTaskProgress(deps, {
    novelId: candidate.novelId,
    seedPayloadJson: candidate.seedPayloadJson,
  });
  if (!progressState) {
    return false;
  }

  if (
    candidate.currentItemKey === progressState.currentItemKey
    && candidate.currentItemLabel === progressState.currentItemLabel
    && typeof candidate.progress === "number"
    && Math.abs(candidate.progress - progressState.progress) < 0.0001
  ) {
    return false;
  }

  await deps.updateTaskWithRetry({
    where: { id: taskId },
    data: {
      currentStage: stageLabel("structured_outline"),
      currentItemKey: progressState.currentItemKey,
      currentItemLabel: progressState.currentItemLabel,
      progress: Math.max(candidate.progress ?? 0, progressState.progress),
      resumeTargetJson: stringifyResumeTarget(deps.buildResumeTarget({
        taskId,
        novelId: candidate.novelId,
        lane: "auto_director",
        stage: "structured_outline",
        chapterId: progressState.chapterId,
        volumeId: progressState.volumeId,
      })),
      heartbeatAt: new Date(),
    },
  });
  return true;
}

export async function healAutoDirectorTaskState(
  deps: WorkflowHealingDeps,
  taskId: string,
  row = null as {
    title?: string | null;
    novelId?: string | null;
    lane?: string | null;
    status?: string | null;
    progress?: number | null;
    currentStage?: string | null;
    currentItemKey?: string | null;
    currentItemLabel?: string | null;
    checkpointType?: string | null;
    checkpointSummary?: string | null;
    resumeTargetJson?: string | null;
    seedPayloadJson?: string | null;
    heartbeatAt?: Date | null;
    finishedAt?: Date | null;
    milestonesJson?: string | null;
    lastError?: string | null;
    cancelRequestedAt?: Date | null;
  } | null,
): Promise<boolean> {
  if (isTaskCancellationRequested(row)) {
    return false;
  }
  const brokenSeedHealed = await healBrokenAutoDirectorCandidateSeedPayload(deps, taskId, row);
  const normalizedRow = brokenSeedHealed ? await deps.getVisibleRowByIdRaw(taskId) : row;
  if (isTaskCancellationRequested(normalizedRow)) {
    return false;
  }
  const queuedHealed = await healStaleAutoDirectorQueuedProgress(deps, taskId, normalizedRow);
  const historicalHealed = await healHistoricalAutoDirectorRecoveryFailure(deps, taskId, normalizedRow);
  const front10Healed = await healHistoricalAutoDirectorFront10RecoveryFailure(deps, taskId, normalizedRow);
  const titleDiversityHealed = await healChapterTitleDiversitySoftFailure(deps, taskId, normalizedRow);
  const structuredOutlineHealed = await healStaleAutoDirectorStructuredOutlineProgress(deps, taskId, normalizedRow);
  const staleRunningHealed = await healStaleAutoDirectorRunningTask(deps, taskId, normalizedRow);
  const checkpointRow = (brokenSeedHealed || queuedHealed || historicalHealed || front10Healed || titleDiversityHealed || structuredOutlineHealed || staleRunningHealed)
    ? await deps.getVisibleRowByIdRaw(taskId)
    : (normalizedRow ?? await deps.getVisibleRowByIdRaw(taskId));
  const checkpointHealed = isChapterBatchCheckpointRow(checkpointRow)
    ? await syncAutoDirectorChapterBatchCheckpoint({
      taskId,
      row: checkpointRow,
    })
    : false;
  return brokenSeedHealed
    || queuedHealed
    || historicalHealed
    || front10Healed
    || titleDiversityHealed
    || structuredOutlineHealed
    || staleRunningHealed
    || checkpointHealed;
}
