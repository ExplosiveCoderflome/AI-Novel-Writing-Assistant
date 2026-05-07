import type {
  NovelWorkflowCheckpoint,
  NovelWorkflowLane,
  NovelWorkflowResumeTarget,
  NovelWorkflowStage,
} from "@ai-novel/shared/types/novelWorkflow";
import { prisma } from "../../../db/prisma";
import { AppError } from "../../../middleware/errorHandler";
import type { DirectorLLMOptions } from "@ai-novel/shared/types/novelDirector";
import {
  applyDirectorLlmOverride,
  normalizeDirectorRunMode,
  type DirectorWorkflowSeedPayload,
} from "../../director/helpers";
import {
  buildChapterDetailBundleLabel,
  buildChapterDetailBundleProgress,
  DIRECTOR_PROGRESS,
} from "../../director/progress";
import {
  buildDirectorAutoExecutionScopeLabel,
  normalizeDirectorAutoExecutionPlan,
  resolveDirectorAutoExecutionBookRange,
  resolveDirectorAutoExecutionRangeFromState,
  resolveDirectorAutoExecutionWorkflowState,
} from "../../director/autoExecution";
import { NovelVolumeService } from "../volume/NovelVolumeService";
import { resolveStructuredOutlineRecoveryCursor } from "../../director/structuredOutlineRecovery";
import {
  appendMilestone,
  buildNovelCreateResumeTarget,
  buildNovelEditResumeTarget,
  defaultWorkflowTitle,
  mergeSeedPayload,
  NOVEL_WORKFLOW_STAGE_LABELS,
  NOVEL_WORKFLOW_STAGE_PROGRESS,
  parseMilestones,
  parseSeedPayload,
  parseResumeTarget,
  stringifyResumeTarget,
} from "./novelWorkflow.shared";
import { isChapterTitleDiversityIssue } from "../volume/chapterTitleDiversity";
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
import {
  AutoDirectorFollowUpNotificationService,
} from "../../task/autoDirectorFollowUps/AutoDirectorFollowUpNotificationService";
import {
  ACTIVE_STATUSES,
  AutoDirectorNovelCreationClaim,
  BootstrapWorkflowInput,
  buildChapterTitleDiversityTaskNotice,
  ChapterBatchCheckpointRow,
  CHECKPOINT_ITEM_LABELS,
  CHECKPOINT_STAGE_MAP,
  defaultProgressForStage,
  hasCandidateSelectionPhase,
  isCandidateSelectionItemKey,
  isChapterBatchCheckpointRow,
  isPreNovelAutoDirectorCandidateTask,
  isQueuedWorkflowItemKey,
  isStructuredOutlineItemKey,
  isTaskCancellationRequested,
  mapStageToTab,
  mergeResumeTargets,
  parseSeedResumeTarget,
  stageLabel,
  SyncWorkflowStageInput,
} from "./novelWorkflowServiceSupport";
import {
  updateWorkflowTaskManyWithRetry,
  updateWorkflowTaskWithRetry,
  type NovelWorkflowTaskUpdateArgs,
  type NovelWorkflowTaskUpdateManyArgs,
} from "./workflowTaskPersistence";
import { updateWorkflowTaskWithNotifications } from "./workflowTaskNotifications";
import {
  getVisibleRowByIdRaw,
  getVisibleRowsByNovelIdRaw,
  listRecoverableAutoDirectorTasks,
} from "./workflowTaskVisibility";
import {
  healAutoDirectorTaskState as healAutoDirectorTaskStateRuntime,
  healBrokenAutoDirectorCandidateSeedPayload as healBrokenAutoDirectorCandidateSeedPayloadRuntime,
  healChapterTitleDiversitySoftFailure as healChapterTitleDiversitySoftFailureRuntime,
  healHistoricalAutoDirectorFront10RecoveryFailure as healHistoricalAutoDirectorFront10RecoveryFailureRuntime,
  healHistoricalAutoDirectorRecoveryFailure as healHistoricalAutoDirectorRecoveryFailureRuntime,
  healStaleAutoDirectorQueuedProgress as healStaleAutoDirectorQueuedProgressRuntime,
  healStaleAutoDirectorRunningTask as healStaleAutoDirectorRunningTaskRuntime,
  healStaleAutoDirectorStructuredOutlineProgress as healStaleAutoDirectorStructuredOutlineProgressRuntime,
  resolveStructuredOutlineTaskProgress as resolveStructuredOutlineTaskProgressRuntime,
} from "./novelWorkflowAutoDirectorHealing";
import {
  attachNovelToTask as attachNovelToTaskRuntime,
  bootstrapTask as bootstrapTaskRuntime,
  claimAutoDirectorNovelCreation as claimAutoDirectorNovelCreationRuntime,
  createWorkflow as createWorkflowRuntime,
  syncStageByNovelId as syncStageByNovelIdRuntime,
} from "./workflowLifecycle";
import {
  cancelTask as cancelTaskRuntime,
  continueTask as continueTaskRuntime,
  markTaskFailed as markTaskFailedRuntime,
  markTaskRunning as markTaskRunningRuntime,
  markTaskWaitingApproval as markTaskWaitingApprovalRuntime,
  recordCandidateSelectionRequired as recordCandidateSelectionRequiredRuntime,
  recordCheckpoint as recordCheckpointRuntime,
  recordRewriteSnapshotMilestone as recordRewriteSnapshotMilestoneRuntime,
  requeueTaskForRecovery as requeueTaskForRecoveryRuntime,
  restoreTaskToCheckpoint as restoreTaskToCheckpointRuntime,
  retryTask as retryTaskRuntime,
} from "./workflowTaskCommands";

export class NovelWorkflowService {
  private readonly volumeService = new NovelVolumeService();

  private readonly autoDirectorFollowUpNotificationService = new AutoDirectorFollowUpNotificationService();

  private getHealingDeps() {
    return {
      volumeService: this.volumeService,
      getVisibleRowByIdRaw: this.getVisibleRowByIdRaw.bind(this),
      updateTaskWithRetry: this.updateTaskWithRetry.bind(this),
      markTaskFailed: this.markTaskFailed.bind(this),
      restoreTaskToCheckpoint: this.restoreTaskToCheckpoint.bind(this),
      buildResumeTarget: this.buildResumeTarget.bind(this),
    };
  }

  private getLifecycleDeps() {
    return {
      getNovelTitle: this.getNovelTitle.bind(this),
      getVisibleRowById: this.getVisibleRowById.bind(this),
      getVisibleRowByIdRaw: this.getVisibleRowByIdRaw.bind(this),
      getVisibleRowsByNovelId: this.getVisibleRowsByNovelId.bind(this),
      buildResumeTarget: this.buildResumeTarget.bind(this),
      updateTaskWithRetry: this.updateTaskWithRetry.bind(this),
      updateTaskManyWithRetry: this.updateTaskManyWithRetry.bind(this),
      bootstrapTask: this.bootstrapTask.bind(this),
      attachNovelToTask: this.attachNovelToTask.bind(this),
    };
  }

  private getCommandDeps() {
    return {
      getVisibleRowById: this.getVisibleRowById.bind(this),
      getVisibleRowByIdRaw: this.getVisibleRowByIdRaw.bind(this),
      buildResumeTarget: this.buildResumeTarget.bind(this),
      updateWorkflowTaskWithNotifications: this.updateWorkflowTaskWithNotifications.bind(this),
      updateTaskWithRetry: this.updateTaskWithRetry.bind(this),
      bootstrapTask: this.bootstrapTask.bind(this),
    };
  }

  private updateTaskWithRetry(args: NovelWorkflowTaskUpdateArgs) {
    return updateWorkflowTaskWithRetry(args);
  }

  private updateTaskManyWithRetry(args: NovelWorkflowTaskUpdateManyArgs) {
    return updateWorkflowTaskManyWithRetry(args);
  }

  private async updateWorkflowTaskWithNotifications<T extends {
    id: string;
    novelId: string | null;
    lane: string;
    status: string;
    progress?: number | null;
    currentStage: string | null;
    checkpointType: string | null;
    checkpointSummary?: string | null;
    currentItemLabel?: string | null;
    pendingManualRecovery: boolean;
    updatedAt: Date;
    seedPayloadJson?: string | null;
  }>(input: {
    before: T;
    data: NovelWorkflowTaskUpdateArgs["data"];
  }): Promise<T> {
    return updateWorkflowTaskWithNotifications(this.autoDirectorFollowUpNotificationService, input);
  }

  private async getVisibleRowsByNovelIdRaw(novelId: string, lane?: NovelWorkflowLane) {
    return getVisibleRowsByNovelIdRaw(novelId, lane);
  }

  private async getVisibleRowsByNovelId(novelId: string, lane?: NovelWorkflowLane) {
    const rows = await this.getVisibleRowsByNovelIdRaw(novelId, lane);
    const healed = await Promise.all(
      rows.map((row) => this.healAutoDirectorTaskState(row.id, row)),
    );
    if (!healed.some(Boolean)) {
      return rows;
    }
    return this.getVisibleRowsByNovelIdRaw(novelId, lane);
  }

  private async getVisibleRowByIdRaw(taskId: string) {
    return getVisibleRowByIdRaw(taskId);
  }

  private async getVisibleRowById(taskId: string) {
    const existing = await this.getVisibleRowByIdRaw(taskId);
    if (!existing) {
      return null;
    }
    const healed = await this.healAutoDirectorTaskState(taskId, existing);
    if (!healed) {
      return existing;
    }
    return this.getVisibleRowByIdRaw(taskId);
  }

  async findLatestVisibleTaskByNovelId(novelId: string, lane?: NovelWorkflowLane) {
    const rows = await this.getVisibleRowsByNovelId(novelId, lane);
    return rows[0] ?? null;
  }

  async findActiveTaskByNovelAndLane(novelId: string, lane: NovelWorkflowLane) {
    const rows = await this.getVisibleRowsByNovelId(novelId, lane);
    return rows.find((row) => ACTIVE_STATUSES.includes(row.status as (typeof ACTIVE_STATUSES)[number])) ?? null;
  }

  async listActiveTasksByNovelAndLane(novelId: string, lane: NovelWorkflowLane) {
    const rows = await this.getVisibleRowsByNovelId(novelId, lane);
    return rows.filter((row) => ACTIVE_STATUSES.includes(row.status as (typeof ACTIVE_STATUSES)[number]));
  }

  async listRecoverableAutoDirectorTasks(options: {
    includeStaleRunningFlag?: boolean;
  } = {}) {
    return listRecoverableAutoDirectorTasks(options);
  }

  async getTaskById(taskId: string) {
    return this.getVisibleRowById(taskId);
  }

  async getTaskByIdWithoutHealing(taskId: string) {
    return this.getVisibleRowByIdRaw(taskId);
  }

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
    return resolveStructuredOutlineTaskProgressRuntime(this.getHealingDeps(), input);
  }

  async healBrokenAutoDirectorCandidateSeedPayload(
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
    return healBrokenAutoDirectorCandidateSeedPayloadRuntime(this.getHealingDeps(), taskId, row);
  }

  async healAutoDirectorTaskState(
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
    return healAutoDirectorTaskStateRuntime(this.getHealingDeps(), taskId, row);
  }

  async healStaleAutoDirectorRunningTask(
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
    return healStaleAutoDirectorRunningTaskRuntime(this.getHealingDeps(), taskId, row);
  }

  async healStaleAutoDirectorQueuedProgress(
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
    return healStaleAutoDirectorQueuedProgressRuntime(this.getHealingDeps(), taskId, row);
  }

  async healHistoricalAutoDirectorRecoveryFailure(
    taskId: string,
    row = null as {
      lane?: string | null;
      status?: string | null;
      checkpointType?: string | null;
      lastError?: string | null;
    } | null,
  ): Promise<boolean> {
    return healHistoricalAutoDirectorRecoveryFailureRuntime(this.getHealingDeps(), taskId, row);
  }

  async healHistoricalAutoDirectorFront10RecoveryFailure(
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
    return healHistoricalAutoDirectorFront10RecoveryFailureRuntime(this.getHealingDeps(), taskId, row);
  }

  async healChapterTitleDiversitySoftFailure(
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
    return healChapterTitleDiversitySoftFailureRuntime(this.getHealingDeps(), taskId, row);
  }

  async healStaleAutoDirectorStructuredOutlineProgress(
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
    return healStaleAutoDirectorStructuredOutlineProgressRuntime(this.getHealingDeps(), taskId, row);
  }

  async applyAutoDirectorLlmOverride(
    taskId: string,
    llmOverride: Pick<DirectorLLMOptions, "provider" | "model" | "temperature">,
  ) {
    const existing = await this.getVisibleRowById(taskId);
    if (!existing) {
      throw new AppError("Workflow task not found.", 404);
    }
    if (existing.lane !== "auto_director") {
      return existing;
    }
    const seedPayload = parseSeedPayload<DirectorWorkflowSeedPayload>(existing.seedPayloadJson);
    const nextSeedPayload = applyDirectorLlmOverride(seedPayload, llmOverride);
    if (!nextSeedPayload) {
      throw new AppError("当前自动导演任务缺少可覆盖的模型上下文。", 400);
    }
    return this.updateTaskWithRetry({
      where: { id: taskId },
      data: {
        seedPayloadJson: JSON.stringify(nextSeedPayload),
        heartbeatAt: new Date(),
      },
    });
  }

  private async getNovelTitle(novelId: string): Promise<string | null> {
    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      select: { title: true },
    });
    return novel?.title ?? null;
  }

  private buildResumeTarget(input: {
    taskId: string;
    novelId?: string | null;
    lane: NovelWorkflowLane;
    stage: NovelWorkflowStage;
    chapterId?: string | null;
    volumeId?: string | null;
  }): NovelWorkflowResumeTarget {
    if (!input.novelId) {
      return buildNovelCreateResumeTarget(input.taskId, input.lane === "auto_director" ? "director" : null);
    }
    return buildNovelEditResumeTarget({
      novelId: input.novelId,
      taskId: input.taskId,
      stage: mapStageToTab(input.stage),
      chapterId: input.chapterId,
      volumeId: input.volumeId,
    });
  }

  private async createWorkflow(input: BootstrapWorkflowInput) {
    return createWorkflowRuntime(this.getLifecycleDeps(), input);
  }

  async bootstrapTask(input: BootstrapWorkflowInput) {
    return bootstrapTaskRuntime(this.getLifecycleDeps(), input);
  }

  async attachNovelToTask(taskId: string, novelId: string, stage: NovelWorkflowStage = "project_setup") {
    return attachNovelToTaskRuntime(this.getLifecycleDeps(), taskId, novelId, stage);
  }

  async claimAutoDirectorNovelCreation(taskId: string, input: {
    itemLabel: string;
    progress: number;
  }): Promise<AutoDirectorNovelCreationClaim> {
    return claimAutoDirectorNovelCreationRuntime(this.getLifecycleDeps(), taskId, input);
  }

  async markTaskRunning(taskId: string, input: {
    stage: NovelWorkflowStage;
    itemLabel: string;
    itemKey?: string | null;
    progress?: number;
    clearCheckpoint?: boolean;
    chapterId?: string | null;
    volumeId?: string | null;
    seedPayload?: Record<string, unknown>;
  }) {
    return markTaskRunningRuntime(this.getCommandDeps(), taskId, input);
  }

  async markTaskWaitingApproval(taskId: string, input: {
    stage: NovelWorkflowStage;
    itemLabel: string;
    itemKey?: string | null;
    progress?: number;
    clearCheckpoint?: boolean;
    checkpointType?: NovelWorkflowCheckpoint | null;
    checkpointSummary?: string | null;
    chapterId?: string | null;
    volumeId?: string | null;
    seedPayload?: Record<string, unknown>;
  }) {
    return markTaskWaitingApprovalRuntime(this.getCommandDeps(), taskId, input);
  }

  async markTaskFailed(taskId: string, message: string, patch?: Partial<SyncWorkflowStageInput>) {
    return markTaskFailedRuntime(this.getCommandDeps(), taskId, message, patch);
  }

  async cancelTask(taskId: string) {
    return cancelTaskRuntime(this.getCommandDeps(), taskId);
  }

  async retryTask(taskId: string) {
    return retryTaskRuntime(this.getCommandDeps(), taskId);
  }

  async restoreTaskToCheckpoint(
    taskId: string,
    row = null as Awaited<ReturnType<typeof prisma.novelWorkflowTask.findUnique>> | null,
  ) {
    return restoreTaskToCheckpointRuntime(this.getCommandDeps(), taskId, row);
  }

  async continueTask(taskId: string) {
    return continueTaskRuntime(this.getCommandDeps(), taskId);
  }

  async requeueTaskForRecovery(taskId: string, message: string) {
    return requeueTaskForRecoveryRuntime(this.getCommandDeps(), taskId, message);
  }

  async recordCandidateSelectionRequired(taskId: string, input: {
    seedPayload?: Record<string, unknown>;
    summary: string;
  }) {
    return recordCandidateSelectionRequiredRuntime(this.getCommandDeps(), taskId, input);
  }

  async recordRewriteSnapshotMilestone(taskId: string, input: {
    summary: string;
  }) {
    return recordRewriteSnapshotMilestoneRuntime(this.getCommandDeps(), taskId, input);
  }

  async recordCheckpoint(taskId: string, input: {
    stage: NovelWorkflowStage;
    checkpointType: NovelWorkflowCheckpoint;
    checkpointSummary: string;
    itemLabel: string;
    chapterId?: string | null;
    volumeId?: string | null;
    progress?: number;
    seedPayload?: Record<string, unknown>;
  }) {
    return recordCheckpointRuntime(this.getCommandDeps(), taskId, input);
  }

  async syncStageByNovelId(novelId: string, input: SyncWorkflowStageInput) {
    return syncStageByNovelIdRuntime(this.getLifecycleDeps(), novelId, input);
  }
}
