import {
  DIRECTOR_RUN_MODES,
  isDirectorAutoExecutionRunMode,
  isFullBookAutopilotRunMode,
  normalizeDirectorContinuationMode,
  type DirectorConfirmRequest,
  type DirectorContinuationMode,
} from "@ai-novel/shared/types/novelDirector";
import type { NovelContextService } from "../../NovelContextService";
import type { StoryMacroPlanService } from "../../storyMacro/StoryMacroPlanService";
import type { NovelVolumeService } from "../../volume/NovelVolumeService";
import type { NovelWorkflowService } from "../../workflow/NovelWorkflowService";
import {
  buildNovelEditResumeTarget,
  parseResumeTarget,
  parseSeedPayload,
} from "../../workflow/novelWorkflow.shared";
import { normalizeDirectorMemoryScope } from "./autoDirectorMemorySafety";
import { DirectorRecoveryNotNeededError } from "./novelDirectorErrors";
import {
  applyDirectorRunModeContract,
  buildDirectorSessionState,
  getDirectorInputFromSeedPayload,
  normalizeDirectorRunMode,
  type DirectorWorkflowSeedPayload,
} from "./novelDirectorHelpers";
import { resolveAssetFirstRecoveryFromSnapshot } from "../recovery/novelDirectorRecovery";
import {
  loadDirectorTakeoverState,
  resolveDirectorRunningStateForPhase,
} from "./novelDirectorTakeoverRuntime";
import { getDirectorExecutionNodeAdapter } from "../phases/novelDirectorExecutionNodeAdapters";
import type { NovelDirectorCandidateRuntime } from "./novelDirectorCandidateRuntime";
import type { NovelDirectorAutoExecutionRuntime } from "../automation/novelDirectorAutoExecutionRuntime";
import type { DirectorPipelineRunInput, NovelDirectorPipelineRuntime } from "../novelDirectorPipelineRuntime";
import type { NovelDirectorRuntimeOrchestrator } from "./novelDirectorRuntimeOrchestrator";
import type { DirectorRuntimeService } from "./DirectorRuntimeService";
import { buildDefaultDirectorPolicy } from "./directorRuntimeDefaults";

export type DirectorAssetFirstRecovery =
  | {
    type: "auto_execution";
    resumeCheckpointType: "chapter_batch_ready" | "replan_required";
  }
  | {
    type: "phase";
    phase: "story_macro" | "book_contract" | "character_setup" | "volume_strategy" | "structured_outline";
  }
  | null;

function mergeResumeTargets(
  primary: ReturnType<typeof parseResumeTarget>,
  fallback: ReturnType<typeof parseResumeTarget>,
) {
  if (!primary) {
    return fallback;
  }
  if (!fallback) {
    return primary;
  }
  return {
    ...fallback,
    ...primary,
    stage: primary.stage === "basic" && fallback.stage !== "basic"
      ? fallback.stage
      : primary.stage,
    chapterId: primary.chapterId ?? fallback.chapterId ?? null,
    volumeId: primary.volumeId ?? fallback.volumeId ?? null,
  };
}

function parseResumeTargetLike(value: unknown) {
  if (typeof value === "string") {
    return parseResumeTarget(value);
  }
  if (value && typeof value === "object") {
    return value as NonNullable<ReturnType<typeof parseResumeTarget>>;
  }
  return null;
}

function inferPhaseFromTaskState(input: {
  currentItemKey?: string | null;
  seedPayload: DirectorWorkflowSeedPayload;
}): "story_macro" | "book_contract" | "character_setup" | "volume_strategy" | "structured_outline" | null {
  const itemKey = input.currentItemKey?.trim() || "";
  const sessionPhase = input.seedPayload.directorSession?.phase?.trim() || "";
  const normalized = itemKey || sessionPhase;
  if (normalized === "story_macro" || normalized === "book_contract") {
    return normalized;
  }
  if (normalized === "character_setup") {
    return "character_setup";
  }
  if (normalized === "volume_strategy") {
    return "volume_strategy";
  }
  if (
    normalized === "structured_outline"
    || normalized === "beat_sheet"
    || normalized === "chapter_list"
    || normalized === "chapter_detail_bundle"
    || normalized === "chapter_sync"
    || normalized === "chapter_batch_ready"
  ) {
    return "structured_outline";
  }
  return null;
}

function shouldSkipCurrentQualityRepair(input: {
  continuationMode: DirectorContinuationMode | null;
  checkpointType?: string | null;
  currentItemKey?: string | null;
  currentStage?: string | null;
}): boolean {
  if (input.continuationMode === "skip_quality_repair") {
    return true;
  }
  if (input.continuationMode !== "auto_execute_range") {
    return false;
  }
  return input.checkpointType === "replan_required"
    || input.currentItemKey === "quality_repair"
    || Boolean(input.currentStage?.includes("质量"));
}

export class NovelDirectorContinueRuntime {
  constructor(private readonly deps: {
    workflowService: NovelWorkflowService;
    novelContextService: NovelContextService;
    storyMacroService: StoryMacroPlanService;
    volumeService: NovelVolumeService;
    directorRuntime: DirectorRuntimeService;
    runtimeOrchestrator: NovelDirectorRuntimeOrchestrator;
    candidateRuntime: NovelDirectorCandidateRuntime;
    autoExecutionRuntime: Pick<NovelDirectorAutoExecutionRuntime, "runFromReady">;
    pipelineRuntime: NovelDirectorPipelineRuntime;
    continueCandidateStageTask?: (
      taskId: string,
      input: Parameters<NovelDirectorCandidateRuntime["continueTask"]>[1],
    ) => Promise<boolean>;
    resolveAssetFirstRecovery?: (input: {
      novelId: string;
      directorInput: DirectorConfirmRequest;
    }) => Promise<DirectorAssetFirstRecovery>;
    runDirectorPipeline?: (input: DirectorPipelineRunInput) => Promise<void>;
    buildDirectorSeedPayload: (
      input: DirectorConfirmRequest,
      novelId: string | null,
      extra?: Record<string, unknown>,
    ) => Record<string, unknown>;
    getDirectorAssetSnapshot: (novelId: string) => Promise<{
      characterCount: number;
      chapterCount: number;
      plannedChapterCount?: number | null;
      volumeCount: number;
      hasVolumeStrategyPlan: boolean;
      firstVolumeId: string | null;
      firstVolumeChapterCount: number;
      volumeChapterRanges: Array<{ volumeOrder: number; startOrder: number; endOrder: number }>;
      structuredOutlineChapterOrders: number[];
    }>;
    assertHighMemoryStartAllowed: (input: {
      taskId: string;
      novelId: string;
      stage: "structured_outline";
      itemKey: "beat_sheet" | "chapter_list" | "chapter_detail_bundle" | "chapter_sync";
      volumeId?: string | null;
      chapterId?: string | null;
      scope?: string | null;
      batchAlreadyStartedCount?: number;
    }) => Promise<void>;
    scheduleBackgroundRun: (taskId: string, runner: () => Promise<void>) => void;
  }) {}

  private async resumeApprovedChapterExecutionNode(input: {
    taskId: string;
    novelId: string;
    request: DirectorConfirmRequest;
    existingPipelineJobId?: string | null;
    existingState?: DirectorWorkflowSeedPayload["autoExecution"] | null;
    resumeCheckpointType: "chapter_batch_ready";
    previousFailureMessage?: string | null;
    allowSkipReviewBlockedChapter?: boolean;
    approveAutoExecutionScope: boolean;
  }): Promise<void> {
    const adapter = getDirectorExecutionNodeAdapter("chapter_execution");
    const snapshot = await this.deps.directorRuntime.getSnapshot(input.taskId).catch(() => null);
    const basePolicy = snapshot?.policy ?? buildDefaultDirectorPolicy();
    await this.deps.directorRuntime.runNode(
      {
        nodeKey: adapter.nodeKey,
        label: adapter.label,
        reads: adapter.reads,
        writes: adapter.writes,
        policyAction: adapter.policyAction,
        mayModifyUserContent: adapter.mayModifyUserContent,
        requiresApprovalByDefault: adapter.requiresApprovalByDefault,
        supportsAutoRetry: adapter.supportsAutoRetry,
        run: async () => {
          await this.deps.autoExecutionRuntime.runFromReady({
            taskId: input.taskId,
            novelId: input.novelId,
            request: input.request,
            existingPipelineJobId: input.existingPipelineJobId,
            existingState: input.existingState,
            resumeCheckpointType: input.resumeCheckpointType,
            previousFailureMessage: input.previousFailureMessage,
            allowSkipReviewBlockedChapter: input.allowSkipReviewBlockedChapter,
            approveAutoExecutionScope: input.approveAutoExecutionScope,
          });
        },
      },
      {
        taskId: input.taskId,
        novelId: input.novelId,
        targetType: adapter.targetType,
        targetId: input.novelId,
        payload: undefined,
        policy: {
          policy: {
            ...basePolicy,
            mode: "auto_safe_scope",
            allowExpensiveReview: input.approveAutoExecutionScope,
            updatedAt: new Date().toISOString(),
          },
        },
        reuseCompletedStep: false,
      },
    );
  }

  async continueTask(taskId: string, input?: {
    continuationMode?: DirectorContinuationMode;
    batchAlreadyStartedCount?: number;
    forceResume?: boolean;
  }): Promise<void> {
    const continuationMode = normalizeDirectorContinuationMode(input?.continuationMode);
    const row = await this.deps.workflowService.getTaskById(taskId);
    if (!row) {
      throw new Error("自动导演任务不存在。");
    }
    if (row.lane !== "auto_director") {
      await this.deps.workflowService.continueTask(taskId);
      return;
    }
    if (row.status === "running" && !row.pendingManualRecovery && input?.forceResume !== true) {
      return;
    }

    const seedPayload = parseSeedPayload<DirectorWorkflowSeedPayload>(row.seedPayloadJson) ?? {};
    const directorInput = getDirectorInputFromSeedPayload(seedPayload);
    const novelId = row.novelId ?? seedPayload.novelId ?? null;
    const fallbackRunMode = typeof seedPayload.runMode === "string"
      && (DIRECTOR_RUN_MODES as readonly string[]).includes(seedPayload.runMode)
      ? seedPayload.runMode as (typeof DIRECTOR_RUN_MODES)[number]
      : undefined;
    const storedRunMode = normalizeDirectorRunMode(directorInput?.runMode ?? fallbackRunMode);
    await this.deps.directorRuntime.initializeRun({
      taskId,
      novelId,
      entrypoint: "continue",
      policyMode: continuationMode !== "resume" || isFullBookAutopilotRunMode(storedRunMode)
        ? "auto_safe_scope"
        : "run_until_gate",
      summary: "自动导演任务从统一运行时继续。",
    });
    await this.deps.directorRuntime.recordRunResumed({
      taskId,
      novelId,
      summary: row.pendingManualRecovery
        ? "用户确认后，自动导演从待恢复状态继续。"
        : "自动导演按当前工作区内容重新判断后继续运行。",
      reason: row.pendingManualRecovery ? "manual_recovery_confirmed" : "continue_requested",
    });
    const resumedCandidateStage = await this.continueCandidateStageTask(taskId, {
      novelId,
      status: row.status,
      checkpointType: row.checkpointType,
      currentItemKey: row.currentItemKey,
      seedPayload,
    });
    if (resumedCandidateStage) {
      return;
    }
    if (!directorInput || !novelId) {
      throw new Error("自动导演任务缺少恢复所需上下文。");
    }

    const requestedSkipQualityRepair = shouldSkipCurrentQualityRepair({
      continuationMode,
      checkpointType: row.checkpointType,
      currentItemKey: row.currentItemKey,
      currentStage: row.currentStage,
    });
    const requestedAutoExecutionContinue = continuationMode === "auto_execute_range" || requestedSkipQualityRepair;
    const baseRunMode = normalizeDirectorRunMode(directorInput.runMode ?? fallbackRunMode);
    const runMode = requestedAutoExecutionContinue && !isDirectorAutoExecutionRunMode(baseRunMode)
      ? "auto_to_execution"
      : baseRunMode;
    const isFullBookAutopilot = isFullBookAutopilotRunMode(runMode);
    const effectiveDirectorInput = applyDirectorRunModeContract({
      ...directorInput,
      runMode,
    });
    const assetFirstRecovery = await this.resolveAssetFirstRecovery({
      novelId,
      directorInput: effectiveDirectorInput,
    });
    const canSkipReviewBlockedChapter = (
      row.status === "failed"
      || row.status === "cancelled"
    ) && (
      requestedAutoExecutionContinue
      || isFullBookAutopilot
    );
    const approveCurrentGate = continuationMode === "resume" || isFullBookAutopilot;
    const approveAutoExecutionGate = approveCurrentGate || requestedAutoExecutionContinue;

    if (assetFirstRecovery?.type === "auto_execution") {
      const resumedChapterId = (
        parseResumeTargetLike(row.resumeTargetJson)?.chapterId
        ?? parseResumeTargetLike(seedPayload.resumeTarget)?.chapterId
        ?? seedPayload.autoExecution?.nextChapterId
        ?? null
      );
      await this.deps.workflowService.markTaskRunning(taskId, {
        stage: assetFirstRecovery.resumeCheckpointType === "replan_required" ? "quality_repair" : "chapter_execution",
        itemKey: assetFirstRecovery.resumeCheckpointType === "replan_required" ? "quality_repair" : "chapter_execution",
        itemLabel: assetFirstRecovery.resumeCheckpointType === "replan_required"
          ? "正在根据当前内容恢复质量修复"
          : "正在根据当前内容恢复章节执行",
        progress: assetFirstRecovery.resumeCheckpointType === "replan_required" ? 0.975 : 0.93,
        clearCheckpoint: assetFirstRecovery.resumeCheckpointType === "chapter_batch_ready"
          || assetFirstRecovery.resumeCheckpointType === "replan_required",
        seedPayload: this.deps.buildDirectorSeedPayload(effectiveDirectorInput, novelId, {
          directorSession: buildDirectorSessionState({
            runMode: effectiveDirectorInput.runMode,
            phase: "chapter_execution",
            isBackgroundRunning: true,
          }),
          resumeTarget: buildNovelEditResumeTarget({
            novelId,
            taskId,
            stage: "pipeline",
            chapterId: resumedChapterId,
          }),
          autoExecution: seedPayload.autoExecution ?? null,
        }),
      });
      this.deps.scheduleBackgroundRun(taskId, async () => {
        const shouldResumeApprovedExecutionNode = (
          row.status === "waiting_approval"
          && assetFirstRecovery.resumeCheckpointType === "chapter_batch_ready"
          && requestedAutoExecutionContinue
        );
        if (shouldResumeApprovedExecutionNode) {
          await this.resumeApprovedChapterExecutionNode({
            taskId,
            novelId,
            request: effectiveDirectorInput,
            existingPipelineJobId: seedPayload.autoExecution?.pipelineJobId ?? null,
            existingState: seedPayload.autoExecution ?? null,
            resumeCheckpointType: "chapter_batch_ready",
            previousFailureMessage: row.lastError ?? null,
            allowSkipReviewBlockedChapter: canSkipReviewBlockedChapter,
            approveAutoExecutionScope: requestedAutoExecutionContinue || isFullBookAutopilot,
          });
          return;
        }
        await this.deps.autoExecutionRuntime.runFromReady({
          taskId,
          novelId,
          request: effectiveDirectorInput,
          existingPipelineJobId: seedPayload.autoExecution?.pipelineJobId ?? null,
          existingState: seedPayload.autoExecution ?? null,
          resumeCheckpointType: assetFirstRecovery.resumeCheckpointType,
          previousFailureMessage: row.lastError ?? null,
          allowSkipReviewBlockedChapter: canSkipReviewBlockedChapter,
          approveAutoExecutionScope: requestedAutoExecutionContinue || isFullBookAutopilot,
          skipCurrentQualityRepair: requestedSkipQualityRepair,
        });
      });
      return;
    }

    const inferredPhase = inferPhaseFromTaskState({
      currentItemKey: row.currentItemKey,
      seedPayload,
    });
    const phase = assetFirstRecovery?.type === "phase"
      ? assetFirstRecovery.phase
      : inferredPhase ?? await this.resolveResumePhase({ novelId });
    const directorSessionPhase = phase === "book_contract" ? "story_macro" : phase;
    const directorSession = buildDirectorSessionState({
      runMode: effectiveDirectorInput.runMode,
      phase: directorSessionPhase,
      isBackgroundRunning: true,
    });
    const recoveryResumeTarget = mergeResumeTargets(
      parseResumeTargetLike(row.resumeTargetJson),
      parseResumeTargetLike(seedPayload.resumeTarget),
    );
    const resumeTarget = buildNovelEditResumeTarget({
      novelId,
      taskId,
      stage: this.resolveDirectorEditStage(phase),
      volumeId: recoveryResumeTarget?.volumeId,
      chapterId: recoveryResumeTarget?.chapterId,
    });
    if (phase === "structured_outline") {
      await this.deps.assertHighMemoryStartAllowed({
        taskId,
        novelId,
        stage: "structured_outline",
        itemKey: "chapter_list",
        volumeId: recoveryResumeTarget?.volumeId,
        chapterId: recoveryResumeTarget?.chapterId,
        scope: recoveryResumeTarget?.volumeId || recoveryResumeTarget?.chapterId ? null : "book",
        batchAlreadyStartedCount: input?.batchAlreadyStartedCount,
      });
    }
    await this.deps.workflowService.bootstrapTask({
      workflowTaskId: taskId,
      novelId,
      lane: "auto_director",
      title: effectiveDirectorInput.candidate.workingTitle,
      seedPayload: this.deps.buildDirectorSeedPayload(effectiveDirectorInput, novelId, {
        directorSession,
        resumeTarget,
      }),
    });
    await this.deps.workflowService.markTaskRunning(taskId, {
      ...resolveDirectorRunningStateForPhase(phase === "book_contract" ? "story_macro" : phase),
      volumeId: recoveryResumeTarget?.volumeId,
      chapterId: recoveryResumeTarget?.chapterId,
    });
    this.deps.scheduleBackgroundRun(taskId, async () => {
      await this.runDirectorPipeline({
        taskId,
        novelId,
        input: effectiveDirectorInput,
        startPhase: phase === "book_contract" ? "story_macro" : phase,
        scope: normalizeDirectorMemoryScope({
          volumeId: recoveryResumeTarget?.volumeId,
          chapterId: recoveryResumeTarget?.chapterId,
          fallback: recoveryResumeTarget?.volumeId || recoveryResumeTarget?.chapterId ? null : "book",
        }),
        batchAlreadyStartedCount: input?.batchAlreadyStartedCount,
        approveCurrentGate,
        approveAutoExecutionScope: requestedAutoExecutionContinue || isFullBookAutopilot,
      });
    });
  }

  private resolveDirectorEditStage(
    phase: "story_macro" | "book_contract" | "character_setup" | "volume_strategy" | "structured_outline" | "chapter_execution",
  ): "story_macro" | "character" | "outline" | "structured" | "chapter" {
    if (phase === "story_macro" || phase === "book_contract") {
      return "story_macro";
    }
    if (phase === "character_setup") {
      return "character";
    }
    if (phase === "volume_strategy") {
      return "outline";
    }
    if (phase === "structured_outline") {
      return "structured";
    }
    return "chapter";
  }

  private continueCandidateStageTask(
    taskId: string,
    input: Parameters<NovelDirectorCandidateRuntime["continueTask"]>[1],
  ): Promise<boolean> {
    return this.deps.continueCandidateStageTask
      ? this.deps.continueCandidateStageTask(taskId, input)
      : this.deps.candidateRuntime.continueTask(taskId, input);
  }

  private runDirectorPipeline(input: DirectorPipelineRunInput): Promise<void> {
    return this.deps.runDirectorPipeline
      ? this.deps.runDirectorPipeline(input)
      : this.deps.pipelineRuntime.runPipeline(input);
  }

  async resolveAssetFirstRecovery(input: {
    novelId: string;
    directorInput: DirectorConfirmRequest;
  }): Promise<DirectorAssetFirstRecovery> {
    if (this.deps.resolveAssetFirstRecovery) {
      return this.deps.resolveAssetFirstRecovery(input);
    }
    return this.resolveAssetFirstRecoveryFromAvailableAssets(input);
  }

  async resolveAssetFirstRecoveryFromAvailableAssets(input: {
    novelId: string;
    directorInput: DirectorConfirmRequest;
  }): Promise<DirectorAssetFirstRecovery> {
    const takeoverState = await loadDirectorTakeoverState({
      novelId: input.novelId,
      autoExecutionPlan: input.directorInput.autoExecutionPlan,
      getStoryMacroPlan: (targetNovelId) => this.deps.storyMacroService.getPlan(targetNovelId),
      getDirectorAssetSnapshot: (targetNovelId) => this.deps.getDirectorAssetSnapshot(targetNovelId),
      getVolumeWorkspace: (targetNovelId) => this.deps.volumeService.getVolumes(targetNovelId),
      findActiveAutoDirectorTask: (targetNovelId) => this.deps.workflowService.findActiveTaskByNovelAndLane(targetNovelId, "auto_director"),
      findLatestAutoDirectorTask: (targetNovelId) => this.deps.workflowService.findLatestVisibleTaskByNovelId(targetNovelId, "auto_director"),
    });
    const structuredOutlineStep = takeoverState.snapshot.structuredOutlineRecoveryStep;
    const latestCheckpointType = takeoverState.latestCheckpoint?.checkpointType ?? null;
    const generatedChapterCount = takeoverState.snapshot.generatedChapterCount ?? 0;
    const autoExecutionRecovery = resolveAssetFirstRecoveryFromSnapshot({
      runMode: input.directorInput.runMode,
      structuredOutlineRecoveryStep: structuredOutlineStep,
      volumeCount: takeoverState.snapshot.volumeCount,
      hasVolumeStrategyPlan: Boolean(takeoverState.snapshot.hasVolumeStrategyPlan),
      hasActivePipelineJob: Boolean(takeoverState.activePipelineJob),
      hasExecutableRange: Boolean(takeoverState.executableRange),
      hasAutoExecutionState: Boolean(takeoverState.latestAutoExecutionState?.enabled) || generatedChapterCount > 0,
      hasMissingExecutionContractInRange: Boolean(takeoverState.snapshot.hasUnpreparedChaptersInRange),
      latestCheckpointType: (
        latestCheckpointType === "replan_required"
        || latestCheckpointType === "chapter_batch_ready"
      )
        ? latestCheckpointType
        : "chapter_batch_ready",
    });
    if (autoExecutionRecovery) {
      return autoExecutionRecovery;
    }
    return this.resolvePlanningPhaseFromTakeoverState(takeoverState);
  }

  private async resolveResumePhase(input: {
    novelId: string;
  }): Promise<"story_macro" | "book_contract" | "character_setup" | "volume_strategy" | "structured_outline"> {
    const takeoverState = await loadDirectorTakeoverState({
      novelId: input.novelId,
      getStoryMacroPlan: (targetNovelId) => this.deps.storyMacroService.getPlan(targetNovelId),
      getDirectorAssetSnapshot: (targetNovelId) => this.deps.getDirectorAssetSnapshot(targetNovelId),
      getVolumeWorkspace: (targetNovelId) => this.deps.volumeService.getVolumes(targetNovelId),
      findActiveAutoDirectorTask: (targetNovelId) => this.deps.workflowService.findActiveTaskByNovelAndLane(targetNovelId, "auto_director"),
      findLatestAutoDirectorTask: (targetNovelId) => this.deps.workflowService.findLatestVisibleTaskByNovelId(targetNovelId, "auto_director"),
    });
    const planningRecovery = this.resolvePlanningPhaseFromTakeoverState(takeoverState);
    if (planningRecovery?.type === "phase") {
      return planningRecovery.phase;
    }
    throw new DirectorRecoveryNotNeededError();
  }

  private resolvePlanningPhaseFromTakeoverState(
    input: Awaited<ReturnType<typeof loadDirectorTakeoverState>>,
  ): DirectorAssetFirstRecovery {
    if (!input.snapshot.hasStoryMacroPlan) {
      return { type: "phase", phase: "story_macro" };
    }
    if (!input.snapshot.hasBookContract) {
      return { type: "phase", phase: "book_contract" };
    }
    if (input.snapshot.characterCount === 0) {
      return { type: "phase", phase: "character_setup" };
    }
    if (!input.snapshot.hasVolumeStrategyPlan) {
      return { type: "phase", phase: "volume_strategy" };
    }
    if ((input.snapshot.structuredOutlineChapterOrders?.length ?? 0) === 0 && !input.executableRange) {
      return { type: "phase", phase: "structured_outline" };
    }
    if (!input.executableRange && (input.snapshot.chapterCount ?? 0) === 0) {
      return { type: "phase", phase: "structured_outline" };
    }
    return null;
  }
}
