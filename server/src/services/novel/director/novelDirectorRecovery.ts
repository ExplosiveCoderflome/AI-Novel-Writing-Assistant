import {
  isDirectorAutoExecutionRunMode,
  type DirectorRunMode,
} from "@ai-novel/shared/types/novelDirector";
import { normalizeDirectorRunMode } from "./novelDirectorHelpers";
import type { StructuredOutlineRecoveryStep } from "./novelDirectorStructuredOutlineRecovery";

export type DirectorPipelinePhase =
  | "story_macro"
  | "book_contract"
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
  hasStoryMacroPlan?: boolean;
  hasBookContract?: boolean;
  hasCharacters?: boolean;
  hasVolumeWorkspace: boolean;
  hasVolumeStrategyPlan: boolean;
}): DirectorPipelinePhase {
  const observedPhase = resolveObservedResumePhaseFromWorkspace({
    hasVolumeWorkspace: input.hasVolumeWorkspace,
    hasVolumeStrategyPlan: input.hasVolumeStrategyPlan,
  });
  const shouldEnterStructuredOutline = input.requestedPhase === "structured_outline" || Boolean(observedPhase);
  if (shouldEnterStructuredOutline) {
    if (!input.hasStoryMacroPlan) {
      return "story_macro";
    }
    if (!input.hasBookContract) {
      return "book_contract";
    }
    if (!input.hasCharacters) {
      return "character_setup";
    }
    if (!input.hasVolumeWorkspace || !input.hasVolumeStrategyPlan) {
      return "volume_strategy";
    }
    return "structured_outline";
  }

  let safePhase = input.requestedPhase;
  if (safePhase === "story_macro" && input.hasStoryMacroPlan && !input.hasBookContract) {
    safePhase = "book_contract";
  }
  if (
    (safePhase === "story_macro" || safePhase === "book_contract")
    && input.hasStoryMacroPlan
    && input.hasBookContract
  ) {
    safePhase = "character_setup";
  }
  if (safePhase === "book_contract" && !input.hasStoryMacroPlan) {
    safePhase = "story_macro";
  }
  if ((safePhase === "story_macro" || safePhase === "book_contract" || safePhase === "character_setup") && input.hasCharacters) {
    safePhase = "volume_strategy";
  }
  return safePhase;
}

export function resolveAssetFirstRecoveryFromSnapshot(input: {
  runMode?: DirectorRunMode;
  structuredOutlineRecoveryStep?: StructuredOutlineRecoveryStep | null;
  volumeCount: number;
  hasVolumeStrategyPlan: boolean;
  hasActivePipelineJob: boolean;
  hasExecutableRange: boolean;
  hasAutoExecutionState: boolean;
  latestCheckpointType?: "chapter_batch_ready" | "replan_required" | null;
}):
  | {
    type: "auto_execution";
    resumeCheckpointType: "chapter_batch_ready" | "replan_required";
  }
  | {
    type: "phase";
    phase: "structured_outline";
  }
  | null {
  if (
    isDirectorAutoExecutionRunMode(normalizeDirectorRunMode(input.runMode))
    && input.hasVolumeStrategyPlan
    && input.structuredOutlineRecoveryStep
    && (
      input.structuredOutlineRecoveryStep !== "chapter_sync"
      || !input.hasExecutableRange
    )
    && input.structuredOutlineRecoveryStep !== "completed"
  ) {
    return {
      type: "phase",
      phase: "structured_outline",
    };
  }

  if (
    isDirectorAutoExecutionRunMode(normalizeDirectorRunMode(input.runMode))
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
        : "chapter_batch_ready",
    };
  }

  if (input.hasVolumeStrategyPlan && (input.structuredOutlineRecoveryStep || input.volumeCount > 0)) {
    return {
      type: "phase",
      phase: "structured_outline",
    };
  }

  return null;
}
