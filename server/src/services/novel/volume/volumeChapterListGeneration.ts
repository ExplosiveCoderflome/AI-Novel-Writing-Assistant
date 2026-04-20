import type {
  VolumeBeat,
  VolumeBeatSheet,
  VolumePlan,
  VolumePlanDocument,
} from "@ai-novel/shared/types/novel";
import type { StoryMacroPlan } from "@ai-novel/shared/types/storyMacro";
import { runStructuredPrompt } from "../../../prompting/core/promptRunner";
import { createVolumeChapterListPrompt } from "../../../prompting/prompts/novel/volume/chapterList.prompts";
import { buildVolumeChapterListContextBlocks } from "../../../prompting/prompts/novel/volume/contextBlocks";
import {
  inferRequiredChapterCountFromBeatSheet,
  resolveTargetChapterCount,
} from "./volumeBeatSheetChapterBudget";
import {
  allocateChapterBudgets,
  deriveChapterBudget,
  GeneratedVolumeChapterBlock,
  getBeatExpectedChapterCount,
  getBeatSheet,
  getTargetVolume,
  mergeChapterList,
  resolveVolumeChapterBeatKey,
} from "./volumeGenerationHelpers";
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
  targetBeatKey: string;
}): string {
  return summarizeBeatBlocks(
    params.existingBeatBlocks.filter((block) => block.beatKey !== params.targetBeatKey && block.chapters.length > 0),
  );
}

function assertMergedVolumeChapterList(params: {
  volume: VolumePlan;
  beatSheet: VolumeBeatSheet;
}): void {
  const sortedChapters = params.volume.chapters
    .slice()
    .sort((left, right) => left.chapterOrder - right.chapterOrder);

  for (const beat of params.beatSheet.beats) {
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
    }),
    promptInput,
    contextBlocks: buildVolumeChapterListContextBlocks(promptInput),
    options: {
      provider: params.options.provider,
      model: params.options.model,
      temperature: params.options.temperature ?? 0.35,
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
  notifyPhase: (label: string) => Promise<void>;
  notifyIntermediateDocument?: (event: VolumeIntermediateDocumentEvent) => void | Promise<void>;
}): Promise<{
  mergedDocument: VolumePlanDocument;
  mergedWorkspace: VolumeWorkspace;
}> {
  const { document, novel, workspace, storyMacroPlan, options } = params;
  const targetVolume = getTargetVolume(document, options.targetVolumeId);
  const targetBeatSheet = getBeatSheet(document, targetVolume.id);
  if (!targetBeatSheet) {
    throw new Error("当前卷还没有节奏板，不能直接拆章节列表。");
  }

  const chapterBudget = deriveChapterBudget({ novel, workspace, options });
  const chapterBudgets = allocateChapterBudgets({
    volumeCount: Math.max(document.volumes.length, 1),
    chapterBudget,
    existingVolumes: document.volumes,
  });
  const targetIndex = document.volumes.findIndex((volume) => volume.id === targetVolume.id);
  const beatSheetRequiredChapterCount = inferRequiredChapterCountFromBeatSheet(targetBeatSheet);
  const budgetedTargetChapterCount = targetVolume.chapters.length >= 3
    ? targetVolume.chapters.length
    : chapterBudgets[targetIndex] ?? Math.max(3, Math.round(chapterBudget / Math.max(document.volumes.length, 1)));
  const resolvedTargetChapterCount = resolveTargetChapterCount({
    budgetedChapterCount: budgetedTargetChapterCount,
    beatSheetRequiredChapterCount,
  });
  if (!resolvedTargetChapterCount.beatSheetCountAccepted && beatSheetRequiredChapterCount > 0) {
    throw new Error("当前卷节奏板的章节跨度异常，建议先重生成节奏板，再继续生成章节标题。");
  }

  const generationMode = options.generationMode ?? "full_volume";
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

  if (generationMode === "full_volume" && fullVolumeResumeState?.isAlreadyComplete) {
    return {
      mergedDocument: document,
      mergedWorkspace: {
        ...workspace,
        ...document,
      },
    };
  }

  for (const beatPlan of plansToRun) {
    await params.notifyPhase(
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
          targetBeatKey: beatPlan.beat.key,
        })
        : null,
    });
    generatedBlocks.push(generatedBlock);

    if (params.notifyIntermediateDocument) {
      const partialDocument = mergeChapterList(
        document,
        targetVolume.id,
        targetBeatSheet,
        generatedBlocks,
        {
          generationMode,
          targetBeatKey: options.targetBeatKey,
          resumeFromBeatKey: fullVolumeResumeState?.resumeBeatKey,
        },
      );
      await params.notifyIntermediateDocument({
        scope: "chapter_list",
        document: partialDocument,
        isFinal: false,
        targetVolumeId: targetVolume.id,
        targetBeatKey: beatPlan.beat.key,
        generationMode,
      });
    }
  }

  const mergedDocument = mergeChapterList(
    document,
    targetVolume.id,
    targetBeatSheet,
    generatedBlocks,
    {
      generationMode,
      targetBeatKey: options.targetBeatKey,
      resumeFromBeatKey: fullVolumeResumeState?.resumeBeatKey,
    },
  );
  const mergedVolume = mergedDocument.volumes.find((volume) => volume.id === targetVolume.id);
  if (!mergedVolume) {
    throw new Error("当前卷章节列表已生成，但合并结果丢失了目标卷。");
  }
  assertMergedVolumeChapterList({
    volume: mergedVolume,
    beatSheet: targetBeatSheet,
  });

  return {
    mergedDocument,
    mergedWorkspace: {
      ...workspace,
      ...mergedDocument,
    },
  };
}
