import type {
  BookSpec,
  DirectorCandidate,
  DirectorConfirmRequest,
  DirectorProjectContextInput,
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
import type { NovelWorkflowStage, BookContract } from "@ai-novel/shared/types/novelWorkflow";
import type { StoryMacroPlan } from "@ai-novel/shared/types/storyMacro";
import { DIRECTOR_TAKEOVER_ENTRY_STEPS } from "@ai-novel/shared/types/novelDirector";

export interface DirectorTakeoverNovelContext extends Omit<DirectorProjectContextInput, "description"> {
  id: string;
  title: string;
  description?: string | null;
  commercialTags: string[];
}

export interface DirectorTakeoverAssetSnapshot {
  hasStoryMacroPlan: boolean;
  hasBookContract: boolean;
  characterCount: number;
  chapterCount: number;
  volumeCount: number;
  firstVolumeId: string | null;
  firstVolumeChapterCount: number;
  firstVolumeBeatSheetReady?: boolean;
  firstVolumePreparedChapterCount?: number;
  generatedChapterCount?: number;
  approvedChapterCount?: number;
  pendingRepairChapterCount?: number;
}

export interface DirectorTakeoverDecisionInput {
  entryStep: DirectorTakeoverEntryStep;
  strategy: DirectorTakeoverStrategy;
  snapshot: DirectorTakeoverAssetSnapshot;
  activePipelineJob?: DirectorTakeoverPipelineJobSnapshot | null;
  latestCheckpoint?: DirectorTakeoverCheckpointSnapshot | null;
  executableRange?: DirectorTakeoverExecutableRangeSnapshot | null;
}

export interface DirectorTakeoverResolvedPlan {
  entryStep: DirectorTakeoverEntryStep;
  strategy: DirectorTakeoverStrategy;
  effectiveStep: DirectorTakeoverEntryStep;
  effectiveStage: NovelWorkflowStage;
  startPhase: DirectorTakeoverStartPhase;
  resumeStage: "basic" | "story_macro" | "character" | "outline" | "structured" | "chapter" | "pipeline";
  skipSteps: DirectorTakeoverEntryStep[];
  summary: string;
  effectSummary: string;
  impactNotes: string[];
  usesCurrentBatch: boolean;
  currentStep?: DirectorTakeoverEntryStep | null;
  restartStep?: DirectorTakeoverEntryStep | null;
  executionMode: "phase" | "auto_execution";
  phase?: DirectorTakeoverStartPhase;
  resumeCheckpointType?: "front10_ready" | "chapter_batch_ready" | "replan_required" | null;
}

const DIRECTOR_TAKEOVER_STAGE_META: Record<
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

const TAKEOVER_ENTRY_META: Record<
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

function hasMeaningfulSeedMaterial(novel: DirectorTakeoverNovelContext): boolean {
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

function buildTakeoverIdea(novel: DirectorTakeoverNovelContext): string {
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

function buildTakeoverCandidate(input: {
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
    targetChapterCount: Math.max(12, Math.min(120, Math.round(novel.estimatedChapterCount ?? 80))),
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

function isStoryMacroReady(snapshot: DirectorTakeoverAssetSnapshot): boolean {
  return snapshot.hasStoryMacroPlan && snapshot.hasBookContract;
}

function isCharacterReady(snapshot: DirectorTakeoverAssetSnapshot): boolean {
  return snapshot.characterCount > 0;
}

function isOutlineReady(snapshot: DirectorTakeoverAssetSnapshot): boolean {
  return snapshot.volumeCount > 0;
}

function isStructuredReady(snapshot: DirectorTakeoverAssetSnapshot): boolean {
  return Boolean(snapshot.firstVolumeBeatSheetReady) && (snapshot.firstVolumePreparedChapterCount ?? 0) > 0;
}

function hasAnyStructuredAsset(snapshot: DirectorTakeoverAssetSnapshot): boolean {
  return Boolean(snapshot.firstVolumeBeatSheetReady)
    || snapshot.firstVolumeChapterCount > 0
    || (snapshot.firstVolumePreparedChapterCount ?? 0) > 0;
}

function hasExecutableRange(input: {
  snapshot: DirectorTakeoverAssetSnapshot;
  executableRange?: DirectorTakeoverExecutableRangeSnapshot | null;
  latestCheckpoint?: DirectorTakeoverCheckpointSnapshot | null;
  activePipelineJob?: DirectorTakeoverPipelineJobSnapshot | null;
}): boolean {
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

function hasPendingRepairContext(input: {
  snapshot: DirectorTakeoverAssetSnapshot;
  activePipelineJob?: DirectorTakeoverPipelineJobSnapshot | null;
  latestCheckpoint?: DirectorTakeoverCheckpointSnapshot | null;
}): boolean {
  return Boolean(
    isRepairingPipelineJob(input.activePipelineJob)
    || input.latestCheckpoint?.checkpointType === "chapter_batch_ready"
    || input.latestCheckpoint?.checkpointType === "replan_required"
    || (input.snapshot.pendingRepairChapterCount ?? 0) > 0,
  );
}

function phaseToEntryStep(phase: DirectorTakeoverStartPhase): DirectorTakeoverEntryStep {
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

function entryStepToWorkflowStage(step: DirectorTakeoverEntryStep): NovelWorkflowStage {
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

  if (input.entryStep === "basic") {
    if (!storyReady) return "story_macro";
    if (!characterReady) return "character";
    if (!outlineReady) return "outline";
    if (!structuredReady) return "structured";
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
    if (!structuredReady) return "structured";
    return resolveExecutionContinuationStep({
      ...input,
      preferPipeline: false,
    }) ?? "structured";
  }
  if (input.entryStep === "chapter") {
    return resolveExecutionContinuationStep({
      ...input,
      preferPipeline: false,
    }) ?? (structuredReady ? "chapter" : "structured");
  }
  return resolveExecutionContinuationStep({
    ...input,
    preferPipeline: true,
  }) ?? (structuredReady ? "chapter" : "structured");
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
    if (!structuredReady && !executable) {
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
      usesCurrentBatch: executable,
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
      effectSummary: "会先清空 Story Macro 与 Book Contract，再从故事宏观规划重跑。",
      impactNotes: ["会刷新当前书级规划资产。", "不会删除已写正文。"],
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
      effectSummary: "会先清空当前角色阵容、关系和角色准备候选，再重跑角色准备。",
      impactNotes: ["保留前置书级规划。", "不会清空已有正文。"],
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
      effectSummary: "会先清空当前卷战略与卷骨架，再从卷战略重跑。",
      impactNotes: ["保留前置书级规划与角色。", "不会清空已有正文。"],
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
  if (!structuredReady && !executable) {
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
    if (!isStructuredReady(snapshot) && !hasExecutableRange(input)) return "blocked";
    if (input.activePipelineJob) return "partial";
    if (hasExecutableRange(input)) return "ready";
    return "missing";
  }
  if (!isStructuredReady(snapshot) && !hasExecutableRange(input)) return "blocked";
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
        ? "当前卷节奏板和章节细化已具备，继续模式会直接转入章节执行准备。"
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
