import type { VolumePlanDocument } from "@ai-novel/shared/types/novel";
import { runStructuredPrompt } from "../../../prompting/core/promptRunner";
import { volumeBeatSheetPrompt } from "../../../prompting/prompts/novel/volume/beatSheet.prompts";
import { buildVolumeBeatSheetContextBlocks } from "../../../prompting/prompts/novel/volume/contextBlocks";
import type { StoryMacroPlanService } from "../storyMacro/StoryMacroPlanService";
import {
  allocateChapterBudgets,
  deriveChapterBudget,
} from "./volumeChapterBudgetAllocation";
import {
  getTargetVolume,
  mergeBeatSheet,
} from "./volumeGenerationHelpers";
import type {
  VolumeGenerateOptions,
  VolumeGenerationPhase,
  VolumeGenerationNovel,
  VolumeWorkspace,
} from "./volumeModels";

type StoryMacroPlanResult = Awaited<ReturnType<StoryMacroPlanService["getPlan"]>> | null;

export function resolveBeatSheetTargetChapterCount(input: {
  targetVolumeChapterCount: number;
  targetVolumeIndex: number;
  volumeCount: number;
  chapterBudget: number;
  chapterBudgets: number[];
}): number {
  const fallbackTargetChapterCount = input.chapterBudgets[input.targetVolumeIndex]
    ?? Math.max(3, Math.round(input.chapterBudget / Math.max(input.volumeCount, 1)));
  return Math.max(input.targetVolumeChapterCount, fallbackTargetChapterCount);
}

export async function generateBeatSheet(params: {
  document: VolumePlanDocument;
  novel: VolumeGenerationNovel;
  workspace: VolumeWorkspace;
  storyMacroPlan: StoryMacroPlanResult;
  options: VolumeGenerateOptions;
  notifyVolumeGenerationPhase: (input: {
    novelId: string;
    scope: "beat_sheet";
    phase: VolumeGenerationPhase;
    label: string;
    options: VolumeGenerateOptions;
  }) => Promise<void>;
}): Promise<VolumePlanDocument> {
  const { document, novel, workspace, storyMacroPlan, options } = params;
  const targetVolume = getTargetVolume(document, options.targetVolumeId);
  const chapterBudget = deriveChapterBudget({ novel, workspace, options });
  const chapterBudgets = allocateChapterBudgets({
    volumeCount: Math.max(document.volumes.length, 1),
    chapterBudget,
    existingVolumes: document.volumes,
  });
  const targetIndex = document.volumes.findIndex((volume) => volume.id === targetVolume.id);
  const targetChapterCount = resolveBeatSheetTargetChapterCount({
    targetVolumeChapterCount: targetVolume.chapters.length,
    targetVolumeIndex: targetIndex,
    volumeCount: document.volumes.length,
    chapterBudget,
    chapterBudgets,
  });
  await params.notifyVolumeGenerationPhase({
    novelId: document.novelId,
    scope: "beat_sheet",
    phase: "prompt",
    label: `正在生成第 ${targetVolume.sortOrder} 卷节奏板`,
    options,
  });
  const promptInput = {
    novel,
    workspace,
    storyMacroPlan,
    strategyPlan: document.strategyPlan,
    targetVolume,
    targetChapterCount,
    guidance: options.guidance,
  };
  const generated = await runStructuredPrompt({
    asset: volumeBeatSheetPrompt,
    promptInput,
    contextBlocks: buildVolumeBeatSheetContextBlocks(promptInput),
    options: {
      provider: options.provider,
      model: options.model,
      temperature: options.temperature ?? 0.35,
      novelId: document.novelId,
      volumeId: targetVolume.id,
      taskId: options.taskId,
      stage: "structured_outline",
      itemKey: "beat_sheet",
      scope: "beat_sheet",
      entrypoint: options.entrypoint,
      signal: options.signal,
    },
  });
  return mergeBeatSheet(document, targetVolume, generated.output.beats);
}
