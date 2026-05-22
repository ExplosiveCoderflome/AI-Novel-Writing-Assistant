import { NovelWorkflowStoreService } from "./NovelWorkflowStoreService";
import { NovelWorkflowHealingService } from "./NovelWorkflowHealingService";
import { NovelWorkflowApplicationService } from "./NovelWorkflowApplicationService";

export class NovelWorkflowService extends NovelWorkflowStoreService {
  private readonly healingService = new NovelWorkflowHealingService(this);
  private readonly applicationService = new NovelWorkflowApplicationService(this);

  constructor() {
    super();
    this.setHealingPort(this.healingService);
  }

  healBrokenAutoDirectorCandidateSeedPayload(...args: Parameters<NovelWorkflowHealingService["healBrokenAutoDirectorCandidateSeedPayload"]>) {
    return this.healingService.healBrokenAutoDirectorCandidateSeedPayload(...args);
  }

  healAutoDirectorTaskState(...args: Parameters<NovelWorkflowHealingService["healAutoDirectorTaskState"]>) {
    return this.healingService.healAutoDirectorTaskState(...args);
  }

  healRuntimeGateApprovalState(...args: Parameters<NovelWorkflowHealingService["healRuntimeGateApprovalState"]>) {
    return this.healingService.healRuntimeGateApprovalState(...args);
  }

  healRuntimeFailedState(...args: Parameters<NovelWorkflowHealingService["healRuntimeFailedState"]>) {
    return this.healingService.healRuntimeFailedState(...args);
  }

  healStaleAutoDirectorRunningTask(...args: Parameters<NovelWorkflowHealingService["healStaleAutoDirectorRunningTask"]>) {
    return this.healingService.healStaleAutoDirectorRunningTask(...args);
  }

  healStaleAutoDirectorQueuedProgress(...args: Parameters<NovelWorkflowHealingService["healStaleAutoDirectorQueuedProgress"]>) {
    return this.healingService.healStaleAutoDirectorQueuedProgress(...args);
  }

  healHistoricalAutoDirectorRecoveryFailure(...args: Parameters<NovelWorkflowHealingService["healHistoricalAutoDirectorRecoveryFailure"]>) {
    return this.healingService.healHistoricalAutoDirectorRecoveryFailure(...args);
  }

  healHistoricalAutoDirectorFront10RecoveryFailure(...args: Parameters<NovelWorkflowHealingService["healHistoricalAutoDirectorFront10RecoveryFailure"]>) {
    return this.healingService.healHistoricalAutoDirectorFront10RecoveryFailure(...args);
  }

  healChapterTitleDiversitySoftFailure(...args: Parameters<NovelWorkflowHealingService["healChapterTitleDiversitySoftFailure"]>) {
    return this.healingService.healChapterTitleDiversitySoftFailure(...args);
  }

  healStaleAutoDirectorStructuredOutlineProgress(...args: Parameters<NovelWorkflowHealingService["healStaleAutoDirectorStructuredOutlineProgress"]>) {
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
