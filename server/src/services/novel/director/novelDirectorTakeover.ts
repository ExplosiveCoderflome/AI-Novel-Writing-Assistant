import type {
  BookSpec,
  DirectorCandidate,
  DirectorConfirmRequest,
  DirectorRunMode,
  DirectorTakeoverEntryReadiness,
  DirectorTakeoverEntryStep,
  DirectorTakeoverExecutableRangeSnapshot,
  DirectorTakeoverPipelineJobSnapshot,
  DirectorTakeoverPreview,
  DirectorTakeoverReadinessResponse,
  DirectorTakeoverStageReadiness,
  DirectorTakeoverStartPhase,
  DirectorTakeoverStrategy,
  DirectorTakeoverCheckpointSnapshot,
} from "@ai-novel/shared/types/novelDirector";
import { DIRECTOR_TAKEOVER_ENTRY_STEPS } from "@ai-novel/shared/types/novelDirector";
import type { BookContract } from "@ai-novel/shared/types/novelWorkflow";
import type { StoryMacroPlan } from "@ai-novel/shared/types/storyMacro";

export type { DirectorTakeoverNovelContext } from "./novelDirectorTakeoverDecision";
import type { DirectorTakeoverNovelContext } from "./novelDirectorTakeoverDecision";

import {
  DIRECTOR_TAKEOVER_STAGE_META,
  TAKEOVER_ENTRY_META,
  buildDirectorTakeoverInput,
  buildTakeoverCandidate,
  buildTakeoverIdea,
  entryStepToWorkflowStage,
  hasAnyStructuredAsset,
  hasExecutableRange,
  hasMeaningfulSeedMaterial,
  hasPendingRepairContext,
  isCharacterReady,
  isChapterSyncReady,
  isOutlineReady,
  isStoryMacroReady,
  isStructuredReady,
  phaseToEntryStep,
  resolveDirectorTakeoverPlan,
  type DirectorTakeoverAssetSnapshot,
  type DirectorTakeoverDecisionInput,
} from "./novelDirectorTakeoverDecision";
export {
  buildDirectorTakeoverInput,
  resolveDirectorTakeoverPlan,
} from "./novelDirectorTakeoverDecision";
export type {
  DirectorTakeoverAssetSnapshot,
  DirectorTakeoverDecisionInput,
  DirectorTakeoverResolvedPlan,
} from "./novelDirectorTakeoverDecision";

function buildStoryMacroReadiness(
  novel: DirectorTakeoverNovelContext,
): Pick<DirectorTakeoverStageReadiness, "available" | "reason"> {
  if (hasMeaningfulSeedMaterial(novel)) {
    return {
      available: true,
      reason: "当前书级信息已具备，可以从故事宏观规划开始接管。",
    };
  }
  return {
    available: false,
    reason: "请至少补充一句故事概述、书级卖点、对标气质或前30章承诺，再启动自动接管。",
  };
}

function buildCharacterSetupReadiness(
  snapshot: DirectorTakeoverAssetSnapshot,
): Pick<DirectorTakeoverStageReadiness, "available" | "reason"> {
  if (!isStoryMacroReady(snapshot)) {
    return {
      available: false,
      reason: "跳过故事宏观规划前，需要先具备 Story Macro 与 Book Contract。",
    };
  }
  return {
    available: true,
    reason: "书级规划已齐，可以从角色准备继续接管。",
  };
}

function buildVolumeStrategyReadiness(
  snapshot: DirectorTakeoverAssetSnapshot,
): Pick<DirectorTakeoverStageReadiness, "available" | "reason"> {
  if (!isStoryMacroReady(snapshot)) {
    return {
      available: false,
      reason: "跳过前置阶段前，需要先具备 Story Macro 与 Book Contract。",
    };
  }
  if (!isCharacterReady(snapshot)) {
    return {
      available: false,
      reason: "从卷战略开始前，至少需要 1 位已确认角色。",
    };
  }
  return {
    available: true,
    reason: "书级规划和角色资产已齐，可以从卷战略继续。",
  };
}

function buildStructuredOutlineReadiness(
  snapshot: DirectorTakeoverAssetSnapshot,
): Pick<DirectorTakeoverStageReadiness, "available" | "reason"> {
  if (!isStoryMacroReady(snapshot)) {
    return {
      available: false,
      reason: "跳过前置阶段前，需要先具备 Story Macro 与 Book Contract。",
    };
  }
  if (!isCharacterReady(snapshot)) {
    return {
      available: false,
      reason: "从节奏 / 拆章开始前，至少需要 1 位已确认角色。",
    };
  }
  if (!isOutlineReady(snapshot)) {
    return {
      available: false,
      reason: "从节奏 / 拆章开始前，需要先有卷战略 / 卷骨架。",
    };
  }
  return {
    available: true,
    reason: "卷级资产已存在，可以直接从节奏 / 拆章开始继续。",
  };
}

function resolveRecommendedTakeoverPhase(snapshot: DirectorTakeoverAssetSnapshot): DirectorTakeoverStartPhase {
  if (!isStoryMacroReady(snapshot)) {
    return "story_macro";
  }
  if (!isCharacterReady(snapshot)) {
    return "character_setup";
  }
  if (!isOutlineReady(snapshot)) {
    return "volume_strategy";
  }
  return "structured_outline";
}

function buildPreviewOrFallback(input: {
  entryStep: DirectorTakeoverEntryStep;
  strategy: DirectorTakeoverStrategy;
  snapshot: DirectorTakeoverAssetSnapshot;
  activePipelineJob?: DirectorTakeoverPipelineJobSnapshot | null;
  latestCheckpoint?: DirectorTakeoverCheckpointSnapshot | null;
  executableRange?: DirectorTakeoverExecutableRangeSnapshot | null;
}): DirectorTakeoverPreview {
  try {
    const plan = resolveDirectorTakeoverPlan(input);
    return {
      strategy: input.strategy,
      summary: plan.summary,
      effectSummary: plan.effectSummary,
      effectiveStep: plan.effectiveStep,
      effectiveStage: plan.effectiveStage,
      skipSteps: plan.skipSteps,
      continueStep: plan.currentStep ?? null,
      restartStep: plan.restartStep ?? null,
      usesCurrentBatch: plan.usesCurrentBatch,
      impactNotes: plan.impactNotes,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "当前条件下暂时不能从这一步接管。";
    return {
      strategy: input.strategy,
      summary: input.strategy === "continue_existing" ? "当前还不能继续已有进度。" : "当前还不能重跑这一步。",
      effectSummary: message,
      effectiveStep: input.entryStep,
      effectiveStage: entryStepToWorkflowStage(input.entryStep),
      skipSteps: [],
      continueStep: input.strategy === "continue_existing" ? input.entryStep : null,
      restartStep: input.strategy === "restart_current_step" ? input.entryStep : null,
      usesCurrentBatch: false,
      impactNotes: [message],
    };
  }
}

function buildEntryStepStatus(input: {
  step: DirectorTakeoverEntryStep;
  novel: DirectorTakeoverNovelContext;
  snapshot: DirectorTakeoverAssetSnapshot;
  activePipelineJob?: DirectorTakeoverPipelineJobSnapshot | null;
  latestCheckpoint?: DirectorTakeoverCheckpointSnapshot | null;
  executableRange?: DirectorTakeoverExecutableRangeSnapshot | null;
}): DirectorTakeoverEntryReadiness["status"] {
  const { snapshot } = input;
  if (input.step === "basic") {
    return hasMeaningfulSeedMaterial(input.novel) ? "ready" : "missing";
  }
  if (input.step === "story_macro") {
    if (snapshot.hasStoryMacroPlan && snapshot.hasBookContract) return "complete";
    if (snapshot.hasStoryMacroPlan || snapshot.hasBookContract) return "partial";
    return "missing";
  }
  if (input.step === "character") {
    if (!isStoryMacroReady(snapshot)) return "blocked";
    return isCharacterReady(snapshot) ? "complete" : "missing";
  }
  if (input.step === "outline") {
    if (!isStoryMacroReady(snapshot) || !isCharacterReady(snapshot)) return "blocked";
    return isOutlineReady(snapshot) ? "complete" : "missing";
  }
  if (input.step === "structured") {
    if (!isStoryMacroReady(snapshot) || !isCharacterReady(snapshot) || !isOutlineReady(snapshot)) return "blocked";
    if (isStructuredReady(snapshot)) return "complete";
    if (hasAnyStructuredAsset(snapshot)) return "partial";
    return "missing";
  }
  if (input.step === "chapter") {
    if ((!isStructuredReady(snapshot) || !isChapterSyncReady(snapshot)) && !hasExecutableRange(input)) return "blocked";
    if (input.activePipelineJob) return "partial";
    if (hasExecutableRange(input)) return "ready";
    return "missing";
  }
  if ((!isStructuredReady(snapshot) || !isChapterSyncReady(snapshot)) && !hasExecutableRange(input)) return "blocked";
  if (input.activePipelineJob || hasPendingRepairContext(input)) return "ready";
  if ((snapshot.approvedChapterCount ?? 0) > 0) return "complete";
  return "missing";
}

function buildEntryReason(input: {
  step: DirectorTakeoverEntryStep;
  status: DirectorTakeoverEntryReadiness["status"];
  snapshot: DirectorTakeoverAssetSnapshot;
  latestCheckpoint?: DirectorTakeoverCheckpointSnapshot | null;
  activePipelineJob?: DirectorTakeoverPipelineJobSnapshot | null;
  executableRange?: DirectorTakeoverExecutableRangeSnapshot | null;
}): string {
  if (input.step === "basic") {
    return "会优先检查当前项目已有资产，从最早缺失步骤开始继续。";
  }
  if (input.step === "story_macro") {
    return input.status === "complete"
      ? "Story Macro 与 Book Contract 已具备，继续模式会自动推进到下一缺失步骤。"
      : "当前可以从故事宏观规划开始接管。";
  }
  if (input.step === "character") {
    return input.status === "blocked"
      ? "需要先具备 Story Macro 与 Book Contract，才能直接从角色准备接管。"
      : input.status === "complete"
        ? "角色资产已具备，继续模式会自动推进到下一缺失步骤。"
        : "当前可以从角色准备继续。";
  }
  if (input.step === "outline") {
    return input.status === "blocked"
      ? "需要先具备故事宏观规划与角色资产，才能直接从卷战略接管。"
      : input.status === "complete"
        ? "卷战略资产已具备，继续模式会自动推进到下一缺失步骤。"
        : "当前可以从卷战略继续。";
  }
  if (input.step === "structured") {
    return input.status === "blocked"
      ? "需要先具备卷战略，才能直接从节奏 / 拆章接管。"
      : input.status === "complete"
        ? "节奏板、章节列表和章节细化已具备，继续模式会校验章节同步后进入章节执行准备。"
        : "当前可以从节奏 / 拆章继续。";
  }
  if (input.step === "chapter") {
    if (input.activePipelineJob) {
      return "检测到活动中的章节批次，继续模式会优先恢复当前批次。";
    }
    if (input.latestCheckpoint?.checkpointType === "front10_ready" || input.executableRange) {
      return "检测到可执行章节范围，继续模式会按当前范围恢复或续跑。";
    }
    return "当前可以从章节执行接管。";
  }
  if (input.activePipelineJob) {
    return "检测到活动中的质量修复批次，继续模式会优先恢复当前批次。";
  }
  if (input.latestCheckpoint?.checkpointType === "chapter_batch_ready" || input.latestCheckpoint?.checkpointType === "replan_required") {
    return input.latestCheckpoint.checkpointType === "replan_required"
      ? "检测到最近的重规划检查点，继续模式会优先恢复待处理的重规划与后续批次。"
      : "检测到最近的章节批次检查点，继续模式会优先恢复待修章节。";
  }
  return "当前可以从质量修复接管。";
}

export function buildDirectorTakeoverReadiness(input: {
  novel: DirectorTakeoverNovelContext;
  snapshot: DirectorTakeoverAssetSnapshot;
  hasActiveTask: boolean;
  activeTaskId?: string | null;
  activePipelineJob?: DirectorTakeoverPipelineJobSnapshot | null;
  latestCheckpoint?: DirectorTakeoverCheckpointSnapshot | null;
  executableRange?: DirectorTakeoverExecutableRangeSnapshot | null;
}): DirectorTakeoverReadinessResponse {
  const recommendedPhase = resolveRecommendedTakeoverPhase(input.snapshot);
  const recommendedStep = phaseToEntryStep(recommendedPhase);
  const storyMacroReadiness = buildStoryMacroReadiness(input.novel);
  const characterSetupReadiness = buildCharacterSetupReadiness(input.snapshot);
  const volumeStrategyReadiness = buildVolumeStrategyReadiness(input.snapshot);
  const structuredOutlineReadiness = buildStructuredOutlineReadiness(input.snapshot);

  const entrySteps: DirectorTakeoverEntryReadiness[] = DIRECTOR_TAKEOVER_ENTRY_STEPS.map((step) => {
    const status = buildEntryStepStatus({
      step,
      novel: input.novel,
      snapshot: input.snapshot,
      activePipelineJob: input.activePipelineJob,
      latestCheckpoint: input.latestCheckpoint,
      executableRange: input.executableRange,
    });
    const available = status !== "blocked";
    return {
      step,
      label: TAKEOVER_ENTRY_META[step].label,
      description: TAKEOVER_ENTRY_META[step].description,
      available,
      recommended: step === recommendedStep || (step === "chapter" && recommendedStep === "structured" && Boolean(input.executableRange)),
      status,
      reason: buildEntryReason({
        step,
        status,
        snapshot: input.snapshot,
        activePipelineJob: input.activePipelineJob,
        latestCheckpoint: input.latestCheckpoint,
        executableRange: input.executableRange,
      }),
      previews: [
        buildPreviewOrFallback({
          entryStep: step,
          strategy: "continue_existing",
          snapshot: input.snapshot,
          activePipelineJob: input.activePipelineJob,
          latestCheckpoint: input.latestCheckpoint,
          executableRange: input.executableRange,
        }),
        buildPreviewOrFallback({
          entryStep: step,
          strategy: "restart_current_step",
          snapshot: input.snapshot,
          activePipelineJob: input.activePipelineJob,
          latestCheckpoint: input.latestCheckpoint,
          executableRange: input.executableRange,
        }),
      ],
    };
  });

  return {
    novelId: input.novel.id,
    novelTitle: input.novel.title.trim() || "当前项目",
    hasActiveTask: input.hasActiveTask,
    activeTaskId: input.activeTaskId ?? null,
    snapshot: {
      ...input.snapshot,
    },
    stages: ([
      ["story_macro", storyMacroReadiness],
      ["character_setup", characterSetupReadiness],
      ["volume_strategy", volumeStrategyReadiness],
      ["structured_outline", structuredOutlineReadiness],
    ] as const).map(([phase, readiness]) => ({
      phase,
      label: DIRECTOR_TAKEOVER_STAGE_META[phase].label,
      description: DIRECTOR_TAKEOVER_STAGE_META[phase].description,
      available: readiness.available,
      recommended: readiness.available && phase === recommendedPhase,
      reason: readiness.reason,
    })),
    entrySteps,
    activePipelineJob: input.activePipelineJob ?? null,
    latestCheckpoint: input.latestCheckpoint ?? null,
    executableRange: input.executableRange ?? null,
  };
}

export function assertDirectorTakeoverPhaseAvailable(
  readiness: DirectorTakeoverReadinessResponse,
  phase: DirectorTakeoverStartPhase,
): void {
  const targetStage = readiness.stages.find((item) => item.phase === phase);
  if (!targetStage) {
    throw new Error("当前自动导演接管阶段不存在。");
  }
  if (!targetStage.available) {
    throw new Error(targetStage.reason || "当前项目还不适合从该阶段继续自动导演。");
  }
}

export function buildTakeoverBookSpec(input: {
  novel: DirectorTakeoverNovelContext;
  storyMacroPlan: StoryMacroPlan | null;
  bookContract: BookContract | null;
}): BookSpec {
  const candidate = buildTakeoverCandidate(input);
  const idea = buildTakeoverIdea(input.novel);
  return {
    storyInput: idea,
    positioning: candidate.positioning,
    sellingPoint: candidate.sellingPoint,
    coreConflict: candidate.coreConflict,
    protagonistPath: candidate.protagonistPath,
    endingDirection: candidate.endingDirection,
    hookStrategy: candidate.hookStrategy,
    progressionLoop: candidate.progressionLoop,
    targetChapterCount: candidate.targetChapterCount,
  };
}
