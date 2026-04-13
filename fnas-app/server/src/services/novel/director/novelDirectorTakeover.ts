import type {
  BookSpec,
  DirectorCandidate,
  DirectorConfirmRequest,
  DirectorProjectContextInput,
  DirectorRunMode,
  DirectorTakeoverReadinessResponse,
  DirectorTakeoverStageReadiness,
  DirectorTakeoverStartPhase,
} from "@ai-novel/shared/types/novelDirector";
import type { BookContract } from "@ai-novel/shared/types/novelWorkflow";
import type { StoryMacroPlan } from "@ai-novel/shared/types/storyMacro";

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
}

const DIRECTOR_TAKEOVER_STAGE_META: Record<DirectorTakeoverStartPhase, Pick<DirectorTakeoverStageReadiness, "label" | "description">> = {
  story_macro: {
    label: "从故事宏观规划开始",
    description: "AI 会先补齐 Story Macro 和 Book Contract，再继续角色、卷战略与拆章。",
  },
  character_setup: {
    label: "从角色准备开始",
    description: "适合你已经确认书级方向，只想让 AI 接着补角色阵容和后续规划。",
  },
  volume_strategy: {
    label: "从卷战略开始",
    description: "适合书级方向和角色都已基本就绪，只需要 AI 继续卷规划与卷骨架。",
  },
  structured_outline: {
    label: "从节奏 / 拆章开始",
    description: "适合卷战略已确定，只想让 AI 接手第 1 卷节奏板、章节列表和前 10 章细化。",
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
        .split(/[，,、/|]/)
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
    || "围绕当前项目的核心卖点持续兑现读者奖励。";
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
    || "围绕当前卖点建立前期钩子与阶段回报。";
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

function buildStoryMacroReadiness(novel: DirectorTakeoverNovelContext): Pick<DirectorTakeoverStageReadiness, "available" | "reason"> {
  if (hasMeaningfulSeedMaterial(novel)) {
    return {
      available: true,
      reason: "当前书级信息已足够，适合从故事宏观规划开始进入自动导演。",
    };
  }
  return {
    available: false,
    reason: "请至少补一句故事概述、书级卖点、对标气质或前30章承诺，再启动自动导演。",
  };
}

function buildCharacterSetupReadiness(snapshot: DirectorTakeoverAssetSnapshot): Pick<DirectorTakeoverStageReadiness, "available" | "reason"> {
  if (!snapshot.hasStoryMacroPlan || !snapshot.hasBookContract) {
    return {
      available: false,
      reason: "跳过故事宏观规划前，需要先具备 Story Macro 与 Book Contract。",
    };
  }
  return {
    available: true,
    reason: "书级方向资产已齐，可以从角色准备开始继续自动导演。",
  };
}

function buildVolumeStrategyReadiness(snapshot: DirectorTakeoverAssetSnapshot): Pick<DirectorTakeoverStageReadiness, "available" | "reason"> {
  if (!snapshot.hasStoryMacroPlan || !snapshot.hasBookContract) {
    return {
      available: false,
      reason: "跳过前置阶段前，需要先具备 Story Macro 与 Book Contract。",
    };
  }
  if (snapshot.characterCount <= 0) {
    return {
      available: false,
      reason: "从卷战略开始前，至少需要 1 位已确认角色。",
    };
  }
  return {
    available: true,
    reason: "书级方向和角色资产已齐，可以从卷战略开始继续。",
  };
}

function buildStructuredOutlineReadiness(snapshot: DirectorTakeoverAssetSnapshot): Pick<DirectorTakeoverStageReadiness, "available" | "reason"> {
  if (!snapshot.hasStoryMacroPlan || !snapshot.hasBookContract) {
    return {
      available: false,
      reason: "跳过前置阶段前，需要先具备 Story Macro 与 Book Contract。",
    };
  }
  if (snapshot.characterCount <= 0) {
    return {
      available: false,
      reason: "从节奏 / 拆章开始前，至少需要 1 位已确认角色。",
    };
  }
  if (snapshot.volumeCount <= 0) {
    return {
      available: false,
      reason: "从节奏 / 拆章开始前，需要先有至少 1 卷卷战略 / 卷骨架。",
    };
  }
  return {
    available: true,
    reason: "卷级资产已经存在，可以直接让 AI 接手第 1 卷节奏与拆章。",
  };
}

function resolveRecommendedTakeoverPhase(snapshot: DirectorTakeoverAssetSnapshot): DirectorTakeoverStartPhase {
  if (!snapshot.hasStoryMacroPlan || !snapshot.hasBookContract) {
    return "story_macro";
  }
  if (snapshot.characterCount <= 0) {
    return "character_setup";
  }
  if (snapshot.volumeCount <= 0) {
    return "volume_strategy";
  }
  return "structured_outline";
}

export function buildDirectorTakeoverReadiness(input: {
  novel: DirectorTakeoverNovelContext;
  snapshot: DirectorTakeoverAssetSnapshot;
  hasActiveTask: boolean;
  activeTaskId?: string | null;
}): DirectorTakeoverReadinessResponse {
  const recommendedPhase = resolveRecommendedTakeoverPhase(input.snapshot);
  const storyMacroReadiness = buildStoryMacroReadiness(input.novel);
  const characterSetupReadiness = buildCharacterSetupReadiness(input.snapshot);
  const volumeStrategyReadiness = buildVolumeStrategyReadiness(input.snapshot);
  const structuredOutlineReadiness = buildStructuredOutlineReadiness(input.snapshot);

  return {
    novelId: input.novel.id,
    novelTitle: input.novel.title.trim() || "当前项目",
    hasActiveTask: input.hasActiveTask,
    activeTaskId: input.activeTaskId ?? null,
    snapshot: {
      hasStoryMacroPlan: input.snapshot.hasStoryMacroPlan,
      hasBookContract: input.snapshot.hasBookContract,
      characterCount: input.snapshot.characterCount,
      chapterCount: input.snapshot.chapterCount,
      volumeCount: input.snapshot.volumeCount,
      firstVolumeChapterCount: input.snapshot.firstVolumeChapterCount,
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
