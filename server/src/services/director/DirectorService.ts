import { DIRECTOR_RUN_MODES } from "@ai-novel/shared/types/novelDirector";
import type { CharacterCastOption } from "@ai-novel/shared/types/novel";
import { AppError } from "../../middleware/errorHandler";
import type {
  DirectorContinuationMode,
  BookSpec,
  DirectorCandidateBatch,
  DirectorCandidatePatchRequest,
  DirectorCandidatePatchResponse,
  DirectorCandidateTitleRefineRequest,
  DirectorCandidateTitleRefineResponse,
  DirectorCandidatesRequest,
  DirectorCandidatesResponse,
  DirectorConfirmApiResponse,
  DirectorConfirmRequest,
  DirectorRefineResponse,
  DirectorRefinementRequest,
  DirectorTakeoverReadinessResponse,
  DirectorTakeoverRequest,
  DirectorTakeoverResponse,
} from "@ai-novel/shared/types/novelDirector";
import { BookContractService } from "../novel/BookContractService";
import { CharacterPreparationService } from "../novel/characterPrep/CharacterPreparationService";
import { generateAutoCharacterCastDraft, persistCharacterCastOptionsDraft } from "../novel/characterPrep/characterCastGeneration";
import { CharacterDynamicsService } from "../novel/dynamics/CharacterDynamicsService";
import { NovelContextService } from "../novel/NovelContextService";
import { NovelService } from "../novel/NovelService";
import { novelFramingSuggestionService } from "../novel/NovelFramingSuggestionService";
import { StoryMacroPlanService } from "../novel/storyMacro/StoryMacroPlanService";
import { NovelVolumeService } from "../novel/volume/NovelVolumeService";
import { isChapterTitleDiversityIssue } from "../novel/volume/chapterTitleDiversity";
import { NovelWorkflowService } from "../novel/workflow/NovelWorkflowService";
import { buildNovelEditResumeTarget, parseSeedPayload, parseResumeTarget } from "../novel/workflow/novelWorkflow.shared";
import { NovelDirectorCandidateStageService } from "./candidateStage";
import { resolveDirectorBookFraming } from "./framing";
import {
  buildDirectorSessionState,
  getDirectorInputFromSeedPayload,
  type DirectorWorkflowSeedPayload,
  normalizeDirectorRunMode,
  toBookSpec,
} from "./helpers";
import { DIRECTOR_PROGRESS, type DirectorProgressItemKey } from "./progress";
import { NovelDirectorAutoExecutionRuntime } from "./autoExecutionRuntime";
import { StyleBindingService } from "../styleEngine/StyleBindingService";
import { StyleProfileService } from "../styleEngine/StyleProfileService";
import { normalizeDirectorAutoApprovalConfig, shouldAutoApproveDirectorApprovalPoint, shouldAutoApproveDirectorCheckpoint } from "@ai-novel/shared/types/autoDirectorApproval";
import { recordAutoDirectorAutoApprovalFromTask } from "../task/autoDirectorFollowUps/autoDirectorAutoApprovalAudit";
import {
  assertHighMemoryDirectorStartAllowed,
  isWorkflowTaskCancelledError,
  markDirectorTaskRunning,
  markTaskFailedWithLatestDiagnostic,
  scheduleDirectorBackgroundRun,
  stringifyDirectorTaskError,
  withWorkflowTaskUsage,
  type DirectorRuntimeDeps,
} from "./runtime";
import {
  enrichDirectorStyleContext,
  ensurePrimaryNovelStyleBinding,
  type DirectorStyleContextDeps,
} from "./styleContext";
import {
  getDirectorAssetSnapshot,
  resolveAssetFirstRecovery,
  resolveDirectorEditStage,
  resolveObservedResumePhase,
  resolveResumePhase,
  resolveSafePipelineStartPhase,
  type DirectorPhaseResolverDeps,
} from "./phaseResolver";
import {
  buildCandidateStageBaseRequest,
  continueCandidateStageTask,
  isCandidateSelectionTask,
  runCandidateStageWithFailureHandling,
  type DirectorCandidateStageRuntimeDeps,
} from "./candidateStageRuntime";
import {
  runDirectorPipeline,
  shouldAutoApproveCheckpoint,
  type DirectorPipelineRunnerCallbacks,
  type DirectorPipelineRunnerDeps,
} from "./pipelineRunner";
import {
  buildExistingConfirmResponse,
  confirmCandidate,
  waitForExistingConfirmedNovel,
  type DirectorConfirmCandidateFlowDeps,
} from "./confirmCandidateFlow";
import { continueTask, type DirectorContinueTaskFlowDeps } from "./continueTaskFlow";
import { repairChapterTitles, type DirectorRepairChapterTitlesFlowDeps } from "./repairChapterTitlesFlow";
import { buildDirectorSeedPayload } from "./seedPayload";
import {
  buildDirectorCharacterPreparationService,
  findReusableDirectorCharacterCastOption,
  runCharacterSetupPhase,
  runStoryMacroPhase,
  runStructuredOutlinePhase,
  runVolumeStrategyPhase,
  type DirectorPhaseExecutionCallbacks,
  type DirectorPhaseExecutionDeps,
} from "./phaseExecution";
import {
  getTakeoverReadiness,
  startTakeover,
  type DirectorTakeoverFlowDeps,
} from "./takeoverFlow";

type WorkflowTaskSnapshot = Awaited<ReturnType<NovelWorkflowService["getTaskByIdWithoutHealing"]>>;

export class NovelDirectorService {
  private readonly novelContextService = new NovelContextService();
  private readonly characterPreparationService = new CharacterPreparationService();
  private readonly storyMacroService = new StoryMacroPlanService();
  private readonly bookContractService = new BookContractService();
  private readonly novelService = new NovelService();
  private readonly characterDynamicsService = new CharacterDynamicsService();
  private readonly volumeService = new NovelVolumeService();
  private readonly workflowService = new NovelWorkflowService();
  private readonly styleProfileService = new StyleProfileService();
  private readonly styleBindingService = new StyleBindingService();
  private readonly candidateStageService = new NovelDirectorCandidateStageService(this.workflowService);
  private readonly autoExecutionRuntime = new NovelDirectorAutoExecutionRuntime({
    novelContextService: this.novelContextService,
    novelService: this.novelService,
    volumeWorkspaceService: this.volumeService,
    workflowService: this.workflowService,
    buildDirectorSeedPayload: (input, novelId, extra) => this.buildDirectorSeedPayload(input, novelId, extra),
    shouldAutoContinueQualityRepair: async ({ request, qualityRepairRisk }) => (
      qualityRepairRisk.autoContinuable
      && shouldAutoApproveDirectorApprovalPoint(
        normalizeDirectorAutoApprovalConfig(request.autoApproval),
        "low_risk_quality_repair_continue",
      )
    ),
    recordAutoApproval: async ({ taskId, checkpointType, checkpointSummary }) => {
      await recordAutoDirectorAutoApprovalFromTask({
        taskId,
        checkpointType,
        checkpointSummary,
      });
    },
  });

  private get runtimeDeps(): DirectorRuntimeDeps { return { workflowService: this.workflowService }; }
  private get styleContextDeps(): DirectorStyleContextDeps {
    return { styleProfileService: this.styleProfileService, styleBindingService: this.styleBindingService };
  }
  private get phaseResolverDeps(): DirectorPhaseResolverDeps {
    return {
      volumeService: this.volumeService, novelContextService: this.novelContextService,
      storyMacroService: this.storyMacroService, workflowService: this.workflowService,
    };
  }

  private get candidateStageRuntimeDeps(): DirectorCandidateStageRuntimeDeps {
    return {
      candidateStageService: this.candidateStageService,
      scheduleBackgroundRun: (taskId, runner) => this.scheduleBackgroundRun(taskId, runner),
      withWorkflowTaskUsage: (workflowTaskId, runner) => this.withWorkflowTaskUsage(workflowTaskId, runner),
      markTaskFailedWithLatestDiagnostic: (taskId, message) => this.markTaskFailedWithLatestDiagnostic(taskId, message),
    };
  }

  private get pipelineRunnerDeps(): DirectorPipelineRunnerDeps {
    return {
      volumeService: this.volumeService,
      autoExecutionRuntime: this.autoExecutionRuntime,
    };
  }

  private get pipelineRunnerCallbacks(): DirectorPipelineRunnerCallbacks {
    return {
      resolveSafePipelineStartPhase: (input) => this.resolveSafePipelineStartPhase(input),
      runStoryMacroPhase: (taskId, novelId, input) => this.runStoryMacroPhase(taskId, novelId, input),
      runCharacterSetupPhase: (taskId, novelId, input) => this.runCharacterSetupPhase(taskId, novelId, input),
      runVolumeStrategyPhase: (taskId, novelId, input) => this.runVolumeStrategyPhase(taskId, novelId, input),
      runStructuredOutlinePhase: (taskId, novelId, input, baseWorkspace) => (
        this.runStructuredOutlinePhase(taskId, novelId, input, baseWorkspace)
      ),
      assertHighMemoryDirectorStartAllowed: (input) => this.assertHighMemoryDirectorStartAllowed(input),
      shouldAutoApproveCheckpoint: (input, checkpointType) => this.shouldAutoApproveCheckpoint(input, checkpointType),
    };
  }

  private get confirmCandidateFlowDeps(): DirectorConfirmCandidateFlowDeps {
    return {
      workflowService: this.workflowService,
      novelContextService: this.novelContextService,
      novelService: this.novelService,
      ensurePrimaryNovelStyleBinding: (novelId, styleProfileId) => this.ensurePrimaryNovelStyleBinding(novelId, styleProfileId),
      buildDirectorSeedPayload: (input, novelId, extra) => this.buildDirectorSeedPayload(input, novelId, extra),
      withWorkflowTaskUsage: (workflowTaskId, runner) => this.withWorkflowTaskUsage(workflowTaskId, runner),
      markDirectorTaskRunning: (taskId, stage, itemKey, itemLabel, progress) => (
        this.markDirectorTaskRunning(taskId, stage, itemKey, itemLabel, progress)
      ),
      runDirectorPipeline: (input) => this.runDirectorPipeline(input),
      scheduleBackgroundRun: (taskId, runner) => this.scheduleBackgroundRun(taskId, runner),
      markTaskFailedWithLatestDiagnostic: (taskId, message) => this.markTaskFailedWithLatestDiagnostic(taskId, message),
    };
  }

  private get continueTaskFlowDeps(): DirectorContinueTaskFlowDeps {
    return {
      workflowService: this.workflowService,
      autoExecutionRuntime: this.autoExecutionRuntime,
      continueCandidateStageTask: (taskId, input) => this.continueCandidateStageTask(taskId, input),
      resolveAssetFirstRecovery: (input) => this.resolveAssetFirstRecovery(input),
      resolveResumePhase: (input) => this.resolveResumePhase(input),
      resolveDirectorEditStage: (phase) => this.resolveDirectorEditStage(phase),
      assertHighMemoryDirectorStartAllowed: (input) => this.assertHighMemoryDirectorStartAllowed(input),
      buildDirectorSeedPayload: (input, novelId, extra) => this.buildDirectorSeedPayload(input, novelId, extra),
      scheduleBackgroundRun: (taskId, runner) => this.scheduleBackgroundRun(taskId, runner),
      runDirectorPipeline: (input) => this.runDirectorPipeline(input),
    };
  }

  private get repairChapterTitlesFlowDeps(): DirectorRepairChapterTitlesFlowDeps {
    return {
      workflowService: this.workflowService,
      volumeService: this.volumeService,
      assertHighMemoryDirectorStartAllowed: (input) => this.assertHighMemoryDirectorStartAllowed(input),
      buildDirectorSeedPayload: (input, novelId, extra) => this.buildDirectorSeedPayload(input, novelId, extra),
      scheduleBackgroundRun: (taskId, runner) => this.scheduleBackgroundRun(taskId, runner),
    };
  }

  private get phaseExecutionDeps(): DirectorPhaseExecutionDeps {
    return {
      workflowService: this.workflowService,
      novelContextService: this.novelContextService,
      characterDynamicsService: this.characterDynamicsService,
      characterPreparationService: this.characterPreparationService,
      volumeService: this.volumeService,
      storyMacroService: this.storyMacroService,
      bookContractService: this.bookContractService,
    };
  }

  private get phaseExecutionCallbacks(): DirectorPhaseExecutionCallbacks {
    return {
      buildDirectorSeedPayload: (request, novelId, extra) => this.buildDirectorSeedPayload(request, novelId, extra),
      markDirectorTaskRunning: (taskId, stage, itemKey, itemLabel, progress, options) => (
        this.markDirectorTaskRunning(taskId, stage, itemKey as DirectorProgressItemKey, itemLabel, progress, options)
      ),
    };
  }

  private get takeoverFlowDeps(): DirectorTakeoverFlowDeps {
    return {
      storyMacroService: this.storyMacroService,
      volumeService: this.volumeService,
      workflowService: this.workflowService,
      autoExecutionRuntime: this.autoExecutionRuntime,
      novelService: this.novelService,
      getDirectorAssetSnapshot: (novelId) => this.getDirectorAssetSnapshot(novelId),
      enrichDirectorStyleContext: (input) => this.enrichDirectorStyleContext(input),
      ensurePrimaryNovelStyleBinding: (novelId, styleProfileId) => this.ensurePrimaryNovelStyleBinding(novelId, styleProfileId),
      buildDirectorSeedPayload: (request, novelId, extra) => this.buildDirectorSeedPayload(request, novelId, extra),
      scheduleBackgroundRun: (taskId, runner) => this.scheduleBackgroundRun(taskId, runner),
      runDirectorPipeline: (input) => this.runDirectorPipeline(input),
      assertHighMemoryDirectorStartAllowed: (input) => this.assertHighMemoryDirectorStartAllowed(input),
    };
  }

  private async assertHighMemoryDirectorStartAllowed(input: {
    taskId: string;
    novelId: string;
    stage: "structured_outline";
    itemKey: "beat_sheet" | "chapter_list" | "chapter_detail_bundle" | "chapter_sync";
    volumeId?: string | null;
    chapterId?: string | null;
    scope?: string | null;
    batchAlreadyStartedCount?: number;
  }): Promise<void> {
    await assertHighMemoryDirectorStartAllowed(this.runtimeDeps, input);
  }

  private async markTaskFailedWithLatestDiagnostic(taskId: string, message: string): Promise<void> { await markTaskFailedWithLatestDiagnostic(this.runtimeDeps, taskId, message); }
  private scheduleBackgroundRun(taskId: string, runner: () => Promise<void>): void { scheduleDirectorBackgroundRun(this.runtimeDeps, taskId, runner); }
  private withWorkflowTaskUsage<T>(workflowTaskId: string | null | undefined, runner: () => Promise<T>): Promise<T> { return withWorkflowTaskUsage(workflowTaskId, runner); }

  private async enrichDirectorStyleContext<T extends { styleProfileId?: string; styleTone?: string; styleIntentSummary?: unknown }>(
    input: T,
  ): Promise<T> {
    return enrichDirectorStyleContext(this.styleContextDeps, input);
  }

  private async ensurePrimaryNovelStyleBinding(novelId: string, styleProfileId: string | null | undefined): Promise<void> {
    await ensurePrimaryNovelStyleBinding(this.styleContextDeps, novelId, styleProfileId);
  }

  private resolveDirectorEditStage(phase: "story_macro" | "character_setup" | "volume_strategy" | "structured_outline" | "front10_ready"): "story_macro" | "character" | "outline" | "structured" | "chapter" { return resolveDirectorEditStage(phase); }
  private async getDirectorAssetSnapshot(novelId: string) { return getDirectorAssetSnapshot(this.phaseResolverDeps, novelId); }
  private async resolveObservedResumePhase(novelId: string): Promise<"structured_outline" | null> { return resolveObservedResumePhase(this.phaseResolverDeps, novelId); }

  private async resolveAssetFirstRecovery(input: {
    novelId: string;
    directorInput: DirectorConfirmRequest;
  }): Promise<
    | {
      type: "auto_execution";
      resumeCheckpointType: "front10_ready" | "chapter_batch_ready" | "replan_required";
    }
    | {
      type: "phase";
      phase: "structured_outline";
    }
    | null
  > {
    return resolveAssetFirstRecovery(this.phaseResolverDeps, input);
  }

  private async resolveResumePhase(input: { novelId: string; checkpointType: string | null; directorSessionPhase?: "candidate_selection" | "story_macro" | "character_setup" | "volume_strategy" | "structured_outline" | "front10_ready"; }): Promise<"story_macro" | "character_setup" | "volume_strategy" | "structured_outline"> { return resolveResumePhase(this.phaseResolverDeps, input); }
  private async resolveSafePipelineStartPhase(input: { novelId: string; requestedPhase: "story_macro" | "character_setup" | "volume_strategy" | "structured_outline"; }): Promise<"story_macro" | "character_setup" | "volume_strategy" | "structured_outline"> { return resolveSafePipelineStartPhase(this.phaseResolverDeps, input); }

  private isCandidateSelectionTask(input: {
    novelId?: string | null;
    checkpointType: string | null;
    currentItemKey?: string | null;
    seedPayload: DirectorWorkflowSeedPayload;
  }): boolean {
    return isCandidateSelectionTask(input);
  }

  private buildCandidateStageBaseRequest(
    taskId: string,
    seedPayload: DirectorWorkflowSeedPayload,
  ): DirectorCandidatesRequest | null {
    return buildCandidateStageBaseRequest(taskId, seedPayload);
  }

  private async continueCandidateStageTask(
    taskId: string,
    input: {
      novelId?: string | null;
      status: string;
      checkpointType: string | null;
      currentItemKey?: string | null;
      seedPayload: DirectorWorkflowSeedPayload;
    },
  ): Promise<boolean> {
    return continueCandidateStageTask(this.candidateStageRuntimeDeps, taskId, input);
  }

  private async runCandidateStageWithFailureHandling<T>(
    workflowTaskId: string | null | undefined,
    runner: () => Promise<T>,
  ): Promise<T> {
    return runCandidateStageWithFailureHandling(this.candidateStageRuntimeDeps, workflowTaskId, runner);
  }

  async continueTask(taskId: string, input?: {
    continuationMode?: DirectorContinuationMode;
    batchAlreadyStartedCount?: number;
    forceResumeRunning?: boolean;
  }): Promise<void> {
    return continueTask(this.continueTaskFlowDeps, taskId, input);
  }

  async repairChapterTitles(taskId: string, input?: {
    volumeId?: string | null;
  }): Promise<void> {
    return repairChapterTitles(this.repairChapterTitlesFlowDeps, taskId, input);
  }

  async getTakeoverReadiness(novelId: string): Promise<DirectorTakeoverReadinessResponse> {
    return getTakeoverReadiness(this.takeoverFlowDeps, novelId);
  }

  async startTakeover(input: DirectorTakeoverRequest): Promise<DirectorTakeoverResponse> {
    return startTakeover(this.takeoverFlowDeps, input);
  }

  async generateCandidates(input: DirectorCandidatesRequest): Promise<DirectorCandidatesResponse> {
    return this.runCandidateStageWithFailureHandling(
      input.workflowTaskId,
      async () => this.candidateStageService.generateCandidates(await this.enrichDirectorStyleContext(input)),
    );
  }

  async refineCandidates(input: DirectorRefinementRequest): Promise<DirectorRefineResponse> {
    return this.runCandidateStageWithFailureHandling(
      input.workflowTaskId,
      async () => this.candidateStageService.refineCandidates(await this.enrichDirectorStyleContext(input)),
    );
  }

  async patchCandidate(input: DirectorCandidatePatchRequest): Promise<DirectorCandidatePatchResponse> {
    return this.runCandidateStageWithFailureHandling(
      input.workflowTaskId,
      async () => this.candidateStageService.patchCandidate(await this.enrichDirectorStyleContext(input)),
    );
  }

  async refineCandidateTitleOptions(
    input: DirectorCandidateTitleRefineRequest,
  ): Promise<DirectorCandidateTitleRefineResponse> {
    return this.runCandidateStageWithFailureHandling(
      input.workflowTaskId,
      async () => this.candidateStageService.refineCandidateTitleOptions(await this.enrichDirectorStyleContext(input)),
    );
  }

  async confirmCandidate(input: DirectorConfirmRequest): Promise<DirectorConfirmApiResponse> {
    const resolvedInput = await this.enrichDirectorStyleContext(input);
    const bookSpec = toBookSpec(
      resolvedInput.candidate,
      resolvedInput.idea,
      resolvedInput.estimatedChapterCount,
    );
    return confirmCandidate(this.confirmCandidateFlowDeps, input, resolvedInput, bookSpec);
  }

  private async buildExistingConfirmResponse(task: WorkflowTaskSnapshot, input: DirectorConfirmRequest, bookSpec: BookSpec): Promise<DirectorConfirmApiResponse> {
    return buildExistingConfirmResponse(this.confirmCandidateFlowDeps, task, input, bookSpec);
  }
  private async waitForExistingConfirmedNovel(taskId: string): Promise<WorkflowTaskSnapshot> { return waitForExistingConfirmedNovel(this.confirmCandidateFlowDeps, taskId); }

  private buildDirectorSeedPayload(input: DirectorConfirmRequest, novelId: string | null, extra?: Record<string, unknown>) { return buildDirectorSeedPayload(input, novelId, extra); }

  private async markDirectorTaskRunning(
    taskId: string,
    stage: "auto_director" | "story_macro" | "character_setup" | "volume_strategy" | "structured_outline",
    itemKey: DirectorProgressItemKey,
    itemLabel: string,
    progress: number,
    options?: {
      chapterId?: string | null;
      volumeId?: string | null;
    },
  ): Promise<void> {
    await markDirectorTaskRunning(this.runtimeDeps, taskId, stage, itemKey, itemLabel, progress, options);
  }

  private async runDirectorPipeline(input: {
    taskId: string;
    novelId: string;
    input: DirectorConfirmRequest;
    startPhase: "story_macro" | "character_setup" | "volume_strategy" | "structured_outline";
    scope?: string | null;
    batchAlreadyStartedCount?: number;
  }) {
    await runDirectorPipeline(this.pipelineRunnerDeps, this.pipelineRunnerCallbacks, input);
  }

  private shouldAutoApproveCheckpoint(input: DirectorConfirmRequest, checkpointType: "front10_ready" | "chapter_batch_ready" | "replan_required"): boolean {
    return shouldAutoApproveCheckpoint({ ...input, runMode: normalizeDirectorRunMode(input.runMode) }, checkpointType);
  }

  private async runStoryMacroPhase(
    taskId: string,
    novelId: string,
    input: DirectorConfirmRequest,
  ): Promise<void> {
    await runStoryMacroPhase(this.phaseExecutionDeps, this.phaseExecutionCallbacks, taskId, novelId, input);
  }

  private async findReusableDirectorCharacterCastOption(targetNovelId: string): Promise<CharacterCastOption | null> { return findReusableDirectorCharacterCastOption(this.phaseExecutionDeps, targetNovelId); }
  private buildDirectorCharacterPreparationService() { return buildDirectorCharacterPreparationService(this.phaseExecutionDeps); }

  private async runCharacterSetupPhase(
    taskId: string,
    novelId: string,
    input: DirectorConfirmRequest,
  ): Promise<boolean> {
    return runCharacterSetupPhase(this.phaseExecutionDeps, this.phaseExecutionCallbacks, taskId, novelId, input);
  }

  private async runVolumeStrategyPhase(
    taskId: string,
    novelId: string,
    input: DirectorConfirmRequest,
  ) {
    return runVolumeStrategyPhase(this.phaseExecutionDeps, this.phaseExecutionCallbacks, taskId, novelId, input);
  }

  private async runStructuredOutlinePhase(
    taskId: string,
    novelId: string,
    input: DirectorConfirmRequest,
    baseWorkspace: Awaited<ReturnType<NovelVolumeService["getVolumes"]>>,
  ) {
    await runStructuredOutlinePhase(this.phaseExecutionDeps, this.phaseExecutionCallbacks, taskId, novelId, input, baseWorkspace);
  }

  // Director 侧 JSON 输出解析/修复统一由 invokeStructuredLlm 完成，
  // 不再维护 extractJSONObject/JSON.parse 的重复逻辑。
}
