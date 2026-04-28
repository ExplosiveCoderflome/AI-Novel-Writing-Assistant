import {
  DIRECTOR_RUN_MODES,
  type DirectorConfirmRequest,
  type DirectorContinuationMode,
} from "@ai-novel/shared/types/novelDirector";
import type { NovelContextService } from "../NovelContextService";
import type { StoryMacroPlanService } from "../storyMacro/StoryMacroPlanService";
import type { NovelVolumeService } from "../volume/NovelVolumeService";
import type { NovelWorkflowService } from "../workflow/NovelWorkflowService";
import {
  buildNovelEditResumeTarget,
  parseSeedPayload,
  parseResumeTarget,
} from "../workflow/novelWorkflow.shared";
import { normalizeDirectorMemoryScope } from "./autoDirectorMemorySafety";
import { DirectorRecoveryNotNeededError } from "./novelDirectorErrors";
import {
  buildDirectorSessionState,
  getDirectorInputFromSeedPayload,
  normalizeDirectorRunMode,
  type DirectorWorkflowSeedPayload,
} from "./novelDirectorHelpers";
import { resolveAssetFirstRecoveryFromSnapshot, resolveObservedResumePhaseFromWorkspace } from "./novelDirectorRecovery";
import {
  loadDirectorTakeoverState,
  resolveDirectorRunningStateForPhase,
} from "./novelDirectorTakeoverRuntime";
import type { DirectorRuntimeService } from "./runtime/DirectorRuntimeService";
import type { NovelDirectorCandidateRuntime } from "./novelDirectorCandidateRuntime";
import type { DirectorPipelineRunInput, NovelDirectorPipelineRuntime } from "./novelDirectorPipelineRuntime";
import type { NovelDirectorRuntimeOrchestrator } from "./novelDirectorRuntimeOrchestrator";

export type DirectorAssetFirstRecovery =
  | {
    type: "auto_execution";
    resumeCheckpointType: "front10_ready" | "chapter_batch_ready" | "replan_required";
  }
  | {
    type: "phase";
    phase: "structured_outline";
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

export class NovelDirectorContinueRuntime {
  constructor(private readonly deps: {
    workflowService: NovelWorkflowService;
    novelContextService: NovelContextService;
    storyMacroService: StoryMacroPlanService;
    volumeService: NovelVolumeService;
    directorRuntime: DirectorRuntimeService;
    runtimeOrchestrator: NovelDirectorRuntimeOrchestrator;
    candidateRuntime: NovelDirectorCandidateRuntime;
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

  async continueTask(taskId: string, input?: {
    continuationMode?: DirectorContinuationMode;
    batchAlreadyStartedCount?: number;
  }): Promise<void> {
    const row = await this.deps.workflowService.getTaskById(taskId);
    if (!row) {
      throw new Error("自动导演任务不存在。");
    }
    if (row.lane !== "auto_director") {
      await this.deps.workflowService.continueTask(taskId);
      return;
    }
    if (row.status === "running" && !row.pendingManualRecovery) {
      return;
    }

    const seedPayload = parseSeedPayload<DirectorWorkflowSeedPayload>(row.seedPayloadJson) ?? {};
    const directorInput = getDirectorInputFromSeedPayload(seedPayload);
    const novelId = row.novelId ?? seedPayload.novelId ?? null;
    await this.deps.directorRuntime.initializeRun({
      taskId,
      novelId,
      entrypoint: "continue",
      policyMode: input?.continuationMode ? "auto_safe_scope" : "run_until_gate",
      summary: "自动导演任务从统一运行时继续。",
    });
    if (novelId) {
      await this.deps.directorRuntime.analyzeWorkspace({
        novelId,
        workflowTaskId: taskId,
        includeAiInterpretation: false,
      }).catch(() => null);
    }
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
    const assetFirstRecovery = await this.resolveAssetFirstRecovery({
      novelId,
      directorInput,
    });
    const fallbackRunMode = typeof seedPayload.runMode === "string"
      && (DIRECTOR_RUN_MODES as readonly string[]).includes(seedPayload.runMode)
      ? seedPayload.runMode as (typeof DIRECTOR_RUN_MODES)[number]
      : undefined;
    const runMode = normalizeDirectorRunMode(directorInput.runMode ?? fallbackRunMode);
    const shouldResumeStoredBatchCheckpoint = runMode === "auto_to_execution"
      && (row.checkpointType === "chapter_batch_ready" || row.checkpointType === "replan_required");
    const canSkipReviewBlockedChapter = (
      row.status === "failed"
      || row.status === "cancelled"
    ) && (
      input?.continuationMode === "auto_execute_range"
      || input?.continuationMode === "auto_execute_front10"
    );
    if (
      assetFirstRecovery?.type === "auto_execution"
      || shouldResumeStoredBatchCheckpoint
    ) {
      const resumeCheckpointType = assetFirstRecovery?.type === "auto_execution"
        ? assetFirstRecovery.resumeCheckpointType
        : (
          row.checkpointType === "chapter_batch_ready" || row.checkpointType === "replan_required"
            ? row.checkpointType
            : "front10_ready"
        );
      const resumedChapterId = (
        parseResumeTargetLike(row.resumeTargetJson)?.chapterId
        ?? parseResumeTargetLike(seedPayload.resumeTarget)?.chapterId
        ?? seedPayload.autoExecution?.nextChapterId
        ?? null
      );
      await this.deps.workflowService.markTaskRunning(taskId, {
        stage: resumeCheckpointType === "replan_required" ? "quality_repair" : "chapter_execution",
        itemKey: resumeCheckpointType === "replan_required" ? "quality_repair" : "chapter_execution",
        itemLabel: resumeCheckpointType === "replan_required"
          ? "正在恢复当前质量修复批次"
          : "正在恢复当前章节批次",
        progress: resumeCheckpointType === "replan_required" ? 0.975 : 0.93,
        clearCheckpoint: resumeCheckpointType === "chapter_batch_ready" || resumeCheckpointType === "replan_required",
        seedPayload: this.deps.buildDirectorSeedPayload(directorInput, novelId, {
          directorSession: buildDirectorSessionState({
            runMode: directorInput.runMode,
            phase: "front10_ready",
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
        await this.deps.runtimeOrchestrator.runChapterExecutionNode({
          taskId,
          novelId,
          request: directorInput,
          existingPipelineJobId: seedPayload.autoExecution?.pipelineJobId ?? null,
          existingState: seedPayload.autoExecution ?? null,
          resumeCheckpointType,
          previousFailureMessage: row.lastError ?? null,
          allowSkipReviewBlockedChapter: canSkipReviewBlockedChapter,
        });
      });
      return;
    }

    const phase = assetFirstRecovery?.type === "phase"
      ? assetFirstRecovery.phase
      : await this.resolveResumePhase({
        novelId,
        checkpointType: row.checkpointType,
        directorSessionPhase: seedPayload.directorSession?.phase,
      });

    const directorSession = buildDirectorSessionState({
      runMode: directorInput.runMode,
      phase,
      isBackgroundRunning: true,
    });
    const resumeTarget = buildNovelEditResumeTarget({
      novelId,
      taskId,
      stage: this.resolveDirectorEditStage(phase),
    });
    const recoveryResumeTarget = mergeResumeTargets(
      parseResumeTargetLike(row.resumeTargetJson),
      parseResumeTargetLike(seedPayload.resumeTarget),
    );
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
      title: directorInput.candidate.workingTitle,
      seedPayload: this.deps.buildDirectorSeedPayload(directorInput, novelId, {
        directorSession,
        resumeTarget,
      }),
    });
    await this.deps.workflowService.markTaskRunning(taskId, resolveDirectorRunningStateForPhase(phase));
    this.deps.scheduleBackgroundRun(taskId, async () => {
      await this.runDirectorPipeline({
        taskId,
        novelId,
        input: directorInput,
        startPhase: phase,
        scope: normalizeDirectorMemoryScope({
          volumeId: recoveryResumeTarget?.volumeId,
          chapterId: recoveryResumeTarget?.chapterId,
          fallback: recoveryResumeTarget?.volumeId || recoveryResumeTarget?.chapterId ? null : "book",
        }),
        batchAlreadyStartedCount: input?.batchAlreadyStartedCount,
      });
    });
  }

  private resolveDirectorEditStage(
    phase: "story_macro" | "character_setup" | "volume_strategy" | "structured_outline" | "front10_ready",
  ): "story_macro" | "character" | "outline" | "structured" | "chapter" {
    if (phase === "story_macro") {
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

  private async resolveObservedResumePhase(
    novelId: string,
  ): Promise<"structured_outline" | null> {
    const workspace = await this.deps.volumeService.getVolumes(novelId).catch(() => null);
    return resolveObservedResumePhaseFromWorkspace({
      hasVolumeWorkspace: Boolean(workspace?.volumes.length),
      hasVolumeStrategyPlan: Boolean(workspace?.strategyPlan),
    });
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
    return resolveAssetFirstRecoveryFromSnapshot({
      runMode: input.directorInput.runMode,
      structuredOutlineRecoveryStep: structuredOutlineStep,
      volumeCount: takeoverState.snapshot.volumeCount,
      hasVolumeStrategyPlan: Boolean(takeoverState.snapshot.hasVolumeStrategyPlan),
      hasActivePipelineJob: Boolean(takeoverState.activePipelineJob),
      hasExecutableRange: Boolean(takeoverState.executableRange),
      hasAutoExecutionState: Boolean(takeoverState.latestAutoExecutionState?.enabled),
      latestCheckpointType,
    });
  }

  private async resolveResumePhase(input: {
    novelId: string;
    checkpointType: string | null;
    directorSessionPhase?: "candidate_selection" | "story_macro" | "character_setup" | "volume_strategy" | "structured_outline" | "front10_ready";
  }): Promise<"story_macro" | "character_setup" | "volume_strategy" | "structured_outline"> {
    const observedPhase = await this.resolveObservedResumePhase(input.novelId);
    if (observedPhase) {
      return observedPhase;
    }
    if (input.checkpointType === "character_setup_required") {
      const characters = await this.deps.novelContextService.listCharacters(input.novelId);
      if (characters.length === 0) {
        return "character_setup";
      }
      return "volume_strategy";
    }
    if (input.checkpointType === "volume_strategy_ready") {
      return "structured_outline";
    }
    if (input.checkpointType === "front10_ready") {
      const assets = await this.deps.getDirectorAssetSnapshot(input.novelId);
      if (assets.characterCount === 0) {
        return "character_setup";
      }
      if (assets.chapterCount === 0 || assets.firstVolumeChapterCount === 0) {
        return assets.hasVolumeStrategyPlan ? "structured_outline" : "volume_strategy";
      }
      throw new DirectorRecoveryNotNeededError();
    }
    if (
      input.directorSessionPhase === "story_macro"
      || input.directorSessionPhase === "character_setup"
      || input.directorSessionPhase === "volume_strategy"
      || input.directorSessionPhase === "structured_outline"
    ) {
      return input.directorSessionPhase;
    }
    throw new Error("当前检查点不支持继续自动导演。");
  }
}
