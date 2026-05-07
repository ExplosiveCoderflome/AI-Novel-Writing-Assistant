import type { DirectorConfirmRequest } from "@ai-novel/shared/types/novelDirector";
import type { NovelContextService } from "../novel/NovelContextService";
import type { StoryMacroPlanService } from "../novel/storyMacro/StoryMacroPlanService";
import type { NovelVolumeService } from "../novel/volume/NovelVolumeService";
import type { NovelWorkflowService } from "../novel/workflow/NovelWorkflowService";
import { DirectorRecoveryNotNeededError } from "./errors";
import {
  resolveAssetFirstRecoveryFromSnapshot,
  resolveObservedResumePhaseFromWorkspace,
  resolveSafeDirectorPipelineStartPhase,
} from "./recovery";
import { flattenPreparedOutlineChapters } from "./structuredOutlineRecovery";
import { loadDirectorTakeoverState } from "./takeoverRuntime";

export interface DirectorPhaseResolverDeps {
  volumeService: NovelVolumeService;
  novelContextService: NovelContextService;
  storyMacroService: StoryMacroPlanService;
  workflowService: NovelWorkflowService;
}

export function resolveDirectorEditStage(
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

export async function getDirectorAssetSnapshot(
  deps: DirectorPhaseResolverDeps,
  novelId: string,
) {
  const [characters, chapters, workspace] = await Promise.all([
    deps.novelContextService.listCharacters(novelId),
    deps.novelContextService.listChapters(novelId),
    deps.volumeService.getVolumes(novelId).catch(() => null),
  ]);
  const firstVolume = workspace?.volumes[0] ?? null;
  const preparedOutlineChapters = workspace ? flattenPreparedOutlineChapters(workspace) : [];
  return {
    characterCount: characters.length,
    chapterCount: chapters.length,
    volumeCount: workspace?.volumes.length ?? 0,
    hasVolumeStrategyPlan: Boolean(workspace?.strategyPlan),
    firstVolumeId: firstVolume?.id ?? null,
    firstVolumeChapterCount: firstVolume?.chapters.length ?? 0,
    volumeChapterRanges: (workspace?.volumes ?? []).map((volume) => {
      const orders = volume.chapters
        .map((chapter) => chapter.chapterOrder)
        .filter((order) => Number.isFinite(order))
        .sort((left, right) => left - right);
      return orders.length > 0
        ? {
          volumeOrder: volume.sortOrder,
          startOrder: orders[0],
          endOrder: orders[orders.length - 1],
        }
        : null;
    }).filter((range): range is { volumeOrder: number; startOrder: number; endOrder: number } => Boolean(range)),
    structuredOutlineChapterOrders: preparedOutlineChapters.map((chapter) => chapter.chapterOrder),
  };
}

export async function resolveObservedResumePhase(
  deps: DirectorPhaseResolverDeps,
  novelId: string,
): Promise<"structured_outline" | null> {
  const workspace = await deps.volumeService.getVolumes(novelId).catch(() => null);
  return resolveObservedResumePhaseFromWorkspace({
    hasVolumeWorkspace: Boolean(workspace?.volumes.length),
    hasVolumeStrategyPlan: Boolean(workspace?.strategyPlan),
  });
}

export async function resolveAssetFirstRecovery(
  deps: DirectorPhaseResolverDeps,
  input: {
    novelId: string;
    directorInput: DirectorConfirmRequest;
  },
): Promise<
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
  const takeoverState = await loadDirectorTakeoverState({
    novelId: input.novelId,
    autoExecutionPlan: input.directorInput.autoExecutionPlan,
    getStoryMacroPlan: (targetNovelId) => deps.storyMacroService.getPlan(targetNovelId),
    getDirectorAssetSnapshot: (targetNovelId) => getDirectorAssetSnapshot(deps, targetNovelId),
    getVolumeWorkspace: (targetNovelId) => deps.volumeService.getVolumes(targetNovelId),
    findActiveAutoDirectorTask: (targetNovelId) => deps.workflowService.findActiveTaskByNovelAndLane(targetNovelId, "auto_director"),
    findLatestAutoDirectorTask: (targetNovelId) => deps.workflowService.findLatestVisibleTaskByNovelId(targetNovelId, "auto_director"),
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

export async function resolveResumePhase(
  deps: DirectorPhaseResolverDeps,
  input: {
    novelId: string;
    checkpointType: string | null;
    directorSessionPhase?: "candidate_selection" | "story_macro" | "character_setup" | "volume_strategy" | "structured_outline" | "front10_ready";
  },
): Promise<"story_macro" | "character_setup" | "volume_strategy" | "structured_outline"> {
  const observedPhase = await resolveObservedResumePhase(deps, input.novelId);
  if (observedPhase) {
    return observedPhase;
  }
  if (input.checkpointType === "character_setup_required") {
    const characters = await deps.novelContextService.listCharacters(input.novelId);
    if (characters.length === 0) {
      return "character_setup";
    }
    return "volume_strategy";
  }
  if (input.checkpointType === "volume_strategy_ready") {
    return "structured_outline";
  }
  if (input.checkpointType === "front10_ready") {
    const assets = await getDirectorAssetSnapshot(deps, input.novelId);
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

export async function resolveSafePipelineStartPhase(
  deps: DirectorPhaseResolverDeps,
  input: {
    novelId: string;
    requestedPhase: "story_macro" | "character_setup" | "volume_strategy" | "structured_outline";
  },
): Promise<"story_macro" | "character_setup" | "volume_strategy" | "structured_outline"> {
  const workspace = await deps.volumeService.getVolumes(input.novelId).catch(() => null);
  return resolveSafeDirectorPipelineStartPhase({
    requestedPhase: input.requestedPhase,
    hasVolumeWorkspace: Boolean(workspace?.volumes.length),
    hasVolumeStrategyPlan: Boolean(workspace?.strategyPlan),
  });
}
