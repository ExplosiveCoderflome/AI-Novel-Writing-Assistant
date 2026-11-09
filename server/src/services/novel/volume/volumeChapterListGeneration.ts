import type { VolumeChapterListProgress } from "@ai-novel/shared/types/volumePlanning";
import type {
  VolumeBeat,
  VolumeBeatSheet,
  VolumePlan,
  VolumePlanDocument,
} from "@ai-novel/shared/types/novel";
import type { StoryMacroPlan } from "@ai-novel/shared/types/storyMacro";
import { buildDirectorCompletionProfile } from "@ai-novel/shared/types/directorCompletion";
import { runStructuredPrompt } from "../../../prompting/core/promptRunner";
import { logMemoryUsage } from "../../../runtime/memoryTelemetry";
import { createVolumeChapterListPrompt } from "../../../prompting/prompts/novel/volume/chapterList.prompts";
import { buildVolumeChapterListContextBlocks } from "../../../prompting/prompts/novel/volume/contextBlocks";
import {
  inferRequiredChapterCountFromBeatSheet,
  resolveTargetChapterCount,
  validateBeatSheetChapterCoverage,
} from "./volumeBeatSheetChapterBudget";
import {
  allocateChapterBudgets,
  deriveChapterBudget,
  resolveEvenShareChapterBudget,
  GeneratedVolumeChapterBlock,
  getBeatExpectedChapterCount,
  getBeatSheet,
  getTargetVolume,
  isVolumeChapterListPartiallyPersisted,
  mergeChapterList,
  resolveVolumeChapterBeatKey,
  setVolumeChapterListPartialStatus,
} from "./volumeGenerationHelpers";
import { assessChapterTitleDiversity } from "./chapterTitleDiversity";
import type {
  VolumeGenerateOptions,
  VolumeGenerationNovel,
  VolumeIntermediateDocumentEvent,
  VolumeWorkspace,
} from "./volumeModels";

type StoryMacroPlanResult = StoryMacroPlan | null;

interface BeatGenerationPlan {
  beat: VolumeBeat;
  chapterCount: number;
  chapterStartOrder: number;
  chapterEndOrder: number;
}

interface FullVolumeResumeState {
  resumeBeatIndex: number;
  resumeBeatKey: string | null;
  preservedBeatBlocks: GeneratedVolumeChapterBlock[];
  isAlreadyComplete: boolean;
}

export function isCompactBookFinaleBeat(params: {
  completionProfile: VolumeGenerationNovel["completionProfile"];
  targetVolumeIndex: number;
  chapterBudgets: number[];
  beatChapterEndOrder: number;
}): boolean {
  if (params.completionProfile?.mode !== "compact_book" || params.targetVolumeIndex < 0) {
    return false;
  }
  const chaptersBeforeCurrentVolume = params.chapterBudgets
    .slice(0, params.targetVolumeIndex)
    .reduce((total, chapterCount) => total + chapterCount, 0);
  return chaptersBeforeCurrentVolume + params.beatChapterEndOrder
    >= params.completionProfile.endingRequiredBy;
}

function buildBeatGenerationPlans(beatSheet: VolumeBeatSheet): BeatGenerationPlan[] {
  let nextChapterOrder = 1;
  return beatSheet.beats.map((beat) => {
    const chapterCount = Math.max(1, getBeatExpectedChapterCount(beat));
    const plan: BeatGenerationPlan = {
      beat,
      chapterCount,
      chapterStartOrder: nextChapterOrder,
      chapterEndOrder: nextChapterOrder + chapterCount - 1,
    };
    nextChapterOrder = plan.chapterEndOrder + 1;
    return plan;
  });
}

function normalizeExplicitChapterCount(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.max(1, Math.round(value))
    : null;
}

function scaleBeatSheetToChapterCount(
  beatSheet: VolumeBeatSheet,
  targetChapterCount: number,
): VolumeBeatSheet {
  if (beatSheet.beats.length === 0) {
    return beatSheet;
  }
  const originalCounts = beatSheet.beats.map((beat) => Math.max(1, getBeatExpectedChapterCount(beat)));
  const originalTotal = originalCounts.reduce((sum, count) => sum + count, 0);
  // Every saved beat still needs a chapter to carry its story function. This
  // floor follows the existing small-book tolerance instead of dropping beats.
  const safeTargetChapterCount = Math.max(beatSheet.beats.length, Math.round(targetChapterCount));
  if (originalTotal === safeTargetChapterCount) {
    return beatSheet;
  }

  const scaledCounts = originalCounts.map((count) => Math.max(
    1,
    Math.floor((count * safeTargetChapterCount) / originalTotal),
  ));
  let delta = safeTargetChapterCount - scaledCounts.reduce((sum, count) => sum + count, 0);
  const distributionOrder = originalCounts
    .map((count, index) => ({ count, index }))
    .sort((left, right) => right.count - left.count || left.index - right.index)
    .map(({ index }) => index);
  while (delta > 0) {
    for (const index of distributionOrder) {
      if (delta === 0) break;
      scaledCounts[index] += 1;
      delta -= 1;
    }
  }
  while (delta < 0) {
    let reduced = false;
    for (const index of distributionOrder) {
      if (delta === 0) break;
      if (scaledCounts[index] <= 1) continue;
      scaledCounts[index] -= 1;
      delta += 1;
      reduced = true;
    }
    if (!reduced) break;
  }

  let nextChapterOrder = 1;
  return {
    ...beatSheet,
    beats: beatSheet.beats.map((beat, index) => {
      const chapterCount = scaledCounts[index];
      const chapterStartOrder = nextChapterOrder;
      const chapterEndOrder = chapterStartOrder + chapterCount - 1;
      nextChapterOrder = chapterEndOrder + 1;
      return {
        ...beat,
        chapterSpanHint: chapterCount === 1
          ? `${chapterStartOrder}章`
          : `${chapterStartOrder}-${chapterEndOrder}章`,
      };
    }),
  };
}

function resolveFullVolumeResumeState(params: {
  beatPlans: BeatGenerationPlan[];
  existingBeatBlocks: GeneratedVolumeChapterBlock[];
}): FullVolumeResumeState {
  let resumeBeatIndex = params.beatPlans.length;
  for (const [index, beatPlan] of params.beatPlans.entries()) {
    const existingBlock = params.existingBeatBlocks[index];
    if (existingBlock && existingBlock.chapters.length === beatPlan.chapterCount) {
      continue;
    }
    resumeBeatIndex = index;
    break;
  }

  if (resumeBeatIndex >= params.beatPlans.length) {
    return {
      resumeBeatIndex,
      resumeBeatKey: null,
      preservedBeatBlocks: params.existingBeatBlocks.slice(),
      isAlreadyComplete: true,
    };
  }

  return {
    resumeBeatIndex,
    resumeBeatKey: params.beatPlans[resumeBeatIndex]?.beat.key ?? null,
    preservedBeatBlocks: params.existingBeatBlocks.slice(0, resumeBeatIndex),
    isAlreadyComplete: false,
  };
}

function summarizeBeatBlocks(blocks: GeneratedVolumeChapterBlock[]): string {
  if (blocks.length === 0) {
    return "none";
  }
  return blocks
    .map((block) => (
      `${block.beatLabel} (${block.beatKey}) | ${block.chapterCount}章 | ${
        block.chapters.map((chapter, index) => `第${index + 1}章 ${chapter.title}`).join(" / ")
      }`
    ))
    .join("\n");
}

function buildExistingBeatBlocks(params: {
  volume: VolumePlan;
  beatSheet: VolumeBeatSheet;
}): GeneratedVolumeChapterBlock[] {
  return params.beatSheet.beats.map((beat) => {
    const chapters = params.volume.chapters
      .slice()
      .sort((left, right) => left.chapterOrder - right.chapterOrder)
      .filter((chapter) => resolveVolumeChapterBeatKey({
        chapter,
        volume: params.volume,
        beatSheet: params.beatSheet,
      }) === beat.key)
      .map((chapter) => ({
        beatKey: beat.key,
        title: chapter.title,
        summary: chapter.summary,
        ...(chapter.plannedCharacterIds !== undefined ? {plannedCharacterIds: chapter.plannedCharacterIds} : {}),
      }));

    return {
      beatKey: beat.key,
      beatLabel: beat.label,
      chapterCount: chapters.length,
      chapters,
    };
  });
}

function buildPreviousBeatSummary(params: {
  generationMode: "full_volume" | "single_beat";
  generatedBlocks: GeneratedVolumeChapterBlock[];
  existingBeatBlocks: GeneratedVolumeChapterBlock[];
  preservedBeatBlocks?: GeneratedVolumeChapterBlock[];
  targetBeatIndex: number;
}): string {
  if (params.generationMode === "full_volume") {
    return summarizeBeatBlocks([...(params.preservedBeatBlocks ?? []), ...params.generatedBlocks]);
  }
  return summarizeBeatBlocks(params.existingBeatBlocks.slice(0, params.targetBeatIndex));
}

function buildPreservedBeatSummary(params: {
  existingBeatBlocks: GeneratedVolumeChapterBlock[];
  targetBeatIndex: number;
}): string {
  return summarizeBeatBlocks(params.existingBeatBlocks
    .slice(params.targetBeatIndex + 1)
    .filter((block) => block.chapters.length > 0));
}

function assertMergedVolumeChapterList(params: {
  volume: VolumePlan;
  beatSheet: VolumeBeatSheet;
  generationMode: "full_volume" | "single_beat";
  targetBeatKey?: string | null;
}): void {
  const sortedChapters = params.volume.chapters
    .slice()
    .sort((left, right) => left.chapterOrder - right.chapterOrder);

  for (const beat of params.beatSheet.beats) {
    if (params.generationMode === "single_beat" && beat.key !== params.targetBeatKey) {
      continue;
    }
    const expectedChapterCount = Math.max(1, getBeatExpectedChapterCount(beat));
    const matchedChapters = sortedChapters.filter((chapter) => resolveVolumeChapterBeatKey({
      chapter,
      volume: params.volume,
      beatSheet: params.beatSheet,
    }) === beat.key);
    if (matchedChapters.length !== expectedChapterCount) {
      throw new Error(`当前卷节奏段「${beat.label}」应有 ${expectedChapterCount} 章，实际只有 ${matchedChapters.length} 章。`);
    }
  }
}

function isMergedVolumeChapterListComplete(params: {
  volume: VolumePlan;
  beatSheet: VolumeBeatSheet;
}): boolean {
  const sortedChapters = params.volume.chapters
    .slice()
    .sort((left, right) => left.chapterOrder - right.chapterOrder);

  return params.beatSheet.beats.every((beat) => {
    const expectedChapterCount = Math.max(1, getBeatExpectedChapterCount(beat));
    const matchedChapterCount = sortedChapters.filter((chapter) => resolveVolumeChapterBeatKey({
      chapter,
      volume: params.volume,
      beatSheet: params.beatSheet,
    }) === beat.key).length;
    return matchedChapterCount === expectedChapterCount;
  });
}

/**
 * Whole-volume chapter-title gate for merged chapter lists.
 *
 * Title quality findings split into three bands:
 * - blocking (duplicate titles, first-person, overlong, synopsis-like titles)
 *   fail at every phase, including intermediate merges;
 * - severe concentration (a single surface frame covering half of the list or
 *   more) fails at the final gate;
 * - marginal concentration (over the frame allowance by at most one title and
 *   still below half of the list) no longer fails generation: the finished
 *   list is accepted and the finding is handed to the caller as quality debt.
 *
 * Concentration is judged only at the final gate because it is a whole-volume
 * property: a partial merge can still be diluted by later beats.
 */
async function enforceMergedChapterTitleGate(params: {
  volume: VolumePlan;
  options: VolumeGenerateOptions;
  phase: "intermediate" | "final";
}): Promise<void> {
  const sortedChapters = params.volume.chapters
    .slice()
    .sort((left, right) => left.chapterOrder - right.chapterOrder);
  const assessment = assessChapterTitleDiversity(sortedChapters.map((chapter) => chapter.title));
  if (!assessment) {
    return;
  }
  if (assessment.severity === "blocking") {
    throw new Error(assessment.issue);
  }
  if (params.phase === "intermediate") {
    return;
  }
  if (assessment.severity === "severe") {
    throw new Error(assessment.issue);
  }
  const offendingTitles = new Set(assessment.offendingTitles);
  const firstOffendingChapter = sortedChapters.find((chapter) => offendingTitles.has(chapter.title));
  await params.options.onChapterTitleDiversityDebt?.({
    volumeId: params.volume.id,
    issue: assessment.issue,
    chapterOrder: firstOffendingChapter?.chapterOrder ?? sortedChapters[0]?.chapterOrder ?? 1,
  });
}

async function generateBeatChapterBlock(params: {
  document: VolumePlanDocument;
  workspace: VolumeWorkspace;
  novel: VolumeGenerationNovel;
  storyMacroPlan: StoryMacroPlanResult;
  options: VolumeGenerateOptions;
  targetVolume: VolumePlan;
  targetBeatSheet: VolumeBeatSheet;
  beatPlan: BeatGenerationPlan;
  previousBeat?: VolumeBeat | null;
  nextBeat?: VolumeBeat | null;
  previousBeatChapterSummary?: string | null;
  preservedBeatChapterSummary?: string | null;
  chapterBudgets: number[];
}): Promise<GeneratedVolumeChapterBlock> {
  const targetIndex = params.document.volumes.findIndex((volume) => volume.id === params.targetVolume.id);
  const promptInput = {
    novel: params.novel,
    workspace: params.workspace,
    storyMacroPlan: params.storyMacroPlan,
    strategyPlan: params.document.strategyPlan,
    targetVolume: params.targetVolume,
    targetBeatSheet: params.targetBeatSheet,
    targetBeat: params.beatPlan.beat,
    previousBeat: params.previousBeat,
    nextBeat: params.nextBeat,
    previousVolume: targetIndex > 0 ? params.document.volumes[targetIndex - 1] : undefined,
    nextVolume: targetIndex >= 0 && targetIndex < params.document.volumes.length - 1
      ? params.document.volumes[targetIndex + 1]
      : undefined,
    guidance: params.options.guidance,
    targetBeatChapterCount: params.beatPlan.chapterCount,
    targetChapterStartOrder: params.beatPlan.chapterStartOrder,
    targetChapterEndOrder: params.beatPlan.chapterEndOrder,
    nextAvailableChapterOrder: params.beatPlan.chapterStartOrder,
    previousBeatChapterSummary: params.previousBeatChapterSummary,
    preservedBeatChapterSummary: params.preservedBeatChapterSummary,
  };

  const generated = await runStructuredPrompt({
    asset: createVolumeChapterListPrompt({
      targetChapterCount: params.beatPlan.chapterCount,
      targetBeatKey: params.beatPlan.beat.key,
      targetBeatLabel: params.beatPlan.beat.label,
      isBookFinale: isCompactBookFinaleBeat({
        completionProfile: params.novel.completionProfile,
        targetVolumeIndex: targetIndex,
        chapterBudgets: params.chapterBudgets,
        beatChapterEndOrder: params.beatPlan.chapterEndOrder,
      }),
      reservedChapterTitles: params.targetVolume.chapters
        .filter((chapter) => chapter.beatKey !== params.beatPlan.beat.key)
        .map((chapter) => chapter.title),
      characterIds: params.options.entrypoint === "director_next" ? params.novel.characters.map(character => {
        if (!character.id) throw new Error("角色出场初排缺少角色 ID。");
        return character.id;
      }) : undefined,
    }),
    promptInput,
    contextBlocks: buildVolumeChapterListContextBlocks(promptInput),
    options: {
      provider: params.options.provider,
      model: params.options.model,
      temperature: params.options.temperature ?? 0.35,
      maxTokens: Math.min(params.options.entrypoint === "director_next" ? 6_400 : 4_800,
        900 + params.beatPlan.chapterCount * (params.options.entrypoint === "director_next" ? 380 : 260)),
      novelId: params.document.novelId,
      volumeId: params.targetVolume.id,
      taskId: params.options.taskId,
      stage: "structured_outline",
      itemKey: "chapter_list",
      scope: "chapter_list",
      entrypoint: params.options.entrypoint,
      signal: params.options.signal,
    },
  });

  return generated.output;
}

export async function generateBeatChunkedChapterList(params: {
  document: VolumePlanDocument;
  novel: VolumeGenerationNovel;
  workspace: VolumeWorkspace;
  storyMacroPlan: StoryMacroPlanResult;
  options: VolumeGenerateOptions;
  notifyPhase: (label: string, chapterProgress?: VolumeChapterListProgress) => Promise<void>;
  notifyIntermediateDocument?: (event: VolumeIntermediateDocumentEvent) => void | Promise<void>;
}): Promise<{
  mergedDocument: VolumePlanDocument;
  mergedWorkspace: VolumeWorkspace;
}> {
  const { document, workspace, storyMacroPlan, options } = params;
  const generationMode = options.generationMode ?? "full_volume";
  const explicitChapterCount = normalizeExplicitChapterCount(options.estimatedChapterCount);
  const novel: VolumeGenerationNovel = explicitChapterCount
    ? {
      ...params.novel,
      estimatedChapterCount: explicitChapterCount,
      completionProfile: buildDirectorCompletionProfile(explicitChapterCount),
    }
    : params.novel;
  const targetVolume = getTargetVolume(document, options.targetVolumeId);
  const savedTargetBeatSheet = getBeatSheet(document, targetVolume.id);
  logMemoryUsage({
    event: "start",
    component: "generateBeatChunkedChapterList",
    taskId: options.taskId,
    novelId: document.novelId,
    stage: "structured_outline",
    itemKey: "chapter_list",
    scope: options.generationMode ?? "full_volume",
    entrypoint: options.entrypoint,
    volumeId: targetVolume.id,
    volumeCount: document.volumes.length,
    chapterCount: document.volumes.reduce((sum, volume) => sum + volume.chapters.length, 0),
    beatSheetCount: document.beatSheets.length,
  });
  if (!savedTargetBeatSheet) {
    throw new Error("当前卷还没有节奏板，不能直接拆章节列表。");
  }

  const chapterBudget = deriveChapterBudget({ novel, workspace, options });
  const chapterBudgets = allocateChapterBudgets({
    volumeCount: Math.max(document.volumes.length, 1),
    chapterBudget,
    existingVolumes: document.volumes,
  });
  const targetIndex = document.volumes.findIndex((volume) => volume.id === targetVolume.id);
  // A saved partial list carries the effective beat spans used by its completed prefix.
  // Chapter counts here describe progress; reweighting them would invalidate that prefix.
  const resumeChapterCount = generationMode === "full_volume"
    && isVolumeChapterListPartiallyPersisted(targetVolume) && targetVolume.chapters.length > 0
    ? inferRequiredChapterCountFromBeatSheet(savedTargetBeatSheet) : 0;
  const explicitVolumeChapterCount = resumeChapterCount || (explicitChapterCount && generationMode === "full_volume"
    ? Math.max(1, chapterBudgets[targetIndex] ?? explicitChapterCount) : null);
  if (resumeChapterCount) chapterBudgets[targetIndex] = resumeChapterCount;
  const targetBeatSheet = explicitVolumeChapterCount && !resumeChapterCount
    ? scaleBeatSheetToChapterCount(savedTargetBeatSheet, explicitVolumeChapterCount)
    : savedTargetBeatSheet;
  const chapterListDocument = {
    ...document,
    beatSheets: document.beatSheets.map(sheet => sheet.volumeId === targetVolume.id ? targetBeatSheet : sheet),
  };
  const beatSheetRequiredChapterCount = inferRequiredChapterCountFromBeatSheet(targetBeatSheet);
  // 正在生成的卷当前章数是进度而非计划规模，其预算不得低于均分份额（issue #173）。
  const fallbackTargetChapterCount = Math.max(
    chapterBudgets[targetIndex] ?? 0,
    resolveEvenShareChapterBudget(chapterBudget, document.volumes.length),
  );
  // Legacy or partially generated workspaces may only carry a few seed chapters for the opening beat.
  // Those placeholders should not shrink the trusted chapter budget below the planned volume size.
  const budgetedTargetChapterCount = explicitVolumeChapterCount
    ?? Math.max(targetVolume.chapters.length, fallbackTargetChapterCount);
  const resolvedTargetChapterCount = explicitVolumeChapterCount
    ? {
      targetChapterCount: explicitVolumeChapterCount,
      beatSheetCountAccepted: true,
      maxTrustedChapterCount: explicitVolumeChapterCount,
    }
    : resolveTargetChapterCount({
      budgetedChapterCount: budgetedTargetChapterCount,
      beatSheetRequiredChapterCount,
    });
  if (!resolvedTargetChapterCount.beatSheetCountAccepted && beatSheetRequiredChapterCount > 0) {
    throw new Error("当前卷节奏板的章节跨度异常，建议先重生成节奏板，再继续生成章节标题。");
  }
  if (resolvedTargetChapterCount.targetChapterCount >= 20) {
    const beatSheetCoverage = validateBeatSheetChapterCoverage({
      beatSheet: targetBeatSheet,
      targetChapterCount: resolvedTargetChapterCount.targetChapterCount,
    });
    if (!beatSheetCoverage.accepted) {
      throw new Error(`${beatSheetCoverage.message ?? "当前卷节奏板章节跨度没有覆盖目标章数。"}建议先重生成节奏板，再继续生成章节标题。`);
    }
  }

  const beatPlans = buildBeatGenerationPlans(targetBeatSheet);
  const existingBeatBlocks = buildExistingBeatBlocks({
    volume: targetVolume,
    beatSheet: targetBeatSheet,
  });
  const fullVolumeResumeState = generationMode === "full_volume"
    ? resolveFullVolumeResumeState({
      beatPlans,
      existingBeatBlocks,
    })
    : null;
  const targetBeatIndex = generationMode === "single_beat"
    ? beatPlans.findIndex((plan) => plan.beat.key === options.targetBeatKey)
    : -1;
  if (generationMode === "single_beat" && targetBeatIndex < 0) {
    throw new Error("目标节奏段不存在，无法重生章节标题。");
  }

  const generatedBlocks: GeneratedVolumeChapterBlock[] = [];
  const plansToRun = generationMode === "single_beat"
    ? [beatPlans[targetBeatIndex]]
    : beatPlans.slice(fullVolumeResumeState?.resumeBeatIndex ?? 0);

  if (
    generationMode === "full_volume"
    && fullVolumeResumeState?.isAlreadyComplete
    && !isVolumeChapterListPartiallyPersisted(targetVolume)
  ) {
    return {
      mergedDocument: document,
      mergedWorkspace: {
        ...workspace,
        ...document,
      },
    };
  }

  const totalChapters = generationMode === "single_beat"
    ? plansToRun[0].chapterCount
    : beatPlans.reduce((sum, plan) => sum + plan.chapterCount, 0);
  let completedChapters = generationMode === "single_beat"
    ? 0
    : (fullVolumeResumeState?.preservedBeatBlocks ?? []).reduce((sum, block) => sum + block.chapters.length, 0);
  const notifyChapterProgress = async (label: string) => params.notifyPhase(label, {
    volumeId: targetVolume.id, completedChapters, totalChapters, label,
  });
  for (const beatPlan of plansToRun) {
    await notifyChapterProgress(
      generationMode === "single_beat"
        ? `正在重写第 ${targetVolume.sortOrder} 卷节奏段：${beatPlan.beat.label}`
        : `正在生成第 ${targetVolume.sortOrder} 卷节奏段：${beatPlan.beat.label}`,
    );

    const currentBeatIndex = beatPlans.findIndex((plan) => plan.beat.key === beatPlan.beat.key);
    const generatedBlock = await generateBeatChapterBlock({
      document,
      workspace,
      novel,
      storyMacroPlan,
      options,
      targetVolume,
      targetBeatSheet,
      beatPlan,
      previousBeat: currentBeatIndex > 0 ? beatPlans[currentBeatIndex - 1]?.beat ?? null : null,
      nextBeat: currentBeatIndex < beatPlans.length - 1 ? beatPlans[currentBeatIndex + 1]?.beat ?? null : null,
      previousBeatChapterSummary: buildPreviousBeatSummary({
        generationMode,
        generatedBlocks,
        existingBeatBlocks,
        preservedBeatBlocks: fullVolumeResumeState?.preservedBeatBlocks,
        targetBeatIndex: currentBeatIndex,
      }),
      preservedBeatChapterSummary: generationMode === "single_beat"
        ? buildPreservedBeatSummary({
          existingBeatBlocks,
          targetBeatIndex: currentBeatIndex,
        })
        : null,
      chapterBudgets,
    });
    generatedBlocks.push(generatedBlock);

    const intermediateDocument = mergeChapterList(
      chapterListDocument,
      targetVolume.id,
      targetBeatSheet,
      generatedBlocks,
      {
        generationMode,
        targetBeatKey: options.targetBeatKey,
        resumeFromBeatKey: fullVolumeResumeState?.resumeBeatKey,
        markAsPartial: true,
      },
    );
    const intermediateVolume = intermediateDocument.volumes.find((volume) => volume.id === targetVolume.id);
    if (!intermediateVolume) {
      throw new Error("当前卷章节列表已生成，但中间合并结果丢失了目标卷。");
    }
    await enforceMergedChapterTitleGate({
      volume: intermediateVolume,
      options,
      phase: "intermediate",
    });
    completedChapters += generatedBlock.chapters.length;
    await notifyChapterProgress(`第 ${targetVolume.sortOrder} 卷拆章：${completedChapters}/${totalChapters} 章，已完成「${beatPlan.beat.label}」`);
    await params.notifyIntermediateDocument?.({
      scope: "chapter_list",
      document: intermediateDocument,
      isFinal: false,
      targetVolumeId: targetVolume.id,
      targetBeatKey: beatPlan.beat.key,
      generationMode,
    });
  }

  logMemoryUsage({
    event: "before_merge",
    component: "mergeChapterList",
    taskId: options.taskId,
    novelId: document.novelId,
    stage: "structured_outline",
    itemKey: "chapter_list",
    scope: generationMode,
    entrypoint: options.entrypoint,
    volumeId: targetVolume.id,
    chapterCount: generatedBlocks.reduce((sum, block) => sum + block.chapters.length, 0),
  });
  const rawMergedDocument = generatedBlocks.length > 0
    ? mergeChapterList(
      chapterListDocument,
      targetVolume.id,
      targetBeatSheet,
      generatedBlocks,
      {
        generationMode,
        targetBeatKey: options.targetBeatKey,
        resumeFromBeatKey: fullVolumeResumeState?.resumeBeatKey,
        markAsPartial: false,
      },
    )
    : setVolumeChapterListPartialStatus(chapterListDocument, targetVolume.id, false);
  const rawMergedVolume = rawMergedDocument.volumes.find((volume) => volume.id === targetVolume.id);
  if (!rawMergedVolume) {
    throw new Error("当前卷章节列表已生成，但合并结果丢失了目标卷。");
  }
  await enforceMergedChapterTitleGate({
    volume: rawMergedVolume,
    options,
    phase: "final",
  });
  assertMergedVolumeChapterList({
    volume: rawMergedVolume,
    beatSheet: targetBeatSheet,
    generationMode,
    targetBeatKey: options.targetBeatKey,
  });
  const mergedDocument = isMergedVolumeChapterListComplete({
    volume: rawMergedVolume,
    beatSheet: targetBeatSheet,
  })
    ? setVolumeChapterListPartialStatus(rawMergedDocument, targetVolume.id, false)
    : setVolumeChapterListPartialStatus(rawMergedDocument, targetVolume.id, true);
  const mergedVolume = mergedDocument.volumes.find((volume) => volume.id === targetVolume.id);
  if (!mergedVolume) {
    throw new Error("当前卷章节列表已生成，但合并结果丢失了目标卷。");
  }
  logMemoryUsage({
    event: "after_merge",
    component: "mergeChapterList",
    taskId: options.taskId,
    novelId: document.novelId,
    stage: "structured_outline",
    itemKey: "chapter_list",
    scope: generationMode,
    entrypoint: options.entrypoint,
    volumeId: targetVolume.id,
    volumeCount: mergedDocument.volumes.length,
    chapterCount: mergedDocument.volumes.reduce((sum, volume) => sum + volume.chapters.length, 0),
    beatSheetCount: mergedDocument.beatSheets.length,
  });
  await params.notifyIntermediateDocument?.({
    scope: "chapter_list",
    document: mergedDocument,
    isFinal: true,
    targetVolumeId: targetVolume.id,
    targetBeatKey: generatedBlocks[generatedBlocks.length - 1]?.beatKey,
    generationMode,
  });

  return {
    mergedDocument,
    mergedWorkspace: {
      ...workspace,
      ...mergedDocument,
    },
  };
}
