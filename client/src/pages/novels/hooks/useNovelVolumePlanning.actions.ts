import i18next from "i18next";
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
    respectedExistingVolumeCount?: number | null;
  };
  hasUnsavedVolumeDraft: boolean;
  generate: (payload: VolumeGenerationPayload) => void;
}): void {
  if (!params.ensureCharacterGuard()) {
    return;
  }
  const confirmed = window.confirm([
    i18next.t("gen.pages.novels.hooks.useNovelVolumePlanning.actions.gen_ef3042c7"),
    i18next.t("gen.pages.novels.hooks.useNovelVolumePlanning.actions.gen_c77ad34b"),
    params.userPreferredVolumeCount != null
      ? `本次将固定为 ${params.userPreferredVolumeCount} 卷生成分卷策略。`
      : params.forceSystemRecommendedVolumeCount
        ? `本次将按系统建议卷数生成（当前建议 ${params.volumeCountGuidance.systemRecommendedVolumeCount} 卷），不沿用现有草稿卷数。`
        : params.volumeCountGuidance.respectedExistingVolumeCount != null
          ? `本次会优先沿用当前草稿的 ${params.volumeCountGuidance.respectedExistingVolumeCount} 卷结构，同时保持在允许区间 ${params.volumeCountGuidance.allowedVolumeCountRange.min}-${params.volumeCountGuidance.allowedVolumeCountRange.max} 内。`
          : `当前系统建议 ${params.volumeCountGuidance.systemRecommendedVolumeCount} 卷，允许区间 ${params.volumeCountGuidance.allowedVolumeCountRange.min}-${params.volumeCountGuidance.allowedVolumeCountRange.max} 卷。`,
    params.hasUnsavedVolumeDraft ? i18next.t("gen.pages.novels.hooks.useNovelVolumePlanning.actions.gen_73e9214c") : i18next.t("gen.pages.novels.hooks.useNovelVolumePlanning.actions.gen_70a74eca"),
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
    i18next.t("gen.pages.novels.hooks.useNovelVolumePlanning.actions.gen_ff0d25d6"),
    i18next.t("gen.pages.novels.hooks.useNovelVolumePlanning.actions.gen_ed3760af"),
    params.hasUnsavedVolumeDraft ? i18next.t("gen.pages.novels.hooks.useNovelVolumePlanning.actions.gen_45809bd0") : i18next.t("gen.pages.novels.hooks.useNovelVolumePlanning.actions.gen_66212aef"),
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
    params.setStructuredMessage(i18next.t("gen.pages.novels.hooks.useNovelVolumePlanning.actions.gen_6facf805"));
    return;
  }
  if (!params.strategyPlan) {
    params.setStructuredMessage(i18next.t("gen.pages.novels.hooks.useNovelVolumePlanning.actions.gen_da87e098"));
    return;
  }
  if (!params.ensureCharacterGuard()) {
    return;
  }
  const existingBeatSheet = findBeatSheet(params.beatSheets, params.volumeId);
  if (existingBeatSheet) {
    const confirmed = window.confirm([
      `将重新生成「${targetVolume.title?.trim() || `第${targetVolume.sortOrder}卷`}」的节奏板。`,
      i18next.t("gen.pages.novels.hooks.useNovelVolumePlanning.actions.gen_e97e65fa"),
      i18next.t("gen.pages.novels.hooks.useNovelVolumePlanning.actions.gen_bb8d5a7f"),
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
    params.setStructuredMessage(i18next.t("gen.pages.novels.hooks.useNovelVolumePlanning.actions.gen_77e19ec0"));
    return;
  }
  if (!findBeatSheet(params.beatSheets, params.volumeId)) {
    params.setStructuredMessage(i18next.t("gen.pages.novels.hooks.useNovelVolumePlanning.actions.gen_e38161cf"));
    return;
  }
  if (!params.ensureCharacterGuard()) {
    return;
  }
  const generationMode = params.request?.generationMode ?? "full_volume";
  const targetBeatKey = params.request?.targetBeatKey?.trim();
  if (generationMode === "single_beat" && !targetBeatKey) {
    params.setStructuredMessage(i18next.t("gen.pages.novels.hooks.useNovelVolumePlanning.actions.gen_e8a95d17"));
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
  const syncSuffix = params.autoSyncedToChapterExecution ? i18next.t("gen.pages.novels.hooks.useNovelVolumePlanning.actions.gen_2c922bf5") : "";
  if (params.generationMode === "single_beat" && params.targetVolumeId && params.targetBeatKey) {
    const targetBeat = findBeatSheet(params.document.beatSheets, params.targetVolumeId)?.beats
      .find((beat) => beat.key === params.targetBeatKey);
    return updatedChapterCount > 0
      ? `当前卷节奏段「${targetBeat?.label ?? params.targetBeatKey}」已重生并自动保存${syncSuffix}，本卷现有 ${updatedChapterCount} 章，相邻卷再平衡建议也已同步更新。`
      : `当前卷节奏段「${targetBeat?.label ?? params.targetBeatKey}」已重生并自动保存${syncSuffix}，相邻卷再平衡建议也已同步更新。`;
  }
  return updatedChapterCount > 0
    ? `当前卷章节列表已生成并自动保存${syncSuffix}，现已更新为 ${updatedChapterCount} 章，相邻卷再平衡建议也已同步更新。`
    : `当前卷章节列表已生成并自动保存${syncSuffix}，相邻卷再平衡建议也已同步更新。`;
}
