import {
  isDirectorAutoExecutionRunMode,
  type DirectorRunMode,
} from "@ai-novel/shared/types/novelDirector";
import { normalizeDirectorRunMode } from "../runtime/novelDirectorHelpers";
import type { StructuredOutlineRecoveryStep } from "./novelDirectorStructuredOutlineRecovery";

export type DirectorPipelinePhase =
  | "story_macro"
  | "book_contract"
  | "world_setup"
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
  hasWorldSetupPrepared?: boolean;
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
    if (!input.hasWorldSetupPrepared) {
      return "world_setup";
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
    safePhase = input.hasWorldSetupPrepared ? "character_setup" : "world_setup";
  }
  if (safePhase === "book_contract" && !input.hasStoryMacroPlan) {
    safePhase = "story_macro";
  }
  if (safePhase === "world_setup" && (!input.hasStoryMacroPlan || !input.hasBookContract)) {
    safePhase = input.hasStoryMacroPlan ? "book_contract" : "story_macro";
  }
  if (
    (safePhase === "character_setup" || safePhase === "volume_strategy" || safePhase === "structured_outline")
    && !input.hasWorldSetupPrepared
  ) {
    safePhase = "world_setup";
  }
  if (
    (safePhase === "story_macro" || safePhase === "book_contract" || safePhase === "world_setup" || safePhase === "character_setup")
    && input.hasWorldSetupPrepared
    && input.hasCharacters
  ) {
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
  hasMissingExecutionContractInRange?: boolean;
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
  // 执行区持久化章节在目标范围内仍缺少完整细化时，优先回到节奏 / 拆章补齐，
  // 而不是进入章节执行——否则 runFromReady 会抛「缺少完整章节细化」并卡死。
  // 该信号基于执行区真实契约，弥补了卷工作区 cursor 与执行区可能不一致的缺口。
  if (
    isDirectorAutoExecutionRunMode(normalizeDirectorRunMode(input.runMode))
    && input.hasVolumeStrategyPlan
    && input.hasMissingExecutionContractInRange
    && !input.hasActivePipelineJob
  ) {
    return {
      type: "phase",
      phase: "structured_outline",
    };
  }

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
