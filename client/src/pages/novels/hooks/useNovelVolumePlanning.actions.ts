import type {
  VolumeBeatSheet,
  VolumeChapterListGenerationMode,
  VolumeGenerationScopeInput,
  VolumePlan,
  VolumePlanDocument,
} from "@ai-novel/shared/types/novel";
import { findBeatSheet } from "../volumePlan.utils";
import type { ChapterDetailMode } from "../chapterDetailPlanning.shared";

export interface ChapterListGenerationRequest {
  generationMode?: VolumeChapterListGenerationMode;
  targetBeatKey?: string;
}

export interface VolumeGenerationPayload {
  scope: VolumeGenerationScopeInput;
  generationMode?: VolumeChapterListGenerationMode;
  targetVolumeId?: string;
  targetBeatKey?: string;
  targetChapterId?: string;
  detailMode?: ChapterDetailMode;
  draftVolumesOverride?: VolumePlan[];
  suppressSuccessMessage?: boolean;
}

export function startStrategyGenerationAction(params: {
  ensureCharacterGuard: () => boolean;
  userPreferredVolumeCount: number | null;
  forceSystemRecommendedVolumeCount: boolean;
  volumeCountGuidance: {
    systemRecommendedVolumeCount: number;
    allowedVolumeCountRange: { min: number; max: number };
    decisionVolumeCountRange: { min: number; max: number };
    respectedExistingVolumeCount?: number | null;
  };
  hasUnsavedVolumeDraft: boolean;
  generate: (payload: VolumeGenerationPayload) => void;
}): void {
  if (!params.ensureCharacterGuard()) {
    return;
  }
  const confirmed = window.confirm([
    "Volume strategy recommendations will be generated to help determine the number of recommended volumes, the number of hard-planned volumes, and the role of each volume.",
    "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
    params.userPreferredVolumeCount != null
      ? `本次将固定为 ${params.userPreferredVolumeCount} 卷生成分卷策略。`
      : params.forceSystemRecommendedVolumeCount
        ? `本次将按系统建议卷数生成（当前建议 ${params.volumeCountGuidance.systemRecommendedVolumeCount} 卷），不沿用现有草稿卷数。`
        : params.volumeCountGuidance.respectedExistingVolumeCount != null
          ? `本次会优先沿用当前草稿的 ${params.volumeCountGuidance.respectedExistingVolumeCount} 卷结构，同时保持在允许区间 ${params.volumeCountGuidance.allowedVolumeCountRange.min}-${params.volumeCountGuidance.allowedVolumeCountRange.max} 内。`
          : `当前系统建议 ${params.volumeCountGuidance.systemRecommendedVolumeCount} 卷，结构建议区间 ${params.volumeCountGuidance.decisionVolumeCountRange.min}-${params.volumeCountGuidance.decisionVolumeCountRange.max} 卷。`,
    params.hasUnsavedVolumeDraft ? "This time, the unsaved draft of the current page will be used directly as a reference." : "This time suggestions will be generated based on the current workspace status.",
  ].join("\n\n"));
  if (!confirmed) {
    return;
  }
  params.generate({ scope: "strategy" });
}

export function startStrategyCritiqueAction(params: {
  ensureCharacterGuard: () => boolean;
  generate: (payload: VolumeGenerationPayload) => void;
}): void {
  if (!params.ensureCharacterGuard()) {
    return;
  }
  params.generate({ scope: "strategy_critique" });
}

export function startSkeletonGenerationAction(params: {
  ensureCharacterGuard: () => boolean;
  hasUnsavedVolumeDraft: boolean;
  generate: (payload: VolumeGenerationPayload) => void;
}): void {
  if (!params.ensureCharacterGuard()) {
    return;
  }
  const confirmed = window.confirm([
    "A full volume skeleton will be generated or regenerated based on current volume strategy recommendations.",
    "This step will clear the existing rhythm board and adjacent volume rebalancing suggestions, but it will not directly delete the chapter text.",
    params.hasUnsavedVolumeDraft ? "This time, the current page draft will be used directly as the volume skeleton context." : "This time we will continue to advance based on the current volume workspace.",
  ].join("\n\n"));
  if (!confirmed) {
    return;
  }
  params.generate({ scope: "skeleton" });
}

export function startBeatSheetGenerationAction(params: {
  volumeId: string;
  normalizedVolumeDraft: VolumePlan[];
  strategyPlan: object | null;
  beatSheets: VolumeBeatSheet[];
  ensureCharacterGuard: () => boolean;
  setStructuredMessage: (value: string) => void;
  generate: (payload: VolumeGenerationPayload) => void;
}): void {
  const targetVolume = params.normalizedVolumeDraft.find((volume) => volume.id === params.volumeId);
  if (!targetVolume) {
    params.setStructuredMessage("The current volume does not exist and the rhythm board cannot be generated.");
    return;
  }
  if (!params.strategyPlan) {
    params.setStructuredMessage("Please generate volume strategy suggestions first, then generate the current volume rhythm board.");
    return;
  }
  if (!params.ensureCharacterGuard()) {
    return;
  }
  const existingBeatSheet = findBeatSheet(params.beatSheets, params.volumeId);
  if (existingBeatSheet) {
    const confirmed = window.confirm([
      `将重新生成「${targetVolume.title?.trim() || `第${targetVolume.sortOrder}卷`}」的节奏板。`,
      "This step will overwrite existing rhythm sections and deliverables for the current volume.",
      "Existing chapter lists and chapter refinement assets will not be deleted directly, but if the new pacing interval changes, it is recommended to check later to see if the chapter lists still match.",
    ].join("\n\n"));
    if (!confirmed) {
      return;
    }
  }
  params.generate({
    scope: "beat_sheet",
    targetVolumeId: params.volumeId,
  });
}

export function startChapterListGenerationAction(params: {
  volumeId: string;
  request?: ChapterListGenerationRequest;
  normalizedVolumeDraft: VolumePlan[];
  beatSheets: VolumeBeatSheet[];
  ensureCharacterGuard: () => boolean;
  setStructuredMessage: (value: string) => void;
  generate: (payload: VolumeGenerationPayload) => void;
}): void {
  const targetVolume = params.normalizedVolumeDraft.find((volume) => volume.id === params.volumeId);
  if (!targetVolume) {
    params.setStructuredMessage("The current volume does not exist and the chapter list cannot be generated.");
    return;
  }
  if (!findBeatSheet(params.beatSheets, params.volumeId)) {
    params.setStructuredMessage("There is no rhythm board in the current volume, so the chapter list cannot be directly opened by default.");
    return;
  }
  if (!params.ensureCharacterGuard()) {
    return;
  }
  const generationMode = params.request?.generationMode ?? "full_volume";
  const targetBeatKey = params.request?.targetBeatKey?.trim();
  if (generationMode === "single_beat" && !targetBeatKey) {
    params.setStructuredMessage("Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.");
    return;
  }
  params.generate({
    scope: "chapter_list",
    generationMode,
    targetVolumeId: params.volumeId,
    targetBeatKey,
  });
}

export function buildChapterListSuccessMessage(params: {
  document: VolumePlanDocument;
  targetVolumeId?: string;
  generationMode?: VolumeChapterListGenerationMode;
  targetBeatKey?: string;
  autoSyncedToChapterExecution?: boolean;
}): string {
  const updatedVolume = params.targetVolumeId
    ? params.document.volumes.find((volume) => volume.id === params.targetVolumeId)
    : undefined;
  const updatedChapterCount = updatedVolume?.chapters.length ?? 0;
  const syncSuffix = params.autoSyncedToChapterExecution ? ", and connect to the chapter execution area" : "";
  if (params.generationMode === "single_beat" && params.targetVolumeId && params.targetBeatKey) {
    const targetBeat = findBeatSheet(params.document.beatSheets, params.targetVolumeId)?.beats
      .find((beat) => beat.key === params.targetBeatKey);
    return updatedChapterCount > 0
      ? `当前卷节奏段「${targetBeat ? `${targetBeat.label}${targetBeat.title ? ` · ${targetBeat.title}` : ""}` : params.targetBeatKey}」已生成并自动保存${syncSuffix}，本卷现有 ${updatedChapterCount} 章。`
      : `当前卷节奏段「${targetBeat ? `${targetBeat.label}${targetBeat.title ? ` · ${targetBeat.title}` : ""}` : params.targetBeatKey}」已生成并自动保存${syncSuffix}。`;
  }
  return updatedChapterCount > 0
    ? `当前卷章节列表已生成并自动保存${syncSuffix}，现已更新为 ${updatedChapterCount} 章，相邻卷再平衡建议也已同步更新。`
    : `当前卷章节列表已生成并自动保存${syncSuffix}，相邻卷再平衡建议也已同步更新。`;
}
