import type {
  VolumeBeatSheet,
  VolumeGenerationScope,
  VolumeGenerationScopeInput,
  VolumePlan,
  VolumePlanDocument,
  VolumeRebalanceDecision,
  VolumeStrategyPlan,
} from "@ai-novel/shared/types/novel";
import { prisma } from "../../../db/prisma";
import { runStructuredPrompt } from "../../../prompting/core/promptRunner";
import { volumeBeatSheetPrompt } from "../../../prompting/prompts/novel/volume/beatSheet.prompts";
import { createVolumeChapterListPrompt } from "../../../prompting/prompts/novel/volume/chapterList.prompts";
import {
  volumeChapterBoundaryPrompt,
  volumeChapterPurposePrompt,
  volumeChapterTaskSheetPrompt,
} from "../../../prompting/prompts/novel/volume/chapterDetail.prompts";
import { volumeRebalancePrompt } from "../../../prompting/prompts/novel/volume/rebalance.prompts";
import { createVolumeSkeletonPrompt } from "../../../prompting/prompts/novel/volume/skeleton.prompts";
import {
  createVolumeStrategyPrompt,
  volumeStrategyCritiquePrompt,
} from "../../../prompting/prompts/novel/volume/strategy.prompts";
import {
  buildVolumeBeatSheetContextBlocks,
  buildVolumeChapterDetailContextBlocks,
  buildVolumeChapterListContextBlocks,
  buildVolumeRebalanceContextBlocks,
  buildVolumeSkeletonContextBlocks,
  buildVolumeStrategyContextBlocks,
  buildVolumeStrategyCritiqueContextBlocks,
} from "../../../prompting/prompts/novel/volume/contextBlocks";
import type { StoryMacroPlanService } from "../storyMacro/StoryMacroPlanService";
import { buildStoryModePromptBlock, normalizeStoryModeOutput } from "../../storyMode/storyModeProfile";
import {
  buildVolumeWorkspaceDocument,
} from "./volumeWorkspaceDocument";
import { normalizeVolumeDraftContextInput } from "./volumeDraftContext";
import { inferRequiredChapterCountFromBeatSheet } from "./volumeBeatSheetChapterBudget";
import type {
  ChapterDetailMode,
  VolumeGenerateOptions,
  VolumeGenerationPhase,
  VolumeGenerationNovel,
  VolumeWorkspace,
} from "./volumeModels";
import {
  MAX_VOLUME_COUNT,
  buildVolumeCountGuidance,
} from "@ai-novel/shared/types/volumePlanning";

function normalizeScope(scope?: VolumeGenerationScopeInput): VolumeGenerationScope {
  if (scope === "book") {
    return "skeleton";
  }
  if (scope === "volume") {
    return "chapter_list";
  }
  return scope ?? "strategy";
}

function deriveChapterBudget(params: {
  novel: VolumeGenerationNovel;
  workspace: VolumeWorkspace;
  options: VolumeGenerateOptions;
}): number {
  const { novel, workspace, options } = params;
  return Math.max(
    options.estimatedChapterCount ?? 0,
    novel.estimatedChapterCount ?? 0,
    workspace.volumes.flatMap((volume) => volume.chapters).length,
    12,
  );
}

async function notifyVolumeGenerationPhase(input: {
  novelId: string;
  scope: VolumeGenerationScope;
  phase: VolumeGenerationPhase;
  label: string;
  options: VolumeGenerateOptions;
}): Promise<void> {
  console.info(
    `[volume.generate] event=phase_start novelId=${input.novelId} scope=${input.scope} phase=${input.phase} label=${JSON.stringify(input.label)}`,
  );
  await input.options.onPhaseStart?.({
    scope: input.scope,
    phase: input.phase,
    label: input.label,
  });
}

function allocateChapterBudgets(params: {
  volumeCount: number;
  chapterBudget: number;
  existingVolumes: VolumePlan[];
}): number[] {
  const { volumeCount, chapterBudget, existingVolumes } = params;
  const safeVolumeCount = Math.max(volumeCount, 1);
  const minimumPerVolume = 3;
  const totalBudget = Math.max(chapterBudget, safeVolumeCount * minimumPerVolume);
  const existingCounts = Array.from(
    { length: safeVolumeCount },
    (_, index) => Math.max(existingVolumes[index]?.chapters.length ?? 0, 0),
  );
  const hasUsefulWeights = existingCounts.some((count) => count >= minimumPerVolume);
  const weights = hasUsefulWeights
    ? existingCounts.map((count) => Math.max(count, 1))
    : Array.from({ length: safeVolumeCount }, () => 1);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const budgets = weights.map((weight) => Math.max(minimumPerVolume, Math.round((totalBudget * weight) / totalWeight)));
  let delta = totalBudget - budgets.reduce((sum, budget) => sum + budget, 0);

  while (delta !== 0) {
    const direction = delta > 0 ? 1 : -1;
    for (let index = 0; index < budgets.length && delta !== 0; index += 1) {
      if (direction < 0 && budgets[index] <= minimumPerVolume) {
        continue;
      }
      budgets[index] += direction;
      delta -= direction;
    }
  }

  return budgets;
}

function getTargetVolume(document: VolumePlanDocument, targetVolumeId?: string): VolumePlan {
  const volumeId = targetVolumeId?.trim();
  if (!volumeId) {
    throw new Error("缺少目标卷。");
  }
  const targetVolume = document.volumes.find((volume) => volume.id === volumeId);
  if (!targetVolume) {
    throw new Error("目标卷不存在。");
  }
  return targetVolume;
}

function getTargetChapter(targetVolume: VolumePlan, targetChapterId?: string): VolumePlan["chapters"][number] {
  const chapterId = targetChapterId?.trim();
  if (!chapterId) {
    throw new Error("缺少目标章节。");
  }
  const targetChapter = targetVolume.chapters.find((chapter) => chapter.id === chapterId);
  if (!targetChapter) {
    throw new Error("目标章节不存在。");
  }
  return targetChapter;
}

function getBeatSheet(document: VolumePlanDocument, volumeId: string): VolumeBeatSheet | null {
  return document.beatSheets.find((sheet) => sheet.volumeId === volumeId && sheet.beats.length > 0) ?? null;
}

function assertScopeReadiness(
  document: VolumePlanDocument,
  scope: VolumeGenerationScope,
  targetVolumeId?: string,
): void {
  if (scope === "strategy") {
    return;
  }
  if (scope === "strategy_critique" || scope === "skeleton") {
    if (!document.strategyPlan) {
      throw new Error("请先生成卷战略建议，再继续当前步骤。");
    }
    return;
  }
  if (scope === "beat_sheet") {
    if (!document.strategyPlan) {
      throw new Error("请先生成卷战略建议，再生成当前卷节奏板。");
    }
    getTargetVolume(document, targetVolumeId);
    return;
  }
  if (scope === "chapter_list") {
    const targetVolume = getTargetVolume(document, targetVolumeId);
    if (!getBeatSheet(document, targetVolume.id)) {
      throw new Error("当前卷还没有节奏板，默认不能直接拆章节列表。");
    }
    return;
  }
  if (scope === "rebalance") {
    const targetVolume = getTargetVolume(document, targetVolumeId);
    if (!document.strategyPlan) {
      throw new Error("请先生成卷战略建议，再生成相邻卷再平衡建议。");
    }
    if (!getBeatSheet(document, targetVolume.id)) {
      throw new Error("请先生成当前卷节奏板，再生成相邻卷再平衡建议。");
    }
    if (targetVolume.chapters.length === 0) {
      throw new Error("请先生成当前卷章节列表，再生成相邻卷再平衡建议。");
    }
    return;
  }
  const targetVolume = getTargetVolume(document, targetVolumeId);
  if (!getBeatSheet(document, targetVolume.id)) {
    throw new Error("请先生成当前卷节奏板，再细化章节。");
  }
}

function mergeStrategyPlan(document: VolumePlanDocument, strategyPlan: VolumeStrategyPlan): VolumePlanDocument {
  return buildVolumeWorkspaceDocument({
    novelId: document.novelId,
    volumes: document.volumes,
    strategyPlan,
    critiqueReport: null,
    beatSheets: [],
    rebalanceDecisions: [],
    source: "volume",
    activeVersionId: document.activeVersionId,
  });
}

function mergeCritiqueReport(document: VolumePlanDocument, critiqueReport: VolumePlanDocument["critiqueReport"]): VolumePlanDocument {
  return buildVolumeWorkspaceDocument({
    novelId: document.novelId,
    volumes: document.volumes,
    strategyPlan: document.strategyPlan,
    critiqueReport,
    beatSheets: document.beatSheets,
    rebalanceDecisions: document.rebalanceDecisions,
    source: "volume",
    activeVersionId: document.activeVersionId,
  });
}

function mergeSkeleton(document: VolumePlanDocument, generatedVolumes: Array<{
  title: string;
  summary?: string | null;
  openingHook: string;
  mainPromise: string;
  primaryPressureSource: string;
  coreSellingPoint: string;
  escalationMode: string;
  protagonistChange: string;
  midVolumeRisk: string;
  climax: string;
  payoffType: string;
  nextVolumeHook: string;
  resetPoint?: string | null;
  openPayoffs: string[];
}>): VolumePlanDocument {
  const mergedVolumes = generatedVolumes.map((volume, index) => {
    const existing = document.volumes[index];
    return {
      id: existing?.id,
      novelId: document.novelId,
      sortOrder: index + 1,
      title: volume.title,
      summary: volume.summary ?? null,
      openingHook: volume.openingHook,
      mainPromise: volume.mainPromise,
      primaryPressureSource: volume.primaryPressureSource,
      coreSellingPoint: volume.coreSellingPoint,
      escalationMode: volume.escalationMode,
      protagonistChange: volume.protagonistChange,
      midVolumeRisk: volume.midVolumeRisk,
      climax: volume.climax,
      payoffType: volume.payoffType,
      nextVolumeHook: volume.nextVolumeHook,
      resetPoint: volume.resetPoint ?? null,
      openPayoffs: volume.openPayoffs,
      status: existing?.status ?? "active",
      sourceVersionId: existing?.sourceVersionId ?? null,
      chapters: existing?.chapters ?? [],
      createdAt: existing?.createdAt ?? new Date(0).toISOString(),
      updatedAt: existing?.updatedAt ?? new Date(0).toISOString(),
    };
  });

  return buildVolumeWorkspaceDocument({
    novelId: document.novelId,
    volumes: mergedVolumes,
    strategyPlan: document.strategyPlan,
    critiqueReport: document.critiqueReport,
    beatSheets: [],
    rebalanceDecisions: [],
    source: "volume",
    activeVersionId: document.activeVersionId,
  });
}

function mergeBeatSheet(
  document: VolumePlanDocument,
  targetVolume: VolumePlan,
  beats: VolumeBeatSheet["beats"],
): VolumePlanDocument {
  const nextBeatSheets = [
    ...document.beatSheets.filter((sheet) => sheet.volumeId !== targetVolume.id),
    {
      volumeId: targetVolume.id,
      volumeSortOrder: targetVolume.sortOrder,
      status: "generated" as const,
      beats,
    },
  ].sort((left, right) => left.volumeSortOrder - right.volumeSortOrder);

  return buildVolumeWorkspaceDocument({
    novelId: document.novelId,
    volumes: document.volumes,
    strategyPlan: document.strategyPlan,
    critiqueReport: document.critiqueReport,
    beatSheets: nextBeatSheets,
    rebalanceDecisions: document.rebalanceDecisions,
    source: "volume",
    activeVersionId: document.activeVersionId,
  });
}

function mergeChapterList(
  document: VolumePlanDocument,
  targetVolumeId: string,
  generatedChapters: Array<{ title: string; summary: string }>,
): VolumePlanDocument {
  const mergedVolumes = document.volumes.map((volume) => {
    if (volume.id !== targetVolumeId) {
      return volume;
    }
    return {
      ...volume,
      chapters: generatedChapters.map((chapter, chapterIndex) => {
        const existingChapter = volume.chapters[chapterIndex];
        return {
          id: existingChapter?.id,
          volumeId: volume.id,
          chapterOrder: existingChapter?.chapterOrder ?? chapterIndex + 1,
          title: chapter.title,
          summary: chapter.summary,
          purpose: existingChapter?.purpose ?? null,
          conflictLevel: existingChapter?.conflictLevel ?? null,
          revealLevel: existingChapter?.revealLevel ?? null,
          targetWordCount: existingChapter?.targetWordCount ?? null,
          mustAvoid: existingChapter?.mustAvoid ?? null,
          taskSheet: existingChapter?.taskSheet ?? null,
          payoffRefs: existingChapter?.payoffRefs ?? [],
          createdAt: existingChapter?.createdAt ?? new Date(0).toISOString(),
          updatedAt: existingChapter?.updatedAt ?? new Date(0).toISOString(),
        };
      }),
    };
  });

  return buildVolumeWorkspaceDocument({
    novelId: document.novelId,
    volumes: mergedVolumes,
    strategyPlan: document.strategyPlan,
    critiqueReport: document.critiqueReport,
    beatSheets: document.beatSheets,
    rebalanceDecisions: document.rebalanceDecisions,
    source: "volume",
    activeVersionId: document.activeVersionId,
  });
}

function mergeChapterDetail(params: {
  document: VolumePlanDocument;
  targetVolumeId: string;
  targetChapterId: string;
  detailMode: ChapterDetailMode;
  generatedDetail: Record<string, unknown>;
}): VolumePlanDocument {
  const { document, targetVolumeId, targetChapterId, detailMode, generatedDetail } = params;
  const mergedVolumes = document.volumes.map((volume) => {
    if (volume.id !== targetVolumeId) {
      return volume;
    }
    return {
      ...volume,
      chapters: volume.chapters.map((chapter) => {
        if (chapter.id !== targetChapterId) {
          return chapter;
        }
        if (detailMode === "purpose") {
          return {
            ...chapter,
            purpose: typeof generatedDetail.purpose === "string" ? generatedDetail.purpose : chapter.purpose,
          };
        }
        if (detailMode === "boundary") {
          return {
            ...chapter,
            conflictLevel: typeof generatedDetail.conflictLevel === "number" ? generatedDetail.conflictLevel : chapter.conflictLevel,
            revealLevel: typeof generatedDetail.revealLevel === "number" ? generatedDetail.revealLevel : chapter.revealLevel,
            targetWordCount: typeof generatedDetail.targetWordCount === "number" ? generatedDetail.targetWordCount : chapter.targetWordCount,
            mustAvoid: typeof generatedDetail.mustAvoid === "string" ? generatedDetail.mustAvoid : chapter.mustAvoid,
            payoffRefs: Array.isArray(generatedDetail.payoffRefs)
              ? generatedDetail.payoffRefs.filter((item): item is string => typeof item === "string")
              : chapter.payoffRefs,
          };
        }
        return {
          ...chapter,
          taskSheet: typeof generatedDetail.taskSheet === "string" ? generatedDetail.taskSheet : chapter.taskSheet,
        };
      }),
    };
  });

  return buildVolumeWorkspaceDocument({
    novelId: document.novelId,
    volumes: mergedVolumes,
    strategyPlan: document.strategyPlan,
    critiqueReport: document.critiqueReport,
    beatSheets: document.beatSheets,
    rebalanceDecisions: document.rebalanceDecisions,
    source: "volume",
    activeVersionId: document.activeVersionId,
  });
}

function mergeRebalance(
  document: VolumePlanDocument,
  anchorVolumeId: string,
  decisions: VolumeRebalanceDecision[],
): VolumePlanDocument {
  const nextDecisions = [
    ...document.rebalanceDecisions.filter((decision) => decision.anchorVolumeId !== anchorVolumeId),
    ...decisions,
  ];
  return buildVolumeWorkspaceDocument({
    novelId: document.novelId,
    volumes: document.volumes,
    strategyPlan: document.strategyPlan,
    critiqueReport: document.critiqueReport,
    beatSheets: document.beatSheets,
    rebalanceDecisions: nextDecisions,
    source: "volume",
    activeVersionId: document.activeVersionId,
  });
}

async function loadGenerationContext(params: {
  novelId: string;
  workspace: VolumeWorkspace;
  storyMacroPlanService: Pick<StoryMacroPlanService, "getPlan">;
}): Promise<{
  novel: VolumeGenerationNovel;
  storyMacroPlan: Awaited<ReturnType<StoryMacroPlanService["getPlan"]>> | null;
}> {
  const { novelId, storyMacroPlanService } = params;
  const [rawNovel, storyMacroPlan] = await Promise.all([
    prisma.novel.findUnique({
      where: { id: novelId },
      select: {
        title: true,
        description: true,
        targetAudience: true,
        bookSellingPoint: true,
        competingFeel: true,
        first30ChapterPromise: true,
        commercialTagsJson: true,
        estimatedChapterCount: true,
        narrativePov: true,
        pacePreference: true,
        emotionIntensity: true,
        primaryStoryMode: {
          select: {
            id: true,
            name: true,
            description: true,
            template: true,
            parentId: true,
            profileJson: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        secondaryStoryMode: {
          select: {
            id: true,
            name: true,
            description: true,
            template: true,
            parentId: true,
            profileJson: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        genre: {
          select: { name: true },
        },
        characters: {
          orderBy: { createdAt: "asc" },
          select: {
            name: true,
            role: true,
            currentGoal: true,
            currentState: true,
          },
        },
      },
    }),
    storyMacroPlanService.getPlan(novelId).catch(() => null),
  ]);

  if (!rawNovel) {
    throw new Error("小说不存在。");
  }

  const novel: VolumeGenerationNovel = {
    ...rawNovel,
    storyModePromptBlock: buildStoryModePromptBlock({
      primary: rawNovel.primaryStoryMode ? normalizeStoryModeOutput(rawNovel.primaryStoryMode) : null,
      secondary: rawNovel.secondaryStoryMode ? normalizeStoryModeOutput(rawNovel.secondaryStoryMode) : null,
    }),
  };

  return {
    novel,
    storyMacroPlan,
  };
}

async function generateStrategy(params: {
  document: VolumePlanDocument;
  novel: VolumeGenerationNovel;
  workspace: VolumeWorkspace;
  storyMacroPlan: Awaited<ReturnType<StoryMacroPlanService["getPlan"]>> | null;
  options: VolumeGenerateOptions;
}): Promise<VolumePlanDocument> {
  const { document, novel, workspace, storyMacroPlan, options } = params;
  const chapterBudget = deriveChapterBudget({ novel, workspace, options });
  const volumeCountGuidance = buildVolumeCountGuidance({
    chapterBudget,
    existingVolumeCount: workspace.volumes.length,
    respectExistingVolumeCount: options.respectExistingVolumeCount,
    userPreferredVolumeCount: options.userPreferredVolumeCount,
    maxVolumeCount: MAX_VOLUME_COUNT,
  });
  await notifyVolumeGenerationPhase({
    novelId: document.novelId,
    scope: "strategy",
    phase: "prompt",
    label: "正在生成卷战略",
    options,
  });
  const generated = await runStructuredPrompt({
    asset: createVolumeStrategyPrompt({
      maxVolumeCount: MAX_VOLUME_COUNT,
      allowedVolumeCountRange: volumeCountGuidance.allowedVolumeCountRange,
      fixedRecommendedVolumeCount: volumeCountGuidance.userPreferredVolumeCount,
      hardPlannedVolumeRange: volumeCountGuidance.hardPlannedVolumeRange,
    }),
    promptInput: {
      novel,
      workspace,
      storyMacroPlan,
      guidance: options.guidance,
      volumeCountGuidance,
    },
    contextBlocks: buildVolumeStrategyContextBlocks({
      novel,
      workspace,
      storyMacroPlan,
      guidance: options.guidance,
      volumeCountGuidance,
    }),
    options: {
      provider: options.provider,
      model: options.model,
      temperature: options.temperature ?? 0.3,
    },
  });
  return mergeStrategyPlan(document, generated.output);
}

async function generateStrategyCritique(params: {
  document: VolumePlanDocument;
  novel: VolumeGenerationNovel;
  workspace: VolumeWorkspace;
  storyMacroPlan: Awaited<ReturnType<StoryMacroPlanService["getPlan"]>> | null;
  options: VolumeGenerateOptions;
}): Promise<VolumePlanDocument> {
  const { document, novel, workspace, storyMacroPlan, options } = params;
  if (!document.strategyPlan) {
    throw new Error("请先生成卷战略建议。");
  }
  await notifyVolumeGenerationPhase({
    novelId: document.novelId,
    scope: "strategy_critique",
    phase: "prompt",
    label: "正在评估卷战略",
    options,
  });
  const generated = await runStructuredPrompt({
    asset: volumeStrategyCritiquePrompt,
    promptInput: {
      novel,
      workspace,
      storyMacroPlan,
      strategyPlan: document.strategyPlan,
      guidance: options.guidance,
    },
    contextBlocks: buildVolumeStrategyCritiqueContextBlocks({
      novel,
      workspace,
      storyMacroPlan,
      strategyPlan: document.strategyPlan,
      guidance: options.guidance,
    }),
    options: {
      provider: options.provider,
      model: options.model,
      temperature: options.temperature ?? 0.2,
    },
  });
  return mergeCritiqueReport(document, generated.output);
}

async function generateSkeleton(params: {
  document: VolumePlanDocument;
  novel: VolumeGenerationNovel;
  workspace: VolumeWorkspace;
  storyMacroPlan: Awaited<ReturnType<StoryMacroPlanService["getPlan"]>> | null;
  options: VolumeGenerateOptions;
}): Promise<VolumePlanDocument> {
  const { document, novel, workspace, storyMacroPlan, options } = params;
  if (!document.strategyPlan) {
    throw new Error("请先生成卷战略建议。");
  }
  const chapterBudget = deriveChapterBudget({ novel, workspace, options });
  const volumeCountGuidance = buildVolumeCountGuidance({
    chapterBudget,
    existingVolumeCount: workspace.volumes.length,
    respectExistingVolumeCount: options.respectExistingVolumeCount,
    userPreferredVolumeCount: options.userPreferredVolumeCount,
    maxVolumeCount: MAX_VOLUME_COUNT,
  });
  const targetVolumeCount = document.strategyPlan.recommendedVolumeCount;
  await notifyVolumeGenerationPhase({
    novelId: document.novelId,
    scope: "skeleton",
    phase: "prompt",
    label: "正在生成卷骨架",
    options,
  });
  const generated = await runStructuredPrompt({
    asset: createVolumeSkeletonPrompt(targetVolumeCount),
    promptInput: {
      novel,
      workspace,
      storyMacroPlan,
      strategyPlan: document.strategyPlan,
      guidance: options.guidance,
      volumeCountGuidance,
      chapterBudget,
    },
    contextBlocks: buildVolumeSkeletonContextBlocks({
      novel,
      workspace,
      storyMacroPlan,
      strategyPlan: document.strategyPlan,
      guidance: options.guidance,
      volumeCountGuidance,
      chapterBudget,
    }),
    options: {
      provider: options.provider,
      model: options.model,
      temperature: options.temperature ?? 0.35,
    },
  });
  return mergeSkeleton(document, generated.output.volumes);
}

async function generateBeatSheet(params: {
  document: VolumePlanDocument;
  novel: VolumeGenerationNovel;
  workspace: VolumeWorkspace;
  storyMacroPlan: Awaited<ReturnType<StoryMacroPlanService["getPlan"]>> | null;
  options: VolumeGenerateOptions;
}): Promise<VolumePlanDocument> {
  const { document, novel, workspace, storyMacroPlan, options } = params;
  const targetVolume = getTargetVolume(document, options.targetVolumeId);
  await notifyVolumeGenerationPhase({
    novelId: document.novelId,
    scope: "beat_sheet",
    phase: "prompt",
    label: `正在生成第 ${targetVolume.sortOrder} 卷节奏板`,
    options,
  });
  const generated = await runStructuredPrompt({
    asset: volumeBeatSheetPrompt,
    promptInput: {
      novel,
      workspace,
      storyMacroPlan,
      strategyPlan: document.strategyPlan,
      targetVolume,
      guidance: options.guidance,
    },
    contextBlocks: buildVolumeBeatSheetContextBlocks({
      novel,
      workspace,
      storyMacroPlan,
      strategyPlan: document.strategyPlan,
      targetVolume,
      guidance: options.guidance,
    }),
    options: {
      provider: options.provider,
      model: options.model,
      temperature: options.temperature ?? 0.35,
    },
  });
  return mergeBeatSheet(document, targetVolume, generated.output.beats);
}

async function generateRebalance(params: {
  document: VolumePlanDocument;
  novel: VolumeGenerationNovel;
  workspace: VolumeWorkspace;
  storyMacroPlan: Awaited<ReturnType<StoryMacroPlanService["getPlan"]>> | null;
  options: VolumeGenerateOptions;
}): Promise<VolumePlanDocument> {
  const { document, novel, workspace, storyMacroPlan, options } = params;
  const anchorVolume = getTargetVolume(document, options.targetVolumeId);
  const anchorIndex = document.volumes.findIndex((volume) => volume.id === anchorVolume.id);
  const previousVolume = anchorIndex > 0 ? document.volumes[anchorIndex - 1] : undefined;
  const nextVolume = anchorIndex >= 0 && anchorIndex < document.volumes.length - 1 ? document.volumes[anchorIndex + 1] : undefined;
  await notifyVolumeGenerationPhase({
    novelId: document.novelId,
    scope: "rebalance",
    phase: "prompt",
    label: `正在校准第 ${anchorVolume.sortOrder} 卷与相邻卷衔接`,
    options,
  });
  const generated = await runStructuredPrompt({
    asset: volumeRebalancePrompt,
    promptInput: {
      novel,
      workspace,
      storyMacroPlan,
      strategyPlan: document.strategyPlan,
      anchorVolume,
      previousVolume,
      nextVolume,
      guidance: options.guidance,
    },
    contextBlocks: buildVolumeRebalanceContextBlocks({
      novel,
      workspace,
      storyMacroPlan,
      strategyPlan: document.strategyPlan,
      anchorVolume,
      previousVolume,
      nextVolume,
      guidance: options.guidance,
    }),
    options: {
      provider: options.provider,
      model: options.model,
      temperature: options.temperature ?? 0.25,
    },
  });
  return mergeRebalance(document, anchorVolume.id, generated.output.decisions);
}

async function generateChapterList(params: {
  document: VolumePlanDocument;
  novel: VolumeGenerationNovel;
  workspace: VolumeWorkspace;
  storyMacroPlan: Awaited<ReturnType<StoryMacroPlanService["getPlan"]>> | null;
  options: VolumeGenerateOptions;
}): Promise<VolumePlanDocument> {
  const { document, novel, workspace, storyMacroPlan, options } = params;
  const targetVolume = getTargetVolume(document, options.targetVolumeId);
  const targetBeatSheet = getBeatSheet(document, targetVolume.id);
  if (!targetBeatSheet) {
    throw new Error("当前卷还没有节奏板，默认不能直接拆章节列表。");
  }
  const chapterBudget = deriveChapterBudget({ novel, workspace, options });
  const chapterBudgets = allocateChapterBudgets({
    volumeCount: Math.max(document.volumes.length, 1),
    chapterBudget,
    existingVolumes: document.volumes,
  });
  const targetIndex = document.volumes.findIndex((volume) => volume.id === targetVolume.id);
  const beatSheetRequiredChapterCount = inferRequiredChapterCountFromBeatSheet(targetBeatSheet);
  const existingOrBudgetChapterCount = targetVolume.chapters.length >= 3
    ? targetVolume.chapters.length
    : chapterBudgets[targetIndex] ?? Math.max(3, Math.round(chapterBudget / Math.max(document.volumes.length, 1)));
  const targetChapterCount = Math.max(existingOrBudgetChapterCount, beatSheetRequiredChapterCount);

  await notifyVolumeGenerationPhase({
    novelId: document.novelId,
    scope: "chapter_list",
    phase: "prompt",
    label: `正在生成第 ${targetVolume.sortOrder} 卷章节列表`,
    options,
  });
  const generated = await runStructuredPrompt({
    asset: createVolumeChapterListPrompt(targetChapterCount),
    promptInput: {
      novel,
      workspace,
      storyMacroPlan,
      strategyPlan: document.strategyPlan,
      targetVolume,
      targetBeatSheet,
      previousVolume: targetIndex > 0 ? document.volumes[targetIndex - 1] : undefined,
      nextVolume: targetIndex < document.volumes.length - 1 ? document.volumes[targetIndex + 1] : undefined,
      guidance: options.guidance,
      targetChapterCount,
    },
    contextBlocks: buildVolumeChapterListContextBlocks({
      novel,
      workspace,
      storyMacroPlan,
      strategyPlan: document.strategyPlan,
      targetVolume,
      targetBeatSheet,
      previousVolume: targetIndex > 0 ? document.volumes[targetIndex - 1] : undefined,
      nextVolume: targetIndex < document.volumes.length - 1 ? document.volumes[targetIndex + 1] : undefined,
      guidance: options.guidance,
      targetChapterCount,
    }),
    options: {
      provider: options.provider,
      model: options.model,
      temperature: options.temperature ?? 0.35,
    },
  });

  const mergedDocument = mergeChapterList(document, targetVolume.id, generated.output.chapters);
  return generateRebalance({
    document: mergedDocument,
    novel,
    workspace: {
      ...workspace,
      ...mergedDocument,
    },
    storyMacroPlan,
    options: {
      ...options,
      scope: "rebalance",
      targetVolumeId: targetVolume.id,
    },
  });
}

async function generateChapterDetail(params: {
  document: VolumePlanDocument;
  novel: VolumeGenerationNovel;
  workspace: VolumeWorkspace;
  storyMacroPlan: Awaited<ReturnType<StoryMacroPlanService["getPlan"]>> | null;
  options: VolumeGenerateOptions;
}): Promise<VolumePlanDocument> {
  const { document, novel, workspace, storyMacroPlan, options } = params;
  const targetVolume = getTargetVolume(document, options.targetVolumeId);
  const targetChapter = getTargetChapter(targetVolume, options.targetChapterId);
  const detailMode = options.detailMode;
  if (!detailMode) {
    throw new Error("生成章节细化时必须指定生成类型。");
  }
  const promptInput = {
    novel,
    workspace,
    storyMacroPlan,
    strategyPlan: document.strategyPlan,
    targetVolume,
    targetBeatSheet: getBeatSheet(document, targetVolume.id),
    targetChapter,
    guidance: options.guidance,
    detailMode,
  };
  await notifyVolumeGenerationPhase({
    novelId: document.novelId,
    scope: "chapter_detail",
    phase: "prompt",
    label: `正在细化第 ${targetVolume.sortOrder} 卷第 ${targetChapter.chapterOrder} 章 · ${detailMode}`,
    options,
  });
  const generated = detailMode === "purpose"
    ? await runStructuredPrompt({
      asset: volumeChapterPurposePrompt,
      promptInput,
      contextBlocks: buildVolumeChapterDetailContextBlocks(promptInput),
      options: {
        provider: options.provider,
        model: options.model,
        temperature: options.temperature ?? 0.35,
      },
    })
    : detailMode === "boundary"
      ? await runStructuredPrompt({
        asset: volumeChapterBoundaryPrompt,
        promptInput,
        contextBlocks: buildVolumeChapterDetailContextBlocks(promptInput),
        options: {
          provider: options.provider,
          model: options.model,
          temperature: options.temperature ?? 0.35,
        },
      })
      : await runStructuredPrompt({
        asset: volumeChapterTaskSheetPrompt,
        promptInput,
        contextBlocks: buildVolumeChapterDetailContextBlocks(promptInput),
        options: {
          provider: options.provider,
          model: options.model,
          temperature: options.temperature ?? 0.35,
        },
      });

  return mergeChapterDetail({
    document,
    targetVolumeId: targetVolume.id,
    targetChapterId: targetChapter.id,
    detailMode,
    generatedDetail: generated.output as Record<string, unknown>,
  });
}

export async function generateVolumePlanDocument(params: {
  novelId: string;
  workspace: VolumeWorkspace;
  options?: VolumeGenerateOptions;
  storyMacroPlanService: Pick<StoryMacroPlanService, "getPlan">;
}): Promise<VolumePlanDocument> {
  const { novelId, workspace, options = {}, storyMacroPlanService } = params;
  const scope = normalizeScope(options.scope);
  const baseDocument = buildVolumeWorkspaceDocument({
    novelId,
    volumes: options.draftVolumes
      ? normalizeVolumeDraftContextInput(novelId, options.draftVolumes)
      : workspace.volumes,
    strategyPlan: workspace.strategyPlan,
    critiqueReport: workspace.critiqueReport,
    beatSheets: workspace.beatSheets,
    rebalanceDecisions: workspace.rebalanceDecisions,
    source: workspace.source,
    activeVersionId: workspace.activeVersionId,
  });
  assertScopeReadiness(baseDocument, scope, options.targetVolumeId);
  await notifyVolumeGenerationPhase({
    novelId,
    scope,
    phase: "load_context",
    label: scope === "chapter_list"
      ? "正在整理拆章上下文"
      : scope === "beat_sheet"
        ? "正在整理节奏板上下文"
        : scope === "skeleton"
          ? "正在整理卷骨架上下文"
          : scope === "strategy"
            ? "正在整理卷战略上下文"
            : scope === "rebalance"
              ? "正在整理相邻卷衔接上下文"
              : "正在整理卷规划上下文",
    options,
  });
  const { novel, storyMacroPlan } = await loadGenerationContext({
    novelId,
    workspace,
    storyMacroPlanService,
  });
  const currentWorkspace: VolumeWorkspace = {
    ...workspace,
    ...baseDocument,
  };

  if (scope === "strategy") {
    return generateStrategy({
      document: baseDocument,
      novel,
      workspace: currentWorkspace,
      storyMacroPlan,
      options,
    });
  }
  if (scope === "strategy_critique") {
    return generateStrategyCritique({
      document: baseDocument,
      novel,
      workspace: currentWorkspace,
      storyMacroPlan,
      options,
    });
  }
  if (scope === "skeleton") {
    return generateSkeleton({
      document: baseDocument,
      novel,
      workspace: currentWorkspace,
      storyMacroPlan,
      options,
    });
  }
  if (scope === "beat_sheet") {
    return generateBeatSheet({
      document: baseDocument,
      novel,
      workspace: currentWorkspace,
      storyMacroPlan,
      options,
    });
  }
  if (scope === "chapter_list") {
    return generateChapterList({
      document: baseDocument,
      novel,
      workspace: currentWorkspace,
      storyMacroPlan,
      options,
    });
  }
  if (scope === "rebalance") {
    return generateRebalance({
      document: baseDocument,
      novel,
      workspace: currentWorkspace,
      storyMacroPlan,
      options,
    });
  }
  return generateChapterDetail({
    document: baseDocument,
    novel,
    workspace: currentWorkspace,
    storyMacroPlan,
    options,
  });
}
