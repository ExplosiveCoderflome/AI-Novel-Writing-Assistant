import { NovelWorkflowStoreService } from "./NovelWorkflowStoreService";
import {canExecuteLegacyTask} from "../../../modules/novel/director-routing";
import { NovelWorkflowHealingService } from "./NovelWorkflowHealingService";
import { NovelWorkflowApplicationService } from "./NovelWorkflowApplicationService";
import {
  findActiveDirectorTask,
  resolveCurrentDirectorTask,
  resolvePreviousDirectorTask,
  startDirectorTaskForNovel,
} from "../director/state/currentDirectorTask";

export class NovelWorkflowService extends NovelWorkflowStoreService {
  private readonly healingService = new NovelWorkflowHealingService(this);
  private readonly applicationService = new NovelWorkflowApplicationService(this);

  findActiveDirectorTask(...args: Parameters<typeof findActiveDirectorTask>) {
    return findActiveDirectorTask(...args);
  }

  resolveCurrentDirectorTask(...args: Parameters<typeof resolveCurrentDirectorTask>) {
    return resolveCurrentDirectorTask(...args);
  }

  resolvePreviousDirectorTask(...args: Parameters<typeof resolvePreviousDirectorTask>) {
    return resolvePreviousDirectorTask(...args);
  }

  startDirectorTaskForNovel(...args: Parameters<typeof startDirectorTaskForNovel>) {
    return startDirectorTaskForNovel(...args);
  }

  async healBrokenAutoDirectorCandidateSeedPayload(...args: Parameters<NovelWorkflowHealingService["healBrokenAutoDirectorCandidateSeedPayload"]>) {
    if (!await canExecuteLegacyTask(args[0])) return false;
    return this.healingService.healBrokenAutoDirectorCandidateSeedPayload(...args);
  }

  async healRuntimeGateApprovalState(...args: Parameters<NovelWorkflowHealingService["healRuntimeGateApprovalState"]>) {
    if (!await canExecuteLegacyTask(args[0])) return false;
    return this.healingService.healRuntimeGateApprovalState(...args);
  }

  async healRuntimeFailedState(...args: Parameters<NovelWorkflowHealingService["healRuntimeFailedState"]>) {
    if (!await canExecuteLegacyTask(args[0])) return false;
    return this.healingService.healRuntimeFailedState(...args);
  }

  async healStaleAutoDirectorRunningTask(...args: Parameters<NovelWorkflowHealingService["healStaleAutoDirectorRunningTask"]>) {
    if (!await canExecuteLegacyTask(args[0])) return false;
    return this.healingService.healStaleAutoDirectorRunningTask(...args);
  }

  async healStaleAutoDirectorQueuedProgress(...args: Parameters<NovelWorkflowHealingService["healStaleAutoDirectorQueuedProgress"]>) {
    if (!await canExecuteLegacyTask(args[0])) return false;
    return this.healingService.healStaleAutoDirectorQueuedProgress(...args);
  }

  async healHistoricalAutoDirectorRecoveryFailure(...args: Parameters<NovelWorkflowHealingService["healHistoricalAutoDirectorRecoveryFailure"]>) {
    if (!await canExecuteLegacyTask(args[0])) return false;
    return this.healingService.healHistoricalAutoDirectorRecoveryFailure(...args);
  }

  async healHistoricalAutoDirectorFront10RecoveryFailure(...args: Parameters<NovelWorkflowHealingService["healHistoricalAutoDirectorFront10RecoveryFailure"]>) {
    if (!await canExecuteLegacyTask(args[0])) return false;
    return this.healingService.healHistoricalAutoDirectorFront10RecoveryFailure(...args);
  }

  async healChapterTitleDiversitySoftFailure(...args: Parameters<NovelWorkflowHealingService["healChapterTitleDiversitySoftFailure"]>) {
    if (!await canExecuteLegacyTask(args[0])) return false;
    return this.healingService.healChapterTitleDiversitySoftFailure(...args);
  }

  async healStaleAutoDirectorStructuredOutlineProgress(...args: Parameters<NovelWorkflowHealingService["healStaleAutoDirectorStructuredOutlineProgress"]>) {
    if (!await canExecuteLegacyTask(args[0])) return false;
    return this.healingService.healStaleAutoDirectorStructuredOutlineProgress(...args);
  }

  applyAutoDirectorLlmOverride(...args: Parameters<NovelWorkflowApplicationService["applyAutoDirectorLlmOverride"]>) {
    return this.applicationService.applyAutoDirectorLlmOverride(...args);
  }

  bootstrapTask(...args: Parameters<NovelWorkflowApplicationService["bootstrapTask"]>) {
    return this.applicationService.bootstrapTask(...args);
  }

  attachNovelToTask(...args: Parameters<NovelWorkflowApplicationService["attachNovelToTask"]>) {
    return this.applicationService.attachNovelToTask(...args);
  }

  claimAutoDirectorNovelCreation(...args: Parameters<NovelWorkflowApplicationService["claimAutoDirectorNovelCreation"]>) {
    return this.applicationService.claimAutoDirectorNovelCreation(...args);
  }

  markTaskRunning(...args: Parameters<NovelWorkflowApplicationService["markTaskRunning"]>) {
    return this.applicationService.markTaskRunning(...args);
  }

  markTaskWaitingApproval(...args: Parameters<NovelWorkflowApplicationService["markTaskWaitingApproval"]>) {
    return this.applicationService.markTaskWaitingApproval(...args);
  }

  markTaskFailed(...args: Parameters<NovelWorkflowApplicationService["markTaskFailed"]>) {
    return this.applicationService.markTaskFailed(...args);
  }

  cancelTask(...args: Parameters<NovelWorkflowApplicationService["cancelTask"]>) {
    return this.applicationService.cancelTask(...args);
  }

  retryTask(...args: Parameters<NovelWorkflowApplicationService["retryTask"]>) {
    return this.applicationService.retryTask(...args);
  }

  restoreTaskToCheckpoint(...args: Parameters<NovelWorkflowApplicationService["restoreTaskToCheckpoint"]>) {
    return this.applicationService.restoreTaskToCheckpoint(...args);
  }

  continueTask(...args: Parameters<NovelWorkflowApplicationService["continueTask"]>) {
    return this.applicationService.continueTask(...args);
  }

  requeueTaskForRecovery(...args: Parameters<NovelWorkflowApplicationService["requeueTaskForRecovery"]>) {
    return this.applicationService.requeueTaskForRecovery(...args);
  }

  recordCandidateSelectionRequired(...args: Parameters<NovelWorkflowApplicationService["recordCandidateSelectionRequired"]>) {
    return this.applicationService.recordCandidateSelectionRequired(...args);
  }

  recordRewriteSnapshotMilestone(...args: Parameters<NovelWorkflowApplicationService["recordRewriteSnapshotMilestone"]>) {
    return this.applicationService.recordRewriteSnapshotMilestone(...args);
  }

  recordCheckpoint(...args: Parameters<NovelWorkflowApplicationService["recordCheckpoint"]>) {
    return this.applicationService.recordCheckpoint(...args);
  }

  syncStageByNovelId(...args: Parameters<NovelWorkflowApplicationService["syncStageByNovelId"]>) {
    return this.applicationService.syncStageByNovelId(...args);
  }
}
