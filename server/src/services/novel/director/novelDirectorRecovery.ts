import type { DirectorRunMode } from "@ai-novel/shared/types/novelDirector";
import { normalizeDirectorRunMode } from "./novelDirectorHelpers";
import type { StructuredOutlineRecoveryStep } from "./novelDirectorStructuredOutlineRecovery";

export type DirectorPipelinePhase =
  | "story_macro"
  | "character_setup"
  | "volume_strategy"
  | "structured_outline";

export function resolveObservedResumePhaseFromWorkspace(input: {
  hasVolumeWorkspace: boolean;
  hasVolumeStrategyPlan: boolean;
}): "structured_outline" | null {
  return input.hasVolumeWorkspace && input.hasVolumeStrategyPlan ? "structured_outline" : null;
}

export function resolveSafeDirectorPipelineStartPhase(input: {
  requestedPhase: DirectorPipelinePhase;
  hasVolumeWorkspace: boolean;
  hasVolumeStrategyPlan: boolean;
}): DirectorPipelinePhase {
  if (input.requestedPhase === "structured_outline" && (!input.hasVolumeWorkspace || !input.hasVolumeStrategyPlan)) {
    return "volume_strategy";
  }

  const observedPhase = resolveObservedResumePhaseFromWorkspace({
    hasVolumeWorkspace: input.hasVolumeWorkspace,
    hasVolumeStrategyPlan: input.hasVolumeStrategyPlan,
  });
  return observedPhase ?? input.requestedPhase;
}

export function resolveAssetFirstRecoveryFromSnapshot(input: {
  runMode?: DirectorRunMode;
  directorSessionPhase?: DirectorPipelinePhase | "candidate_selection" | "front10_ready" | null;
  structuredOutlineRecoveryStep?: StructuredOutlineRecoveryStep | null;
  volumeCount: number;
  hasVolumeStrategyPlan: boolean;
  hasActivePipelineJob: boolean;
  hasExecutableRange: boolean;
  hasAutoExecutionState: boolean;
  chapterSyncReady?: boolean;
  latestCheckpointType?: "front10_ready" | "chapter_batch_ready" | "replan_required" | null;
}):
  | {
    type: "auto_execution";
    resumeCheckpointType: "front10_ready" | "chapter_batch_ready" | "replan_required";
  }
  | {
    type: "phase";
    phase: "structured_outline";
  }
  | null {
  const chapterSyncReady = input.chapterSyncReady !== false;

  if (
    chapterSyncReady
    && normalizeDirectorRunMode(input.runMode) === "auto_to_execution"
    && (
      input.hasActivePipelineJob
      || input.hasExecutableRange
      || input.hasAutoExecutionState
    )
    && (
      input.structuredOutlineRecoveryStep === "chapter_sync"
      || input.structuredOutlineRecoveryStep === "completed"
      || input.hasExecutableRange
      || input.hasActivePipelineJob
    )
  ) {
    return {
      type: "auto_execution",
      resumeCheckpointType: input.latestCheckpointType === "chapter_batch_ready" || input.latestCheckpointType === "replan_required"
        ? input.latestCheckpointType
        : "front10_ready",
    };
  }

  if (
    input.directorSessionPhase === "story_macro"
    || input.directorSessionPhase === "character_setup"
    || input.directorSessionPhase === "volume_strategy"
  ) {
    return null;
  }

  if (input.hasVolumeStrategyPlan && (input.structuredOutlineRecoveryStep || input.volumeCount > 0)) {
    return {
      type: "phase",
      phase: "structured_outline",
    };
  }

  return null;
}
