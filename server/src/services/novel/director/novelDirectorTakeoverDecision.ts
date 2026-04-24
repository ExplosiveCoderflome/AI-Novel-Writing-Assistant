import type {
  DirectorCandidate,
  DirectorConfirmRequest,
  DirectorRunMode,
  DirectorTakeoverCheckpointSnapshot,
  DirectorTakeoverEntryStep,
  DirectorTakeoverExecutableRangeSnapshot,
  DirectorTakeoverPipelineJobSnapshot,
  DirectorTakeoverStartPhase,
  DirectorTakeoverStrategy,
  DirectorTakeoverStageReadiness,
} from "@ai-novel/shared/types/novelDirector";
import { DIRECTOR_TAKEOVER_ENTRY_STEPS } from "@ai-novel/shared/types/novelDirector";
import type { NovelWorkflowStage, BookContract } from "@ai-novel/shared/types/novelWorkflow";
import type { StoryMacroPlan } from "@ai-novel/shared/types/storyMacro";
import { normalizeDirectorTargetChapterCount } from "./novelDirectorHelpers";
import {
  doesCheckpointOverlapRange,
  doesPipelineJobOverlapRange,
} from "./novelDirectorTakeoverRange";

import type {
  DirectorTakeoverAssetSnapshot,
  DirectorTakeoverDecisionInput,
  DirectorTakeoverNovelContext,
  DirectorTakeoverResolvedPlan,
} from "./novelDirectorTakeoverTypes";
export type {
  DirectorTakeoverAssetSnapshot,
  DirectorTakeoverDecisionInput,
  DirectorTakeoverNovelContext,
  DirectorTakeoverResolvedPlan,
} from "./novelDirectorTakeoverTypes";

export const DIRECTOR_TAKEOVER_STAGE_META: Record<
  DirectorTakeoverStartPhase,
  Pick<DirectorTakeoverStageReadiness, "label" | "description">
> = {
  story_macro: {
    label: "从故事宏观规划开始",
    description: "先补齐 Story Macro 和 Book Contract，再继续角色、卷战略和拆章。",
  },
  character_setup: {
    label: "从角色准备开始",
    description: "沿用已有书级方向，只让 AI 接手角色阵容和后续规划。",
  },
  volume_strategy: {
    label: "从卷战略开始",
    description: "沿用现有书级方向和角色，继续生成卷战略与卷骨架。",
  },
  structured_outline: {
    label: "从节奏 / 拆章开始",
    description: "沿用现有卷规划，继续生成节奏板、章节列表和章节细化。",
  },
};

export const TAKEOVER_ENTRY_META: Record<
  DirectorTakeoverEntryStep,
  {
    label: string;
    description: string;
  }
> = {
  basic: {
    label: "项目设定",
    description: "从现有项目基础信息继续接管，优先补最早缺失的导演前置资产。",
  },
  story_macro: {
    label: "故事宏观规划",
    description: "围绕 Story Macro 和 Book Contract 继续或重跑书级规划。",
  },
  character: {
    label: "角色准备",
    description: "围绕角色阵容与应用继续或重跑当前步骤。",
  },
  outline: {
    label: "卷战略",
    description: "围绕卷战略与卷骨架继续或重跑当前步骤。",
  },
  structured: {
    label: "节奏 / 拆章",
    description: "围绕当前卷节奏板、章节列表和细化资源继续或重跑当前步骤。",
  },
  chapter: {
    label: "章节执行",
    description: "优先恢复当前章节批次或从已准备范围继续执行。",
  },
  pipeline: {
    label: "质量修复",
    description: "优先恢复当前修复批次，或承接待修章节继续推进。",
  },
};

export function hasMeaningfulSeedMaterial(novel: DirectorTakeoverNovelContext): boolean {
  return Boolean(
    novel.description?.trim()
    || novel.targetAudience?.trim()
    || novel.bookSellingPoint?.trim()
    || novel.competingFeel?.trim()
    || novel.first30ChapterPromise?.trim()
    || novel.commercialTags.length > 0
    || novel.genreId?.trim()
    || novel.worldId?.trim(),
  );
}

function splitToneKeywords(novel: DirectorTakeoverNovelContext): string[] {
  const raw = [
    novel.styleTone?.trim() ?? "",
    novel.competingFeel?.trim() ?? "",
    ...novel.commercialTags,
  ]
    .filter(Boolean)
    .join("，");
  return Array.from(
    new Set(
      raw
        .split(/[，、|/]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ).slice(0, 4);
}

export function buildTakeoverIdea(novel: DirectorTakeoverNovelContext): string {
  const lines = [
    novel.description?.trim() ? `故事概述：${novel.description.trim()}` : "",
    novel.title.trim() ? `项目标题：《${novel.title.trim()}》` : "",
    novel.targetAudience?.trim() ? `目标读者：${novel.targetAudience.trim()}` : "",
    novel.bookSellingPoint?.trim() ? `书级卖点：${novel.bookSellingPoint.trim()}` : "",
    novel.competingFeel?.trim() ? `对标气质：${novel.competingFeel.trim()}` : "",
    novel.first30ChapterPromise?.trim() ? `前30章承诺：${novel.first30ChapterPromise.trim()}` : "",
    novel.commercialTags.length > 0 ? `商业标签：${novel.commercialTags.join("、")}` : "",
  ].filter(Boolean);
  return lines.join("\n") || `项目标题：《${novel.title.trim() || "当前项目"}》`;
}

export function buildTakeoverCandidate(input: {
  novel: DirectorTakeoverNovelContext;
  storyMacroPlan: StoryMacroPlan | null;
  bookContract: BookContract | null;
}): DirectorCandidate {
  const { novel, storyMacroPlan, bookContract } = input;
  const decomposition = storyMacroPlan?.decomposition ?? null;
  const expansion = storyMacroPlan?.expansion ?? null;
  const workingTitle = novel.title.trim() || "当前项目";
  const sellingPoint = bookContract?.coreSellingPoint?.trim()
    || novel.bookSellingPoint?.trim()
    || decomposition?.selling_point?.trim()
    || "围绕当前项目的核心卖点持续兑现读者回报。";
  const coreConflict = decomposition?.core_conflict?.trim()
    || novel.description?.trim()
    || bookContract?.readingPromise?.trim()
    || "围绕当前项目主线冲突持续推进。";
  const protagonistPath = decomposition?.growth_path?.trim()
    || expansion?.protagonist_core?.trim()
    || bookContract?.protagonistFantasy?.trim()
    || "主角在主线压力中持续成长并完成阶段转变。";
  const hookStrategy = decomposition?.main_hook?.trim()
    || bookContract?.chapter3Payoff?.trim()
    || novel.first30ChapterPromise?.trim()
    || "围绕当前卖点建立前期钩子和阶段回报。";
  const progressionLoop = decomposition?.progression_loop?.trim()
    || bookContract?.escalationLadder?.trim()
    || "目标推进 -> 阻力升级 -> 阶段回报 -> 新问题。";
  const endingDirection = decomposition?.ending_flavor?.trim()
    || bookContract?.relationshipMainline?.trim()
    || "沿当前项目既定气质和主线方向收束。";

  return {
    id: `takeover-${novel.id}`,
    workingTitle,
    logline: novel.description?.trim() || coreConflict,
    positioning: novel.targetAudience?.trim() || sellingPoint,
    sellingPoint,
    coreConflict,
    protagonistPath,
    endingDirection,
    hookStrategy,
    progressionLoop,
    whyItFits: "沿用当前项目已保存的书级信息与既有资产，继续自动导演。",
    toneKeywords: splitToneKeywords(novel),
    targetChapterCount: normalizeDirectorTargetChapterCount(novel.estimatedChapterCount),
  };
}

export function buildDirectorTakeoverInput(input: {
  novel: DirectorTakeoverNovelContext;
  storyMacroPlan: StoryMacroPlan | null;
  bookContract: BookContract | null;
  runMode?: DirectorRunMode;
}): DirectorConfirmRequest {
  return {
    title: input.novel.title.trim(),
    description: input.novel.description?.trim() || undefined,
    targetAudience: input.novel.targetAudience?.trim() || undefined,
    bookSellingPoint: input.novel.bookSellingPoint?.trim() || undefined,
    competingFeel: input.novel.competingFeel?.trim() || undefined,
    first30ChapterPromise: input.novel.first30ChapterPromise?.trim() || undefined,
    commercialTags: input.novel.commercialTags.length > 0 ? input.novel.commercialTags : undefined,
    genreId: input.novel.genreId?.trim() || undefined,
    primaryStoryModeId: input.novel.primaryStoryModeId?.trim() || undefined,
    secondaryStoryModeId: input.novel.secondaryStoryModeId?.trim() || undefined,
    worldId: input.novel.worldId?.trim() || undefined,
    writingMode: input.novel.writingMode,
    projectMode: input.novel.projectMode,
    narrativePov: input.novel.narrativePov,
    pacePreference: input.novel.pacePreference,
    styleTone: input.novel.styleTone?.trim() || undefined,
    emotionIntensity: input.novel.emotionIntensity,
    aiFreedom: input.novel.aiFreedom,
    defaultChapterLength: input.novel.defaultChapterLength,
    estimatedChapterCount: input.novel.estimatedChapterCount ?? undefined,
    projectStatus: input.novel.projectStatus,
    storylineStatus: input.novel.storylineStatus,
    outlineStatus: input.novel.outlineStatus,
    resourceReadyScore: input.novel.resourceReadyScore,
    sourceNovelId: input.novel.sourceNovelId ?? undefined,
    sourceKnowledgeDocumentId: input.novel.sourceKnowledgeDocumentId ?? undefined,
    continuationBookAnalysisId: input.novel.continuationBookAnalysisId ?? undefined,
    continuationBookAnalysisSections: input.novel.continuationBookAnalysisSections ?? undefined,
    idea: buildTakeoverIdea(input.novel),
    candidate: buildTakeoverCandidate({
      novel: input.novel,
      storyMacroPlan: input.storyMacroPlan,
      bookContract: input.bookContract,
    }),
    runMode: input.runMode,
  };
}

export function isStoryMacroReady(snapshot: DirectorTakeoverAssetSnapshot): boolean {
  return snapshot.hasStoryMacroPlan && snapshot.hasBookContract;
}

export function isCharacterReady(snapshot: DirectorTakeoverAssetSnapshot): boolean {
  return snapshot.characterCount > 0;
}

export function isOutlineReady(snapshot: DirectorTakeoverAssetSnapshot): boolean {
  return snapshot.volumePlanningReady ?? snapshot.volumeCount > 0;
}

export function isStructuredReady(snapshot: DirectorTakeoverAssetSnapshot): boolean {
  return snapshot.structuredOutlineReady
    ?? (Boolean(snapshot.firstVolumeBeatSheetReady) && (snapshot.firstVolumePreparedChapterCount ?? 0) > 0);
}

export function isChapterSyncReady(snapshot: DirectorTakeoverAssetSnapshot): boolean {
  return snapshot.chapterSyncReady ?? true;
}

function isChapterExecutionReadyForRepair(snapshot: DirectorTakeoverAssetSnapshot): boolean {
  return snapshot.chapterExecutionReadyForRepair ?? true;
}

export function hasAnyStructuredAsset(snapshot: DirectorTakeoverAssetSnapshot): boolean {
  return Boolean(snapshot.firstVolumeBeatSheetReady)
    || snapshot.firstVolumeChapterCount > 0
    || (snapshot.firstVolumePreparedChapterCount ?? 0) > 0;
}

export function hasExecutableRange(input: {
  snapshot: DirectorTakeoverAssetSnapshot;
  executableRange?: DirectorTakeoverExecutableRangeSnapshot | null;
  latestCheckpoint?: DirectorTakeoverCheckpointSnapshot | null;
  activePipelineJob?: DirectorTakeoverPipelineJobSnapshot | null;
  requestedExecutionRange?: DirectorTakeoverExecutableRangeSnapshot | null;
}): boolean {
  if (!isChapterSyncReady(input.snapshot)) {
    return false;
  }
  if (input.requestedExecutionRange) {
    return true;
  }
  return Boolean(
    input.executableRange
    || input.latestCheckpoint?.checkpointType === "front10_ready"
    || input.latestCheckpoint?.checkpointType === "chapter_batch_ready"
    || input.latestCheckpoint?.checkpointType === "replan_required"
    || input.activePipelineJob,
  );
}

function isRepairingPipelineJob(job: DirectorTakeoverPipelineJobSnapshot | null | undefined): boolean {
  if (!job?.currentStage) {
    return false;
  }
  return job.currentStage === "reviewing" || job.currentStage === "repairing";
}

export function hasPendingRepairContext(input: {
  snapshot: DirectorTakeoverAssetSnapshot;
  activePipelineJob?: DirectorTakeoverPipelineJobSnapshot | null;
  latestCheckpoint?: DirectorTakeoverCheckpointSnapshot | null;
  requestedExecutionRange?: DirectorTakeoverExecutableRangeSnapshot | null;
  requestedPendingRepairChapterCount?: number;
}): boolean {
  if (!isChapterExecutionReadyForRepair(input.snapshot)) {
    return false;
  }
  if (input.requestedExecutionRange) {
    return Boolean(
      doesPipelineJobOverlapRange(input.activePipelineJob, input.requestedExecutionRange)
      || doesCheckpointOverlapRange(input.latestCheckpoint, input.requestedExecutionRange)
      || (input.requestedPendingRepairChapterCount ?? 0) > 0
    );
  }
  return Boolean(
    isRepairingPipelineJob(input.activePipelineJob)
    || input.latestCheckpoint?.checkpointType === "chapter_batch_ready"
    || input.latestCheckpoint?.checkpointType === "replan_required"
    || (input.snapshot.pendingRepairChapterCount ?? 0) > 0,
  );
}

function doesExecutionRangeOverlapRequested(input: {
  executableRange?: DirectorTakeoverExecutableRangeSnapshot | null;
  latestCheckpoint?: DirectorTakeoverCheckpointSnapshot | null;
  activePipelineJob?: DirectorTakeoverPipelineJobSnapshot | null;
  requestedExecutionRange?: DirectorTakeoverExecutableRangeSnapshot | null;
}): boolean {
  if (!input.requestedExecutionRange) {
    return Boolean(
      input.executableRange
      || input.latestCheckpoint?.checkpointType === "front10_ready"
      || input.latestCheckpoint?.checkpointType === "chapter_batch_ready"
      || input.latestCheckpoint?.checkpointType === "replan_required"
      || input.activePipelineJob
    );
  }
  const range = input.requestedExecutionRange;
  const executableOverlap = Boolean(
    input.executableRange
    && !(input.executableRange.endOrder < range.startOrder || input.executableRange.startOrder > range.endOrder)
  );
  return executableOverlap
    || doesCheckpointOverlapRange(input.latestCheckpoint, range)
    || doesPipelineJobOverlapRange(input.activePipelineJob, range);
}

export function phaseToEntryStep(phase: DirectorTakeoverStartPhase): DirectorTakeoverEntryStep {
  if (phase === "story_macro") return "story_macro";
  if (phase === "character_setup") return "character";
  if (phase === "volume_strategy") return "outline";
  return "structured";
}

function entryStepToLegacyStartPhase(step: DirectorTakeoverEntryStep): DirectorTakeoverStartPhase {
  if (step === "story_macro" || step === "basic") return "story_macro";
  if (step === "character") return "character_setup";
  if (step === "outline") return "volume_strategy";
  return "structured_outline";
}

export function entryStepToWorkflowStage(step: DirectorTakeoverEntryStep): NovelWorkflowStage {
  if (step === "story_macro" || step === "basic") return "story_macro";
  if (step === "character") return "character_setup";
  if (step === "outline") return "volume_strategy";
  if (step === "structured") return "structured_outline";
  if (step === "chapter") return "chapter_execution";
  return "quality_repair";
}

function buildSkipSteps(from: DirectorTakeoverEntryStep, to: DirectorTakeoverEntryStep): DirectorTakeoverEntryStep[] {
  const fromIndex = DIRECTOR_TAKEOVER_ENTRY_STEPS.indexOf(from);
  const toIndex = DIRECTOR_TAKEOVER_ENTRY_STEPS.indexOf(to);
  if (fromIndex < 0 || toIndex < 0 || toIndex <= fromIndex) {
    return [];
  }
  return DIRECTOR_TAKEOVER_ENTRY_STEPS.slice(fromIndex, toIndex).filter((step) => step !== to);
}

function resolveExecutionContinuationStep(input: {
  snapshot: DirectorTakeoverAssetSnapshot;
  activePipelineJob?: DirectorTakeoverPipelineJobSnapshot | null;
  latestCheckpoint?: DirectorTakeoverCheckpointSnapshot | null;
  executableRange?: DirectorTakeoverExecutableRangeSnapshot | null;
  preferPipeline: boolean;
}): DirectorTakeoverEntryStep | null {
  const executable = hasExecutableRange(input);
  if (!executable) {
    return null;
  }
  const pendingRepair = hasPendingRepairContext(input);
  if (pendingRepair) {
    return "pipeline";
  }
  if (input.preferPipeline) {
    return "chapter";
  }
  return "chapter";
}

function resolveContinueTargetStep(input: {
  entryStep: DirectorTakeoverEntryStep;
  snapshot: DirectorTakeoverAssetSnapshot;
  activePipelineJob?: DirectorTakeoverPipelineJobSnapshot | null;
  latestCheckpoint?: DirectorTakeoverCheckpointSnapshot | null;
  executableRange?: DirectorTakeoverExecutableRangeSnapshot | null;
}): DirectorTakeoverEntryStep {
  const storyReady = isStoryMacroReady(input.snapshot);
  const characterReady = isCharacterReady(input.snapshot);
  const outlineReady = isOutlineReady(input.snapshot);
  const structuredReady = isStructuredReady(input.snapshot);
  const chapterSyncReady = isChapterSyncReady(input.snapshot);

  if (input.entryStep === "basic") {
    if (!storyReady) return "story_macro";
    if (!characterReady) return "character";
    if (!outlineReady) return "outline";
    if (!structuredReady || !chapterSyncReady) return "structured";
    return resolveExecutionContinuationStep({
      ...input,
      preferPipeline: false,
    }) ?? "structured";
  }
  if (input.entryStep === "story_macro") {
    if (!storyReady) return "story_macro";
    return resolveContinueTargetStep({ ...input, entryStep: "character" });
  }
  if (input.entryStep === "character") {
    if (!characterReady) return "character";
    return resolveContinueTargetStep({ ...input, entryStep: "outline" });
  }
  if (input.entryStep === "outline") {
    if (!outlineReady) return "outline";
    return resolveContinueTargetStep({ ...input, entryStep: "structured" });
  }
  if (input.entryStep === "structured") {
    if (!structuredReady || !chapterSyncReady) return "structured";
    return resolveExecutionContinuationStep({
      ...input,
      preferPipeline: false,
    }) ?? "structured";
  }
  if (input.entryStep === "chapter") {
    return resolveExecutionContinuationStep({
      ...input,
      preferPipeline: false,
    }) ?? (structuredReady && chapterSyncReady ? "chapter" : "structured");
  }
  return resolveExecutionContinuationStep({
    ...input,
    preferPipeline: true,
  }) ?? (structuredReady && chapterSyncReady ? "chapter" : "structured");
}

function buildPhasePlan(input: {
  entryStep: DirectorTakeoverEntryStep;
  strategy: DirectorTakeoverStrategy;
  effectiveStep: Extract<DirectorTakeoverEntryStep, "story_macro" | "character" | "outline" | "structured">;
  summary: string;
  effectSummary: string;
  impactNotes: string[];
}): DirectorTakeoverResolvedPlan {
  const startPhase = entryStepToLegacyStartPhase(input.effectiveStep);
  return {
    entryStep: input.entryStep,
    strategy: input.strategy,
    effectiveStep: input.effectiveStep,
    effectiveStage: entryStepToWorkflowStage(input.effectiveStep),
    startPhase,
    phase: startPhase,
    resumeStage: input.effectiveStep,
    skipSteps: buildSkipSteps(input.entryStep, input.effectiveStep),
    summary: input.summary,
    effectSummary: input.effectSummary,
    impactNotes: input.impactNotes,
    usesCurrentBatch: false,
    currentStep: input.strategy === "continue_existing" ? input.effectiveStep : null,
    restartStep: input.strategy === "restart_current_step" ? input.effectiveStep : null,
    executionMode: "phase",
    resumeCheckpointType: null,
  };
}

function buildAutoExecutionPlan(input: {
  entryStep: DirectorTakeoverEntryStep;
  strategy: DirectorTakeoverStrategy;
  effectiveStep: "chapter" | "pipeline";
  usesCurrentBatch: boolean;
  summary: string;
  effectSummary: string;
  impactNotes: string[];
  latestCheckpoint?: DirectorTakeoverCheckpointSnapshot | null;
}): DirectorTakeoverResolvedPlan {
  const effectiveStage = input.effectiveStep === "pipeline" ? "quality_repair" : "chapter_execution";
  return {
    entryStep: input.entryStep,
    strategy: input.strategy,
    effectiveStep: input.effectiveStep,
    effectiveStage,
    startPhase: "structured_outline",
    resumeStage: input.effectiveStep,
    skipSteps: buildSkipSteps(input.entryStep, input.effectiveStep),
    summary: input.summary,
    effectSummary: input.effectSummary,
    impactNotes: input.impactNotes,
    usesCurrentBatch: input.usesCurrentBatch,
    currentStep: input.strategy === "continue_existing" ? input.effectiveStep : null,
    restartStep: input.strategy === "restart_current_step" ? input.entryStep : null,
    executionMode: "auto_execution",
    resumeCheckpointType: input.latestCheckpoint?.checkpointType ?? null,
  };
}

export function resolveDirectorTakeoverPlan(input: DirectorTakeoverDecisionInput): DirectorTakeoverResolvedPlan {
  const storyReady = isStoryMacroReady(input.snapshot);
  const characterReady = isCharacterReady(input.snapshot);
  const outlineReady = isOutlineReady(input.snapshot);
  const structuredReady = isStructuredReady(input.snapshot);
  const executable = hasExecutableRange(input);
  const pendingRepair = hasPendingRepairContext(input);
  const reusableExecution = doesExecutionRangeOverlapRequested(input);

  if (input.strategy === "continue_existing") {
    const effectiveStep = resolveContinueTargetStep(input);
    if (effectiveStep === "story_macro") {
      return buildPhasePlan({
        entryStep: input.entryStep,
        strategy: input.strategy,
        effectiveStep,
        summary: "继续已有进度，先补齐故事宏观规划。",
        effectSummary: "会复用当前基础信息，只补缺失的 Story Macro 与 Book Contract。",
        impactNotes: ["不会清空已有章节与正文。"],
      });
    }
    if (effectiveStep === "character") {
      return buildPhasePlan({
        entryStep: input.entryStep,
        strategy: input.strategy,
        effectiveStep,
        summary: "继续已有进度，接着补角色准备。",
        effectSummary: "会复用已完成的书级规划，只补角色阵容与角色应用。",
        impactNotes: ["不会重跑已存在的 Story Macro / Book Contract。"],
      });
    }
    if (effectiveStep === "outline") {
      return buildPhasePlan({
        entryStep: input.entryStep,
        strategy: input.strategy,
        effectiveStep,
        summary: "继续已有进度，接着补卷战略。",
        effectSummary: "会复用现有书级规划与角色资产，只补卷战略和卷骨架。",
        impactNotes: ["不会清空已存在的角色与正文。"],
      });
    }
    if (effectiveStep === "structured") {
      return buildPhasePlan({
        entryStep: input.entryStep,
        strategy: input.strategy,
        effectiveStep,
        summary: "继续已有进度，接着补节奏 / 拆章。",
        effectSummary: "会复用已完成的卷战略，只补当前卷节奏板、章节列表和章节细化资源。",
        impactNotes: ["保留已有正文，不会批量删章节。"],
      });
    }
    if ((!structuredReady || !isChapterSyncReady(input.snapshot)) && !executable) {
      throw new Error("当前还没有可继续的章节执行范围，请先补齐节奏 / 拆章资源。");
    }
    if (effectiveStep === "pipeline") {
      return buildAutoExecutionPlan({
        entryStep: input.entryStep,
        strategy: input.strategy,
        effectiveStep,
        usesCurrentBatch: true,
        latestCheckpoint: input.latestCheckpoint,
        summary: "继续已有进度，优先恢复当前质量修复批次。",
        effectSummary: "会优先恢复当前修复中的批次或待修章节，不会新开一条重复任务。",
        impactNotes: ["保留现有正文与规划资产。", "只会跳过已正式通过的章节。"],
      });
    }
    return buildAutoExecutionPlan({
      entryStep: input.entryStep,
      strategy: input.strategy,
      effectiveStep: "chapter",
      usesCurrentBatch: reusableExecution,
      latestCheckpoint: input.latestCheckpoint,
      summary: "继续已有进度，优先恢复当前章节批次。",
      effectSummary: "会优先恢复活动中的批次、检查点或已准备好的章节范围继续执行。",
      impactNotes: ["不会清空已有正文。", "只会跳过 approved / published 的章节。"],
    });
  }

  if (input.entryStep === "basic" || input.entryStep === "story_macro") {
    return buildPhasePlan({
      entryStep: input.entryStep,
      strategy: input.strategy,
      effectiveStep: "story_macro",
      summary: "重新生成当前步，从故事宏观规划重跑。",
      effectSummary: "会先清空书级规划、角色准备、卷战略、节奏拆章和章节细化资源，再从故事宏观规划重跑。",
      impactNotes: ["会刷新当前书级规划资产，并让后续规划重新生成。", "不会删除已写正文。"],
    });
  }
  if (input.entryStep === "character") {
    if (!storyReady) {
      throw new Error("当前缺少 Story Macro 或 Book Contract，不能直接从角色准备重跑。");
    }
    return buildPhasePlan({
      entryStep: input.entryStep,
      strategy: input.strategy,
      effectiveStep: "character",
      summary: "重新生成当前步，从角色准备重跑。",
      effectSummary: "会先清空当前角色准备，以及依赖角色的卷战略、节奏拆章和章节细化资源，再重跑角色准备。",
      impactNotes: ["保留前置书级规划。", "后续规划会重新生成，避免旧结构干扰。", "不会清空已有正文。"],
    });
  }
  if (input.entryStep === "outline") {
    if (!storyReady || !characterReady) {
      throw new Error("当前前置资产不足，不能直接从卷战略重跑。");
    }
    return buildPhasePlan({
      entryStep: input.entryStep,
      strategy: input.strategy,
      effectiveStep: "outline",
      summary: "重新生成当前步，从卷战略重跑。",
      effectSummary: "会先清空当前卷战略、卷骨架、节奏拆章和章节细化资源，再从卷战略重跑。",
      impactNotes: ["保留前置书级规划与角色。", "后续节奏与拆章会重新生成，避免旧卷数据干扰。", "不会清空已有正文。"],
    });
  }
  if (input.entryStep === "structured") {
    if (!storyReady || !characterReady || !outlineReady) {
      throw new Error("当前前置资产不足，不能直接从节奏 / 拆章重跑。");
    }
    return buildPhasePlan({
      entryStep: input.entryStep,
      strategy: input.strategy,
      effectiveStep: "structured",
      summary: "重新生成当前步，从节奏 / 拆章重跑。",
      effectSummary: "会先清空当前卷的节奏板、章节列表和章节细化资源，再重跑这一阶段。",
      impactNotes: ["会清空当前卷尚未开写的拆章产物。", "不会删除已写正文。"],
    });
  }
  if ((!structuredReady || !isChapterSyncReady(input.snapshot)) && !executable) {
    throw new Error("当前还没有可执行的章节范围，不能直接新开章节批次。");
  }
  if (input.entryStep === "pipeline" && !pendingRepair && !executable) {
    throw new Error("当前没有可继续的质量修复上下文。");
  }
  return buildAutoExecutionPlan({
    entryStep: input.entryStep,
    strategy: input.strategy,
    effectiveStep: input.entryStep === "pipeline" ? "pipeline" : "chapter",
    usesCurrentBatch: false,
    latestCheckpoint: input.latestCheckpoint,
    summary: input.entryStep === "pipeline" ? "重新生成当前步，清空当前质量修复结果后重跑。" : "重新生成当前步，清空当前章节批次后重跑。",
    effectSummary: input.entryStep === "pipeline"
      ? "会先清空当前质量修复结果与通过状态，再对现有正文重新审校 / 修复。"
      : "会先清空当前章节执行范围的正文草稿、审校状态和派生摘要，再重新生成这一批。",
    impactNotes: input.entryStep === "pipeline"
      ? ["保留当前章节正文。", "会重新进入自动审校与修复。"]
      : ["会清空当前批次正文草稿。", "保留前置规划和章节结构。"],
  });
}

