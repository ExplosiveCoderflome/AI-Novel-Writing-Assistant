import type { DirectorTakeoverReadinessResponse, DirectorTakeoverRequest, DirectorTakeoverResponse } from "@ai-novel/shared/types/novelDirector";
import { AppError } from "../../middleware/errorHandler";
import type { NovelService } from "../novel/NovelService";
import type { StoryMacroPlanService } from "../novel/storyMacro/StoryMacroPlanService";
import type { NovelVolumeService } from "../novel/volume/NovelVolumeService";
import type { NovelWorkflowService } from "../novel/workflow/NovelWorkflowService";
import { buildDirectorTakeoverInput, buildDirectorTakeoverReadiness, isTakeoverStructuredOutlineReadyForValidation } from "./takeover";
import { NovelDirectorAutoExecutionRuntime } from "./autoExecutionRuntime";
import { validateAutoDirectorTakeoverRequest } from "./autoValidationService";
import { loadDirectorTakeoverState } from "./takeoverRuntime";
import { startDirectorTakeoverExecution } from "./takeoverExecution";
import { resetDirectorTakeoverCurrentStep, resetDirectorTakeoverDownstreamState } from "./takeoverReset";
import { cancelContinueExistingReplacedRuns } from "./takeoverContinue";
import type { DirectorConfirmRequest } from "@ai-novel/shared/types/novelDirector";

export interface DirectorTakeoverFlowDeps {
  storyMacroService: StoryMacroPlanService;
  volumeService: NovelVolumeService;
  workflowService: NovelWorkflowService;
  autoExecutionRuntime: NovelDirectorAutoExecutionRuntime;
  novelService: NovelService;
  getDirectorAssetSnapshot: (novelId: string) => ReturnType<NovelVolumeService["getVolumes"]> | Promise<unknown>;
  enrichDirectorStyleContext: <T extends { styleProfileId?: string; styleTone?: string; styleIntentSummary?: unknown }>(input: T) => Promise<T>;
  ensurePrimaryNovelStyleBinding: (novelId: string, styleProfileId: string | null | undefined) => Promise<void>;
  buildDirectorSeedPayload: (request: DirectorConfirmRequest, novelId: string | null, extra?: Record<string, unknown>) => Record<string, unknown>;
  scheduleBackgroundRun: (taskId: string, runner: () => Promise<void>) => void;
  runDirectorPipeline: (input: {
    taskId: string;
    novelId: string;
    input: DirectorConfirmRequest;
    startPhase: "story_macro" | "character_setup" | "volume_strategy" | "structured_outline";
    scope?: string | null;
    batchAlreadyStartedCount?: number;
  }) => Promise<void>;
  assertHighMemoryDirectorStartAllowed: (input: {
    taskId: string;
    novelId: string;
    stage: "structured_outline";
    itemKey: "beat_sheet" | "chapter_list" | "chapter_detail_bundle" | "chapter_sync";
    volumeId?: string | null;
    chapterId?: string | null;
    scope?: string | null;
    batchAlreadyStartedCount?: number;
  }) => Promise<void>;
}

export async function getTakeoverReadiness(
  deps: DirectorTakeoverFlowDeps,
  novelId: string,
): Promise<DirectorTakeoverReadinessResponse> {
  const takeoverState = await loadDirectorTakeoverState({
    novelId,
    getStoryMacroPlan: (targetNovelId) => deps.storyMacroService.getPlan(targetNovelId),
    getDirectorAssetSnapshot: (targetNovelId) => deps.getDirectorAssetSnapshot(targetNovelId) as any,
    getVolumeWorkspace: (targetNovelId) => deps.volumeService.getVolumes(targetNovelId),
    findActiveAutoDirectorTask: (targetNovelId) => deps.workflowService.findActiveTaskByNovelAndLane(targetNovelId, "auto_director"),
    findLatestAutoDirectorTask: (targetNovelId) => deps.workflowService.findLatestVisibleTaskByNovelId(targetNovelId, "auto_director"),
  });
  return buildDirectorTakeoverReadiness({
    novel: takeoverState.novel,
    snapshot: takeoverState.snapshot,
    hasActiveTask: takeoverState.hasActiveTask,
    activeTaskId: takeoverState.activeTaskId,
    activePipelineJob: takeoverState.activePipelineJob,
    latestCheckpoint: takeoverState.latestCheckpoint,
    executableRange: takeoverState.executableRange,
  });
}

export async function startTakeover(
  deps: DirectorTakeoverFlowDeps,
  input: DirectorTakeoverRequest,
): Promise<DirectorTakeoverResponse> {
  const takeoverState = await loadDirectorTakeoverState({
    novelId: input.novelId,
    autoExecutionPlan: input.autoExecutionPlan,
    getStoryMacroPlan: (targetNovelId) => deps.storyMacroService.getPlan(targetNovelId),
    getDirectorAssetSnapshot: (targetNovelId) => deps.getDirectorAssetSnapshot(targetNovelId) as any,
    getVolumeWorkspace: (targetNovelId) => deps.volumeService.getVolumes(targetNovelId),
    findActiveAutoDirectorTask: (targetNovelId) => deps.workflowService.findActiveTaskByNovelAndLane(targetNovelId, "auto_director"),
    findLatestAutoDirectorTask: (targetNovelId) => deps.workflowService.findLatestVisibleTaskByNovelId(targetNovelId, "auto_director"),
  });
  const takeoverStrategy = input.strategy ?? (input.startPhase ? "restart_current_step" : "continue_existing");
  if (takeoverState.hasActiveTask && takeoverStrategy !== "continue_existing") {
    throw new Error("当前已有自动导演任务在运行或等待审核，请先继续或取消当前任务。");
  }
  const takeoverValidation = validateAutoDirectorTakeoverRequest({
    source: "takeover",
    request: input,
    assets: {
      hasProjectSetup: true,
      hasStoryMacroPlan: takeoverState.snapshot.hasStoryMacroPlan,
      hasBookContract: takeoverState.snapshot.hasBookContract,
      characterCount: takeoverState.snapshot.characterCount,
      volumeCount: takeoverState.snapshot.volumeCount,
      hasVolumeStrategyPlan: takeoverState.snapshot.hasVolumeStrategyPlan,
      hasStructuredOutline: isTakeoverStructuredOutlineReadyForValidation(takeoverState.snapshot),
      totalChapterCount: takeoverState.snapshot.chapterCount,
      volumeChapterRanges: takeoverState.snapshot.volumeChapterRanges,
      structuredOutlineChapterOrders: takeoverState.snapshot.structuredOutlineChapterOrders,
    },
  });
  if (!takeoverValidation.allowed) {
    throw new AppError(takeoverValidation.blockingReasons.join("；") || "当前接管请求需要先重新校验。", 409);
  }

  const takeoverDirectorInput = buildDirectorTakeoverInput({
    novel: takeoverState.novel,
    storyMacroPlan: takeoverState.storyMacroPlan,
    bookContract: takeoverState.bookContract,
    runMode: input.runMode,
  });
  const directorInput = await deps.enrichDirectorStyleContext({
    ...takeoverDirectorInput,
    styleProfileId: input.styleProfileId ?? takeoverDirectorInput.styleProfileId,
    autoExecutionPlan: input.autoExecutionPlan,
    autoApproval: input.autoApproval,
    provider: input.provider ?? takeoverDirectorInput.provider,
    model: input.model?.trim() || takeoverDirectorInput.model,
    temperature: typeof input.temperature === "number" ? input.temperature : takeoverDirectorInput.temperature,
  });
  await deps.ensurePrimaryNovelStyleBinding(input.novelId, directorInput.styleProfileId);
  return startDirectorTakeoverExecution({
    request: input,
    takeoverState,
    directorInput,
    workflowService: deps.workflowService,
    autoExecutionRuntime: deps.autoExecutionRuntime,
    buildDirectorSeedPayload: (request, novelId, extra) => deps.buildDirectorSeedPayload(request, novelId, extra),
    scheduleBackgroundRun: (taskId, runner) => deps.scheduleBackgroundRun(taskId, runner),
    runDirectorPipeline: (payload) => deps.runDirectorPipeline(payload),
    assertHighMemoryStartAllowed: (payload) => deps.assertHighMemoryDirectorStartAllowed(payload),
    createRewriteSnapshot: async ({ novelId, label }) => {
      const snapshot = await deps.novelService.createNovelSnapshot(novelId, "before_pipeline", label);
      return {
        snapshotId: snapshot.id,
        label: snapshot.label ?? label,
        restoreEntry: "version_history",
      };
    },
    recordRewriteSnapshotMilestone: ({ taskId, summary }) => deps.workflowService.recordRewriteSnapshotMilestone(taskId, {
      summary,
    }),
    prepareRestartStep: async ({ plan, takeoverState: currentTakeoverState, directorInput }) => {
      await resetDirectorTakeoverCurrentStep({
        novelId: input.novelId,
        plan,
        autoExecutionPlan: directorInput.autoExecutionPlan,
        takeoverState: currentTakeoverState,
        deps: {
          getVolumeWorkspace: (targetNovelId) => deps.volumeService.getVolumes(targetNovelId),
          updateVolumeWorkspace: (targetNovelId, payload) => deps.volumeService.updateVolumes(targetNovelId, payload),
          cancelPipelineJob: (jobId) => deps.novelService.cancelPipelineJob(jobId),
        },
      });
    },
    resetDownstreamState: async ({ plan, takeoverState: currentTakeoverState, directorInput }) => {
      await resetDirectorTakeoverDownstreamState({
        novelId: input.novelId,
        plan,
        autoExecutionPlan: directorInput.autoExecutionPlan,
        takeoverState: currentTakeoverState,
        deps: {
          getVolumeWorkspace: (targetNovelId) => deps.volumeService.getVolumes(targetNovelId),
          updateVolumeWorkspace: (targetNovelId, payload) => deps.volumeService.updateVolumes(targetNovelId, payload),
          cancelPipelineJob: (jobId) => deps.novelService.cancelPipelineJob(jobId),
        },
      });
    },
    cancelReplacedRuns: async ({ replacementTaskId, directorInput, takeoverState: currentTakeoverState }) => {
      await cancelContinueExistingReplacedRuns({
        novelId: input.novelId,
        replacementTaskId,
        autoExecutionPlan: directorInput.autoExecutionPlan,
        resolvedRange: currentTakeoverState.executableRange,
        getVolumeWorkspace: (targetNovelId) => deps.volumeService.getVolumes(targetNovelId),
        cancelPipelineJob: (jobId) => deps.novelService.cancelPipelineJob(jobId),
      });
    },
  });
}
