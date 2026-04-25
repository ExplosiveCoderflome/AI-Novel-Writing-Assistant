import type {
  VolumeChapterPlan,
  VolumePlan,
  VolumePlanDocument,
} from "@ai-novel/shared/types/novel";
import { prisma } from "../../../db/prisma";
import { runStructuredPrompt } from "../../../prompting/core/promptRunner";
import {
  createVolumeChapterListPrompt,
  createVolumeSkeletonPrompt,
  volumeChapterBoundaryPrompt,
  volumeChapterPurposePrompt,
  volumeChapterTaskSheetPrompt,
} from "../../../prompting/prompts/novel/volumePlanning.prompts";
import type { StoryMacroPlanService } from "../storyMacro/StoryMacroPlanService";
import {
  buildDerivedOutlineFromVolumes,
  buildDerivedStructuredOutlineFromVolumes,
  normalizeVolumeDraftInput,
} from "./volumePlanUtils";
import {
  createBookVolumeSkeletonSchema,
  createChapterBoundarySchema,
  createChapterPurposeSchema,
  createChapterTaskSheetSchema,
  createVolumeChapterListSchema,
} from "./volumeGenerationSchemas";
import type {
  ChapterDetailMode,
  VolumeGenerateOptions,
  VolumeGenerationNovel,
  VolumeWorkspace,
} from "./volumeModels";
import { buildStoryModePromptBlock, normalizeStoryModeOutput } from "../../storyMode/storyModeProfile";

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

function suggestVolumeCount(chapterBudget: number): number {
  if (chapterBudget <= 24) return 1;
  if (chapterBudget <= 60) return 3;
  return 4;
}

function deriveVolumeCount(params: {
  workspace: VolumeWorkspace;
  chapterBudget: number;
  options: VolumeGenerateOptions;
}): number {
  const { workspace, chapterBudget, options } = params;
  if (workspace.volumes.length > 0 && options.respectExistingVolumeCount !== false) {
    return workspace.volumes.length;
  }
  return suggestVolumeCount(chapterBudget);
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
  const existingCounts = Array.from({ length: safeVolumeCount }, (_, index) => Math.max(existingVolumes[index]?.chapters.length ?? 0, 0));
  const averageBudget = totalBudget / safeVolumeCount;
  const usefulExistingChapterThreshold = Math.max(12, Math.floor(averageBudget * 0.5));
  const hasUsefulWeights = existingCounts.some((count) => count >= usefulExistingChapterThreshold);
  const weights = hasUsefulWeights
    ? existingCounts.map((count) => Math.max(count, 1))
    : Array.from({ length: safeVolumeCount }, () => 1);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const rawBudgets = weights.map((weight) => (totalBudget * weight) / totalWeight);
  const budgets = rawBudgets.map((budget) => Math.max(minimumPerVolume, Math.floor(budget)));
  let delta = totalBudget - budgets.reduce((sum, budget) => sum + budget, 0);
  const distributionOrder = rawBudgets
    .map((budget, index) => ({ index, fraction: budget - Math.floor(budget) }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index)
    .map((item) => item.index);

  while (delta !== 0) {
    const direction = delta > 0 ? 1 : -1;
    for (const index of distributionOrder) {
      if (delta === 0) {
        break;
      }
      if (direction < 0 && budgets[index] <= minimumPerVolume) {
        continue;
      }
      budgets[index] += direction;
      delta -= direction;
    }
  }

  return budgets;
}

function mergeBookSkeletonIntoWorkspace(params: {
  novelId: string;
  workspace: VolumeWorkspace;
  generatedVolumes: Array<{
    title: string;
    summary?: string | null;
    mainPromise: string;
    escalationMode: string;
    protagonistChange: string;
    climax: string;
    nextVolumeHook: string;
    resetPoint?: string | null;
    openPayoffs: string[];
  }>;
}): VolumePlan[] {
  const { novelId, workspace, generatedVolumes } = params;
  const merged = generatedVolumes.map((volume, index) => {
    const existing = workspace.volumes[index];
    return {
      id: existing?.id,
      novelId,
      sortOrder: index + 1,
      title: volume.title,
      summary: volume.summary ?? null,
      mainPromise: volume.mainPromise,
      escalationMode: volume.escalationMode,
      protagonistChange: volume.protagonistChange,
      climax: volume.climax,
      nextVolumeHook: volume.nextVolumeHook,
      resetPoint: volume.resetPoint ?? null,
      openPayoffs: volume.openPayoffs,
      status: existing?.status ?? "active",
      sourceVersionId: existing?.sourceVersionId ?? null,
      chapters: existing?.chapters ?? [],
    };
  });
  return normalizeVolumeDraftInput(novelId, merged);
}

function mergeVolumeChapterListIntoWorkspace(params: {
  novelId: string;
  workspace: VolumeWorkspace;
  targetVolumeId: string;
  generatedChapters: Array<{
    title: string;
    summary: string;
  }>;
}): VolumePlan[] {
  const { novelId, workspace, targetVolumeId, generatedChapters } = params;
  const targetIndex = workspace.volumes.findIndex((volume) => volume.id === targetVolumeId);
  if (targetIndex < 0) {
    throw new Error("目标卷不存在，无法生成章节列表。");
  }
  const merged = workspace.volumes.map((volume, index) => {
    if (index !== targetIndex) {
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
        };
      }),
    };
  });
  return normalizeVolumeDraftInput(novelId, merged);
}

function mergeChapterDetailIntoWorkspace(params: {
  novelId: string;
  workspace: VolumeWorkspace;
  targetVolumeId: string;
  targetChapterId: string;
  detailMode: ChapterDetailMode;
  generatedDetail: Record<string, unknown>;
}): VolumePlan[] {
  const { novelId, workspace, targetVolumeId, targetChapterId, detailMode, generatedDetail } = params;
  const merged = workspace.volumes.map((volume) => {
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
  return normalizeVolumeDraftInput(novelId, merged);
}

async function generateBookSkeleton(params: {
  novelId: string;
  novel: VolumeGenerationNovel;
  workspace: VolumeWorkspace;
  storyMacroPlan: Awaited<ReturnType<StoryMacroPlanService["getPlan"]>> | null;
  options: VolumeGenerateOptions;
}): Promise<VolumePlan[]> {
  const { novelId, novel, workspace, storyMacroPlan, options } = params;
  const chapterBudget = deriveChapterBudget({ novel, workspace, options });
  const targetVolumeCount = deriveVolumeCount({ workspace, chapterBudget, options });
  const chapterBudgets = allocateChapterBudgets({
    volumeCount: targetVolumeCount,
    chapterBudget,
    existingVolumes: workspace.volumes,
  });
  const generated = await runStructuredPrompt({
    asset: createVolumeSkeletonPrompt(targetVolumeCount),
    promptInput: {
      novel,
      workspace,
      storyMacroPlan,
      guidance: options.guidance,
      chapterBudget,
      targetVolumeCount,
      chapterBudgets,
    },
    options: {
      provider: options.provider,
      model: options.model,
      temperature: options.temperature ?? 0.35,
    },
  });
  return mergeBookSkeletonIntoWorkspace({
    novelId,
    workspace,
    generatedVolumes: generated.output.volumes,
  });
}

async function generateVolumeChapterList(params: {
  novelId: string;
  novel: VolumeGenerationNovel;
  workspace: VolumeWorkspace;
  storyMacroPlan: Awaited<ReturnType<StoryMacroPlanService["getPlan"]>> | null;
  options: VolumeGenerateOptions;
}): Promise<VolumePlan[]> {
  const { novelId, novel, workspace, storyMacroPlan, options } = params;
  const targetVolumeId = options.targetVolumeId?.trim();
  if (!targetVolumeId) {
    throw new Error("按卷生成章节列表时必须指定目标卷。");
  }
  const targetIndex = workspace.volumes.findIndex((volume) => volume.id === targetVolumeId);
  if (targetIndex < 0) {
    throw new Error("目标卷不存在，无法生成章节列表。");
  }
  const chapterBudget = deriveChapterBudget({ novel, workspace, options });
  const chapterBudgets = allocateChapterBudgets({
    volumeCount: Math.max(workspace.volumes.length, 1),
    chapterBudget,
    existingVolumes: workspace.volumes,
  });
  const targetVolume = workspace.volumes[targetIndex];
  const targetChapterCount = targetVolume.chapters.length >= 3
    ? targetVolume.chapters.length
    : chapterBudgets[targetIndex] ?? Math.max(3, Math.round(chapterBudget / Math.max(workspace.volumes.length, 1)));

  const generated = await runStructuredPrompt({
    asset: createVolumeChapterListPrompt(targetChapterCount),
    promptInput: {
      novel,
      workspace,
      targetVolume,
      previousVolume: targetIndex > 0 ? workspace.volumes[targetIndex - 1] : undefined,
      nextVolume: targetIndex < workspace.volumes.length - 1 ? workspace.volumes[targetIndex + 1] : undefined,
      storyMacroPlan,
      guidance: options.guidance,
      chapterBudget,
      targetChapterCount,
    },
    options: {
      provider: options.provider,
      model: options.model,
      temperature: options.temperature ?? 0.35,
    },
  });

  return mergeVolumeChapterListIntoWorkspace({
    novelId,
    workspace,
    targetVolumeId,
    generatedChapters: generated.output.chapters,
  });
}

async function generateChapterDetail(params: {
  novelId: string;
  novel: VolumeGenerationNovel;
  workspace: VolumeWorkspace;
  storyMacroPlan: Awaited<ReturnType<StoryMacroPlanService["getPlan"]>> | null;
  options: VolumeGenerateOptions;
}): Promise<VolumePlan[]> {
  const { novelId, novel, workspace, storyMacroPlan, options } = params;
  const targetVolumeId = options.targetVolumeId?.trim();
  const targetChapterId = options.targetChapterId?.trim();
  const detailMode = options.detailMode;

  if (!targetVolumeId || !targetChapterId || !detailMode) {
    throw new Error("生成章节细化时缺少必要参数。");
  }

  const targetVolume = workspace.volumes.find((volume) => volume.id === targetVolumeId);
  if (!targetVolume) {
    throw new Error("目标卷不存在，无法生成章节细化。");
  }
  const targetChapter = targetVolume.chapters.find((chapter) => chapter.id === targetChapterId);
  if (!targetChapter) {
    throw new Error("目标章节不存在，无法生成章节细化。");
  }

  const promptInput = {
    novel,
    workspace,
    targetVolume,
    targetChapter,
    storyMacroPlan,
    guidance: options.guidance,
    detailMode,
  };
  const generated = detailMode === "purpose"
    ? await runStructuredPrompt({
      asset: volumeChapterPurposePrompt,
      promptInput,
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
        options: {
          provider: options.provider,
          model: options.model,
          temperature: options.temperature ?? 0.35,
        },
      })
      : await runStructuredPrompt({
        asset: volumeChapterTaskSheetPrompt,
        promptInput,
        options: {
          provider: options.provider,
          model: options.model,
          temperature: options.temperature ?? 0.35,
        },
      });

  return mergeChapterDetailIntoWorkspace({
    novelId,
    workspace,
    targetVolumeId,
    targetChapterId,
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
  const [rawNovel, storyMacroPlan]: [
    (Omit<VolumeGenerationNovel, "storyModePromptBlock"> & {
      primaryStoryMode: {
        id: string;
        name: string;
        description: string | null;
        template: string | null;
        parentId: string | null;
        profileJson: string | null;
        createdAt: Date;
        updatedAt: Date;
      } | null;
      secondaryStoryMode: {
        id: string;
        name: string;
        description: string | null;
        template: string | null;
        parentId: string | null;
        profileJson: string | null;
        createdAt: Date;
        updatedAt: Date;
      } | null;
    }) | null,
    Awaited<ReturnType<StoryMacroPlanService["getPlan"]>> | null,
  ] = await Promise.all([
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

  const volumes = options.scope === "volume"
    ? await generateVolumeChapterList({
      novelId,
      novel,
      workspace,
      storyMacroPlan,
      options,
    })
    : options.scope === "chapter_detail"
      ? await generateChapterDetail({
        novelId,
        novel,
        workspace,
        storyMacroPlan,
        options,
      })
      : await generateBookSkeleton({
        novelId,
        novel,
        workspace,
        storyMacroPlan,
        options,
      });

  return {
    novelId,
    workspaceVersion: "v2",
    volumes,
    strategyPlan: workspace.strategyPlan,
    critiqueReport: workspace.critiqueReport,
    beatSheets: workspace.beatSheets,
    rebalanceDecisions: workspace.rebalanceDecisions,
    readiness: workspace.readiness,
    derivedOutline: buildDerivedOutlineFromVolumes(volumes),
    derivedStructuredOutline: buildDerivedStructuredOutlineFromVolumes(volumes),
    source: "volume",
    activeVersionId: workspace.activeVersionId,
  };
}
