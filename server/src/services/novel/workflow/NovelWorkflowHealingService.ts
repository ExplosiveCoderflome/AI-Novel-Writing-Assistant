import { prisma } from "../../../db/prisma";
import { isDirectorAutoExecutionRunMode } from "@ai-novel/shared/types/novelDirector";
import { buildChapterDetailBundleLabel, buildChapterDetailBundleProgress, DIRECTOR_PROGRESS } from "../director/novelDirectorProgress";
import {
  normalizeDirectorRunMode,
  type DirectorWorkflowSeedPayload,
} from "../director/novelDirectorHelpers";
import {
  buildDirectorAutoExecutionScopeLabel,
  normalizeDirectorAutoExecutionPlan,
  resolveDirectorAutoExecutionBookRange,
  resolveDirectorAutoExecutionRangeFromState,
  resolveDirectorAutoExecutionWorkflowState,
} from "../director/automation/novelDirectorAutoExecution";
import { resolveStructuredOutlineRecoveryCursor } from "../director/novelDirectorStructuredOutlineRecovery";
import { isChapterTitleDiversityIssue } from "../volume/chapterTitleDiversity";
import { NovelWorkflowStoreService } from "./NovelWorkflowStoreService";
import {
  buildChapterTitleDiversityTaskNotice,
  defaultProgressForStage,
  isChapterBatchCheckpointRow,
  isCandidateSelectionItemKey,
  isHistoricalAutoDirectorFront10RecoveryUnsupportedFailure,
  isHistoricalAutoDirectorRecoveryNotNeededFailure,
  isStructuredOutlineItemKey,
  isQueuedWorkflowItemKey,
  isTaskCancellationRequested,
  mergeResumeTargets,
  parseRuntimeGateReason,
  parseSeedResumeTarget,
  resolveCheckpointItemLabelFromRow,
  resolveCheckpointStageFromRow,
  stageLabel,
  isPreNovelAutoDirectorCandidateTask,
} from "./novelWorkflow.helpers";
import { buildRestoreTaskToCheckpointResult } from "./novelWorkflowCheckpoint";
import {
  STALE_AUTO_DIRECTOR_RUNNING_MESSAGE,
  isStaleAutoDirectorRunningTask,
} from "./autoDirectorStaleTaskRecovery";
import {
  resolveActiveAutoDirectorAutoExecution,
  syncActiveAutoDirectorAutoExecutionTaskState,
  syncAutoDirectorChapterBatchCheckpoint,
} from "./novelWorkflowAutoDirectorReconciliation";
import { repairAutoDirectorCandidateSeedPayload } from "./novelWorkflowCandidateSeedRepair";
import { buildNovelCreateResumeTarget, mergeSeedPayload, parseResumeTarget, stringifyResumeTarget, parseSeedPayload } from "./novelWorkflow.shared";

type AutoDirectorNovelTaskRow = {
  lane?: string | null;
  novelId?: string | null;
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
  pendingManualRecovery?: boolean | null;
  updatedAt?: Date | null;
  title?: string | null;
  novel?: { title?: string | null } | null;
};

export class NovelWorkflowHealingService {
  constructor(private readonly workflow: NovelWorkflowStoreService) {}

  private async resolveStructuredOutlineTaskProgress(input: {
    novelId: string;
    seedPayloadJson?: string | null;
  }): Promise<{
    step: "beat_sheet" | "chapter_list" | "chapter_detail_bundle" | "chapter_sync" | "completed";
    currentItemKey: "beat_sheet" | "chapter_list" | "chapter_detail_bundle" | "chapter_sync";
    currentItemLabel: string;
    progress: number;
    scopeLabel: string;
    volumeId: string | null;
    chapterId: string | null;
  } | null> {
    const seedPayload = parseSeedPayload<DirectorWorkflowSeedPayload>(input.seedPayloadJson);
    const runMode = normalizeDirectorRunMode(
      seedPayload?.directorInput?.runMode
      ?? seedPayload?.runMode,
    );
    const plan = normalizeDirectorAutoExecutionPlan(
      isDirectorAutoExecutionRunMode(runMode)
        ? (seedPayload?.autoExecutionPlan ?? seedPayload?.directorInput?.autoExecutionPlan)
        : undefined,
    );

    const workspace = await this.workflow.volumeService.getVolumes(input.novelId).catch(() => null);
    if (!workspace) {
      return null;
    }
    const recoveryCursor = resolveStructuredOutlineRecoveryCursor({
      workspace,
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

  public async healBrokenAutoDirectorCandidateSeedPayload(
    taskId: string,
    row = null as AutoDirectorNovelTaskRow | null,
  ): Promise<boolean> {
    const candidate = row ?? await this.workflow.getTaskByIdWithoutHealing(taskId);
    if (!candidate || candidate.lane !== "auto_director") {
      return false;
    }

    const repaired = repairAutoDirectorCandidateSeedPayload(candidate.seedPayloadJson);
    if (!repaired) {
      return false;
    }

    const shouldRestoreCandidateSelection = repaired.staleTargetedCandidate
      && isPreNovelAutoDirectorCandidateTask(candidate);
    await this.workflow.updateTaskWithRetry({
      where: { id: taskId },
      data: {
        seedPayloadJson: repaired.seedPayloadJson,
        heartbeatAt: new Date(),
        status: shouldRestoreCandidateSelection ? "waiting_approval" : undefined,
        currentStage: shouldRestoreCandidateSelection ? stageLabel("auto_director") : undefined,
        currentItemKey: shouldRestoreCandidateSelection ? "auto_director" : undefined,
        currentItemLabel: shouldRestoreCandidateSelection
          ? "等待确认书级方向"
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

  public async healAutoDirectorTaskState(
    taskId: string,
    row = null as AutoDirectorNovelTaskRow | null,
  ): Promise<boolean> {
    if (isTaskCancellationRequested(row)) {
      return false;
    }
    if (row?.pendingManualRecovery) {
      return false;
    }
    const brokenSeedHealed = await this.healBrokenAutoDirectorCandidateSeedPayload(taskId, row);
    const normalizedRow = brokenSeedHealed ? await this.workflow.getTaskByIdWithoutHealing(taskId) : row;
    if (isTaskCancellationRequested(normalizedRow)) {
      return false;
    }
    const queuedHealed = await this.healStaleAutoDirectorQueuedProgress(taskId, normalizedRow);
    const activeAutoExecutionSync = await syncActiveAutoDirectorAutoExecutionTaskState({
      taskId,
      row: normalizedRow ?? await this.workflow.getTaskByIdWithoutHealing(taskId) ?? {},
    });
    const historicalHealed = activeAutoExecutionSync.active
      ? false
      : await this.healHistoricalAutoDirectorRecoveryFailure(taskId, normalizedRow);
    const legacyRangeHealed = activeAutoExecutionSync.active
      ? false
      : await this.healHistoricalAutoDirectorFront10RecoveryFailure(taskId, normalizedRow);
    const titleDiversityHealed = activeAutoExecutionSync.active
      ? false
      : await this.healChapterTitleDiversitySoftFailure(taskId, normalizedRow);
    const structuredOutlineHealed = activeAutoExecutionSync.active
      ? false
      : await this.healStaleAutoDirectorStructuredOutlineProgress(taskId, normalizedRow);
    const runtimeGateHealed = activeAutoExecutionSync.active
      ? false
      : await this.healRuntimeGateApprovalState(taskId, normalizedRow);
    const runtimeFailureHealed = activeAutoExecutionSync.active
      ? false
      : await this.healRuntimeFailedState(taskId, normalizedRow);
    const staleRunningHealed = activeAutoExecutionSync.active
      ? false
      : await this.healStaleAutoDirectorRunningTask(taskId, normalizedRow);
    const checkpointRow = (brokenSeedHealed || queuedHealed || activeAutoExecutionSync.healed || historicalHealed || legacyRangeHealed || titleDiversityHealed || structuredOutlineHealed || runtimeGateHealed || runtimeFailureHealed || staleRunningHealed)
      ? await this.workflow.getTaskByIdWithoutHealing(taskId)
      : (normalizedRow ?? await this.workflow.getTaskByIdWithoutHealing(taskId));
    const checkpointHealed = isChapterBatchCheckpointRow(checkpointRow)
      ? await syncAutoDirectorChapterBatchCheckpoint({
        taskId,
        row: checkpointRow,
      })
      : false;
    return brokenSeedHealed || queuedHealed || activeAutoExecutionSync.healed || historicalHealed || legacyRangeHealed || titleDiversityHealed || structuredOutlineHealed || runtimeGateHealed || runtimeFailureHealed || staleRunningHealed || checkpointHealed;
  }

  public async healRuntimeGateApprovalState(
    taskId: string,
    row = null as AutoDirectorNovelTaskRow | null,
  ): Promise<boolean> {
    const candidate = row ?? await this.workflow.getTaskByIdWithoutHealing(taskId);
    if (
      !candidate
      || candidate.lane !== "auto_director"
      || candidate.status !== "running"
      || candidate.pendingManualRecovery
      || isTaskCancellationRequested(candidate)
    ) {
      return false;
    }
    const activeCommand = await prisma.directorRunCommand.findFirst({
      where: {
        taskId,
        status: { in: ["queued", "leased", "running"] },
      },
      select: { id: true },
    });
    if (activeCommand) {
      return false;
    }
    if (await resolveActiveAutoDirectorAutoExecution({ taskId, row: candidate })) {
      return false;
    }
    const latestStep = await prisma.directorStepRun.findFirst({
      where: { taskId },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      select: {
        status: true,
        label: true,
        policyDecisionJson: true,
      },
    });
    if (!latestStep || (latestStep.status !== "waiting_approval" && latestStep.status !== "blocked_scope")) {
      return false;
    }
    const reason = parseRuntimeGateReason(latestStep.policyDecisionJson)
      ?? candidate.checkpointSummary
      ?? "当前自动导演步骤需要确认后继续。";
    await this.workflow.updateTaskWithRetry({
      where: { id: taskId },
      data: {
        status: "waiting_approval",
        currentItemLabel: candidate.currentItemLabel?.trim() || latestStep.label,
        checkpointSummary: reason,
        heartbeatAt: new Date(),
        finishedAt: null,
        lastError: null,
        cancelRequestedAt: null,
      },
    });
    return true;
  }

  public async healRuntimeFailedState(
    taskId: string,
    row = null as AutoDirectorNovelTaskRow | null,
  ): Promise<boolean> {
    const candidate = row ?? await this.workflow.getTaskByIdWithoutHealing(taskId);
    if (
      !candidate
      || candidate.lane !== "auto_director"
      || candidate.status !== "running"
      || candidate.pendingManualRecovery
      || isTaskCancellationRequested(candidate)
    ) {
      return false;
    }
    const activeCommand = await prisma.directorRunCommand.findFirst({
      where: {
        taskId,
        status: { in: ["queued", "leased", "running"] },
      },
      select: { id: true },
    });
    if (activeCommand) {
      return false;
    }
    if (await resolveActiveAutoDirectorAutoExecution({ taskId, row: candidate })) {
      return false;
    }
    const latestStep = await prisma.directorStepRun.findFirst({
      where: { taskId },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      select: {
        status: true,
        label: true,
        error: true,
        finishedAt: true,
      },
    });
    if (!latestStep || latestStep.status !== "failed") {
      return false;
    }
    const message = latestStep.error?.trim()
      || candidate.lastError?.trim()
      || candidate.checkpointSummary?.trim()
      || "自动导演步骤失败，请检查后重试或继续。";
    await this.workflow.updateTaskWithRetry({
      where: { id: taskId },
      data: {
        status: "failed",
        currentItemLabel: candidate.currentItemLabel?.trim() || latestStep.label,
        checkpointSummary: message,
        heartbeatAt: new Date(),
        finishedAt: latestStep.finishedAt ?? new Date(),
        lastError: message,
        cancelRequestedAt: null,
      },
    });
    return true;
  }

  public async healStaleAutoDirectorRunningTask(
    taskId: string,
    row = null as AutoDirectorNovelTaskRow | null,
  ): Promise<boolean> {
    const candidate = row ?? await this.workflow.getTaskByIdWithoutHealing(taskId);
    if (!candidate || !isStaleAutoDirectorRunningTask(candidate)) {
      return false;
    }
    const existing = await this.workflow.getTaskByIdWithoutHealing(taskId);
    if (!existing || !isStaleAutoDirectorRunningTask(existing)) {
      return false;
    }
    const resumeTarget = parseResumeTarget(existing.resumeTargetJson) ?? this.workflow.buildResumeTarget({
      taskId,
      novelId: existing.novelId,
      lane: existing.lane ?? "auto_director",
      stage: "auto_director",
    });
    await this.workflow.updateWorkflowTaskWithNotifications({
      before: existing,
      data: {
        status: "failed",
        finishedAt: new Date(),
        heartbeatAt: new Date(),
        resumeTargetJson: stringifyResumeTarget(resumeTarget),
        lastError: STALE_AUTO_DIRECTOR_RUNNING_MESSAGE,
      },
    });
    return true;
  }

  public async healStaleAutoDirectorQueuedProgress(
    taskId: string,
    row = null as AutoDirectorNovelTaskRow | null,
  ): Promise<boolean> {
    const candidate = row ?? await this.workflow.getTaskByIdWithoutHealing(taskId);
    if (!candidate || candidate.lane !== "auto_director" || isTaskCancellationRequested(candidate)) {
      return false;
    }

    const shouldPromoteToRunning = candidate.status === "queued"
      && !isQueuedWorkflowItemKey(candidate.currentItemKey);
    const hasStaleCandidateCheckpoint = candidate.checkpointType === "candidate_selection_required"
      && !isCandidateSelectionItemKey(candidate.currentItemKey);

    if (!shouldPromoteToRunning && !hasStaleCandidateCheckpoint) {
      return false;
    }

    await this.workflow.updateTaskWithRetry({
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

  public async healHistoricalAutoDirectorRecoveryFailure(
    taskId: string,
    row = null as AutoDirectorNovelTaskRow | null,
  ): Promise<boolean> {
    const candidate = row ?? await this.workflow.getTaskByIdWithoutHealing(taskId);
    if (!candidate || !isHistoricalAutoDirectorRecoveryNotNeededFailure(candidate)) {
      return false;
    }
    const existing = await this.workflow.getTaskByIdWithoutHealing(taskId);
    if (!existing) {
      return false;
    }
    const restored = buildRestoreTaskToCheckpointResult({
      taskId,
      existing,
      buildResumeTarget: (params) => this.workflow.buildResumeTarget(params),
    });
    if (!restored) {
      return false;
    }
    await this.workflow.updateWorkflowTaskWithNotifications({
      before: existing as never,
      data: restored.data,
    });
    return true;
  }

  public async healHistoricalAutoDirectorFront10RecoveryFailure(
    taskId: string,
    row = null as AutoDirectorNovelTaskRow | null,
  ): Promise<boolean> {
    const candidate = row ?? await this.workflow.getTaskByIdWithoutHealing(taskId);
    if (!candidate || !isHistoricalAutoDirectorFront10RecoveryUnsupportedFailure(candidate)) {
      return false;
    }

    const existing = await this.workflow.getTaskByIdWithoutHealing(taskId);
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
      || directorSession?.phase !== "chapter_execution"
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
    const nextResumeTarget = this.workflow.buildResumeTarget({
      taskId,
      novelId: existing.novelId,
      lane: "auto_director",
      stage: runningState.stage === "quality_repair" ? "quality_repair" : "chapter_execution",
      chapterId: autoExecution?.nextChapterId ?? autoExecution?.firstChapterId ?? null,
    });

    await this.workflow.updateTaskWithRetry({
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

  public async healChapterTitleDiversitySoftFailure(
    taskId: string,
    row = null as AutoDirectorNovelTaskRow | null,
  ): Promise<boolean> {
    const candidate = row ?? await this.workflow.getTaskByIdWithoutHealing(taskId);
    const issue = candidate?.lastError?.trim() || "";
    if (
      !candidate
      || candidate.lane !== "auto_director"
      || candidate.status !== "failed"
      || !isChapterTitleDiversityIssue(issue)
    ) {
      return false;
    }

    const existing = await this.workflow.getTaskByIdWithoutHealing(taskId);
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
      : buildNovelCreateResumeTarget(taskId, "director");

    await this.workflow.updateTaskWithRetry({
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

  public async healStaleAutoDirectorStructuredOutlineProgress(
    taskId: string,
    row = null as AutoDirectorNovelTaskRow | null,
  ): Promise<boolean> {
    const candidate = row ?? await this.workflow.getTaskByIdWithoutHealing(taskId);
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

    const progressState = await this.resolveStructuredOutlineTaskProgress({
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

    await this.workflow.updateTaskWithRetry({
      where: { id: taskId },
      data: {
        currentStage: stageLabel("structured_outline"),
        currentItemKey: progressState.currentItemKey,
        currentItemLabel: progressState.currentItemLabel,
        progress: Math.max(candidate.progress ?? 0, progressState.progress),
        resumeTargetJson: stringifyResumeTarget(this.workflow.buildResumeTarget({
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

}
