import { createContextBlock } from "../../../core/contextBudget";
import type { PromptContextBlock } from "../../../core/promptTypes";
import {
  buildBeatCard,
  buildBeatChapterRangeContext,
  buildBeatChapterSummary,
  buildBeatContextWindow,
  buildBeatSheetContext,
  buildChapterDetailDraft,
  buildRecentChapterExecutionContext,
  buildChapterNeighborContext,
  buildCommonNovelContext,
  buildCompactVolumeCard,
  buildVolumeCountGuidanceContext,
  buildSoftFutureVolumeSummary,
  buildStoryMacroContext,
  buildStrategyContext,
  buildWindowedVolumeContext,
  type VolumeBeatSheetPromptInput,
  type VolumeChapterDetailPromptInput,
  type VolumeChapterListPromptInput,
  type VolumeRebalancePromptInput,
  type VolumeSkeletonPromptInput,
  type VolumeStrategyCritiquePromptInput,
  type VolumeStrategyPromptInput,
} from "./shared";

function guidanceBlock(guidance?: string): PromptContextBlock | null {
  if (!guidance?.trim()) {
    return null;
  }
  return createContextBlock({
    id: "guidance",
    group: "guidance",
    priority: 70,
    content: `User guidance:\n${guidance.trim()}`,
  });
}

export function buildVolumeStrategyContextBlocks(input: VolumeStrategyPromptInput): PromptContextBlock[] {
  return [
    createContextBlock({
      id: "book_contract",
      group: "book_contract",
      priority: 100,
      required: true,
      content: `Novel contract:\n${buildCommonNovelContext(input.novel)}`,
    }),
    createContextBlock({
      id: "macro_constraints",
      group: "macro_constraints",
      priority: 92,
      content: `Story macro:\n${buildStoryMacroContext(input.storyMacroPlan)}`,
    }),
    createContextBlock({
      id: "existing_volume_window",
      group: "existing_volume_window",
      priority: 88,
      content: `Existing volume window:\n${buildWindowedVolumeContext(input.workspace.volumes)}`,
    }),
    createContextBlock({
      id: "volume_count_guidance",
      group: "volume_count_guidance",
      priority: 96,
      required: true,
      content: `Volume count guidance:\n${buildVolumeCountGuidanceContext(input.volumeCountGuidance)}`,
    }),
    guidanceBlock(input.guidance),
  ].filter((block): block is PromptContextBlock => Boolean(block));
}

export function buildVolumeStrategyCritiqueContextBlocks(input: VolumeStrategyCritiquePromptInput): PromptContextBlock[] {
  return [
    createContextBlock({
      id: "book_contract",
      group: "book_contract",
      priority: 100,
      required: true,
      content: `Novel contract:\n${buildCommonNovelContext(input.novel)}`,
    }),
    createContextBlock({
      id: "macro_constraints",
      group: "macro_constraints",
      priority: 92,
      content: `Story macro:\n${buildStoryMacroContext(input.storyMacroPlan)}`,
    }),
    createContextBlock({
      id: "strategy_context",
      group: "strategy_context",
      priority: 98,
      required: true,
      content: `Strategy plan:\n${buildStrategyContext(input.strategyPlan)}`,
    }),
    createContextBlock({
      id: "existing_volume_window",
      group: "existing_volume_window",
      priority: 84,
      content: `Existing volume window:\n${buildWindowedVolumeContext(input.workspace.volumes)}`,
    }),
    guidanceBlock(input.guidance),
  ].filter((block): block is PromptContextBlock => Boolean(block));
}

export function buildVolumeSkeletonContextBlocks(input: VolumeSkeletonPromptInput): PromptContextBlock[] {
  return [
    createContextBlock({
      id: "book_contract",
      group: "book_contract",
      priority: 100,
      required: true,
      content: `Novel contract:\n${buildCommonNovelContext(input.novel)}`,
    }),
    createContextBlock({
      id: "macro_constraints",
      group: "macro_constraints",
      priority: 92,
      content: `Story macro:\n${buildStoryMacroContext(input.storyMacroPlan)}`,
    }),
    createContextBlock({
      id: "strategy_context",
      group: "strategy_context",
      priority: 98,
      required: true,
      content: `Strategy plan:\n${buildStrategyContext(input.strategyPlan)}`,
    }),
    createContextBlock({
      id: "existing_volume_window",
      group: "existing_volume_window",
      priority: 84,
      content: `Existing volume window:\n${buildWindowedVolumeContext(input.workspace.volumes)}`,
    }),
    createContextBlock({
      id: "volume_count_guidance",
      group: "volume_count_guidance",
      priority: 96,
      required: true,
      content: `Volume count guidance:\n${buildVolumeCountGuidanceContext(input.volumeCountGuidance)}`,
    }),
    createContextBlock({
      id: "chapter_budget",
      group: "chapter_budget",
      priority: 94,
      required: true,
      content: `Chapter budget: ${input.chapterBudget}`,
    }),
    guidanceBlock(input.guidance),
  ].filter((block): block is PromptContextBlock => Boolean(block));
}

export function buildVolumeBeatSheetContextBlocks(input: VolumeBeatSheetPromptInput): PromptContextBlock[] {
  return [
    createContextBlock({
      id: "book_contract",
      group: "book_contract",
      priority: 100,
      required: true,
      content: `Novel contract:\n${buildCommonNovelContext(input.novel)}`,
    }),
    createContextBlock({
      id: "macro_constraints",
      group: "macro_constraints",
      priority: 92,
      content: `Story macro:\n${buildStoryMacroContext(input.storyMacroPlan)}`,
    }),
    createContextBlock({
      id: "strategy_context",
      group: "strategy_context",
      priority: 94,
      content: `Strategy plan:\n${buildStrategyContext(input.strategyPlan)}`,
    }),
    createContextBlock({
      id: "target_volume",
      group: "target_volume",
      priority: 100,
      required: true,
      content: `Target volume:\n${buildCompactVolumeCard(input.targetVolume)}`,
    }),
    createContextBlock({
      id: "target_chapter_count",
      group: "target_chapter_count",
      priority: 96,
      required: true,
      content: `Target chapter count: ${input.targetChapterCount}`,
    }),
    createContextBlock({
      id: "volume_window",
      group: "volume_window",
      priority: 88,
      content: `Adjacent volume window:\n${buildWindowedVolumeContext(input.workspace.volumes, input.targetVolume.id)}`,
    }),
    createContextBlock({
      id: "soft_future_summary",
      group: "soft_future_summary",
      priority: 74,
      content: `Future soft summary:\n${buildSoftFutureVolumeSummary(input.workspace.volumes, input.targetVolume.id)}`,
    }),
    guidanceBlock(input.guidance),
  ].filter((block): block is PromptContextBlock => Boolean(block));
}

export function buildVolumeChapterListContextBlocks(input: VolumeChapterListPromptInput): PromptContextBlock[] {
  return [
    createContextBlock({
      id: "book_contract",
      group: "book_contract",
      priority: 100,
      required: true,
      content: `Novel contract:\n${buildCommonNovelContext(input.novel)}`,
    }),
    createContextBlock({
      id: "macro_constraints",
      group: "macro_constraints",
      priority: 92,
      content: `Story macro:\n${buildStoryMacroContext(input.storyMacroPlan)}`,
    }),
    createContextBlock({
      id: "strategy_context",
      group: "strategy_context",
      priority: 94,
      content: `Strategy plan:\n${buildStrategyContext(input.strategyPlan)}`,
    }),
    createContextBlock({
      id: "target_volume",
      group: "target_volume",
      priority: 100,
      required: true,
      content: `Target volume:\n${buildCompactVolumeCard(input.targetVolume)}`,
    }),
    createContextBlock({
      id: "target_beat_contract",
      group: "target_beat_contract",
      priority: 98,
      required: true,
      content: [
        `Target beat:\n${buildBeatCard(input.targetBeat)}`,
        `Beat chapter contract:\n${buildBeatChapterRangeContext({
          targetBeat: input.targetBeat,
          targetBeatChapterCount: input.targetBeatChapterCount,
          targetChapterStartOrder: input.targetChapterStartOrder,
          targetChapterEndOrder: input.targetChapterEndOrder,
          nextAvailableChapterOrder: input.nextAvailableChapterOrder,
        })}`,
      ].join("\n\n"),
    }),
    createContextBlock({
      id: "beat_context_window",
      group: "beat_context_window",
      priority: 90,
      content: `Adjacent beat window:\n${buildBeatContextWindow({
        previousBeat: input.previousBeat,
        nextBeat: input.nextBeat,
      })}`,
    }),
    createContextBlock({
      id: "adjacent_volumes",
      group: "adjacent_volumes",
      priority: 88,
      content: [
        input.previousVolume ? `Previous volume:\n${buildCompactVolumeCard(input.previousVolume)}` : "",
        input.nextVolume ? `Next volume:\n${buildCompactVolumeCard(input.nextVolume)}` : "",
      ].filter(Boolean).join("\n\n") || "Adjacent volumes: none",
    }),
    createContextBlock({
      id: "previous_beat_chapters",
      group: "previous_beat_chapters",
      priority: 86,
      content: `Previous generated beat summary:\n${buildBeatChapterSummary(input.previousBeatChapterSummary)}`,
    }),
    createContextBlock({
      id: "preserved_beat_chapters",
      group: "preserved_beat_chapters",
      priority: 84,
      content: `Locked existing beat summary:\n${buildBeatChapterSummary(input.preservedBeatChapterSummary)}`,
    }),
    createContextBlock({
      id: "soft_future_summary",
      group: "soft_future_summary",
      priority: 74,
      content: `Future soft summary:\n${buildSoftFutureVolumeSummary(input.workspace.volumes, input.targetVolume.id)}`,
    }),
    guidanceBlock(input.guidance),
  ].filter((block): block is PromptContextBlock => Boolean(block));
}

export function buildVolumeChapterDetailContextBlocks(input: VolumeChapterDetailPromptInput): PromptContextBlock[] {
  return [
    createContextBlock({
      id: "book_contract",
      group: "book_contract",
      priority: 100,
      required: true,
      content: `Novel contract:\n${buildCommonNovelContext(input.novel)}`,
    }),
    createContextBlock({
      id: "macro_constraints",
      group: "macro_constraints",
      priority: 92,
      content: `Story macro:\n${buildStoryMacroContext(input.storyMacroPlan)}`,
    }),
    createContextBlock({
      id: "target_volume",
      group: "target_volume",
      priority: 100,
      required: true,
      content: `Target volume:\n${buildCompactVolumeCard(input.targetVolume)}`,
    }),
    createContextBlock({
      id: "target_beat_sheet",
      group: "target_beat_sheet",
      priority: 96,
      content: `Target beat sheet:\n${buildBeatSheetContext(input.targetBeatSheet)}`,
    }),
    createContextBlock({
      id: "chapter_neighbors",
      group: "chapter_neighbors",
      priority: 98,
      required: true,
      content: `Chapter neighbors:\n${buildChapterNeighborContext(input.targetVolume, input.targetChapter.id)}`,
    }),
    createContextBlock({
      id: "recent_execution_contracts",
      group: "recent_execution_contracts",
      priority: 97,
      content: `Recent execution contracts:\n${buildRecentChapterExecutionContext(input.targetVolume, input.targetChapter.id)}`,
    }),
    createContextBlock({
      id: "chapter_detail_draft",
      group: "chapter_detail_draft",
      priority: 96,
      required: true,
      content: `Existing draft:\n${buildChapterDetailDraft(input.targetChapter, input.detailMode)}`,
    }),
    createContextBlock({
      id: "volume_window",
      group: "volume_window",
      priority: 82,
      content: `Adjacent volume window:\n${buildWindowedVolumeContext(input.workspace.volumes, input.targetVolume.id)}`,
    }),
    guidanceBlock(input.guidance),
  ].filter((block): block is PromptContextBlock => Boolean(block));
}

export function buildVolumeRebalanceContextBlocks(input: VolumeRebalancePromptInput): PromptContextBlock[] {
  return [
    createContextBlock({
      id: "book_contract",
      group: "book_contract",
      priority: 100,
      required: true,
      content: `Novel contract:\n${buildCommonNovelContext(input.novel)}`,
    }),
    createContextBlock({
      id: "macro_constraints",
      group: "macro_constraints",
      priority: 92,
      content: `Story macro:\n${buildStoryMacroContext(input.storyMacroPlan)}`,
    }),
    createContextBlock({
      id: "strategy_context",
      group: "strategy_context",
      priority: 94,
      content: `Strategy plan:\n${buildStrategyContext(input.strategyPlan)}`,
    }),
    createContextBlock({
      id: "anchor_volume",
      group: "anchor_volume",
      priority: 100,
      required: true,
      content: `Anchor volume:\n${buildCompactVolumeCard(input.anchorVolume)}`,
    }),
    createContextBlock({
      id: "adjacent_volumes",
      group: "adjacent_volumes",
      priority: 90,
      content: [
        input.previousVolume ? `Previous volume:\n${buildCompactVolumeCard(input.previousVolume)}` : "",
        input.nextVolume ? `Next volume:\n${buildCompactVolumeCard(input.nextVolume)}` : "",
      ].filter(Boolean).join("\n\n") || "Adjacent volumes: none",
    }),
    createContextBlock({
      id: "volume_window",
      group: "volume_window",
      priority: 84,
      content: `Adjacent volume window:\n${buildWindowedVolumeContext(input.workspace.volumes, input.anchorVolume.id)}`,
    }),
    guidanceBlock(input.guidance),
  ].filter((block): block is PromptContextBlock => Boolean(block));
}
