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
    "将生成卷战略建议，帮助决定推荐卷数、硬规划卷数和各卷角色定位。",
    "这一步不会直接生成卷骨架，也不会拆章节。",
    params.userPreferredVolumeCount != null
      ? i18next.t("novels.prefVolNotice", { count: params.userPreferredVolumeCount, defaultValue: i18next.t("novels.useNovelVolumePlanning.actions.gzxnal", { val1: (params.userPreferredVolumeCount) }) })
      : params.forceSystemRecommendedVolumeCount
        ? i18next.t("novels.sysVolNotice", { count: params.volumeCountGuidance.systemRecommendedVolumeCount, defaultValue: i18next.t("novels.useNovelVolumePlanning.actions.x0qjri", { val1: (params.volumeCountGuidance.systemRecommendedVolumeCount) }) })
        : params.volumeCountGuidance.respectedExistingVolumeCount != null
          ? i18next.t("novels.respectVolNotice", { count: params.volumeCountGuidance.respectedExistingVolumeCount, min: params.volumeCountGuidance.allowedVolumeCountRange.min, max: params.volumeCountGuidance.allowedVolumeCountRange.max, defaultValue: i18next.t("novels.useNovelVolumePlanning.actions.15o2uq", { val1: (params.volumeCountGuidance.respectedExistingVolumeCount), val2: (params.volumeCountGuidance.allowedVolumeCountRange.min), val3: (params.volumeCountGuidance.allowedVolumeCountRange.max) }) })
          : i18next.t("novels.suggestVolNotice", { rec: params.volumeCountGuidance.systemRecommendedVolumeCount, min: params.volumeCountGuidance.decisionVolumeCountRange.min, max: params.volumeCountGuidance.decisionVolumeCountRange.max, defaultValue: i18next.t("novels.useNovelVolumePlanning.actions.2bz2x3", { val1: (params.volumeCountGuidance.systemRecommendedVolumeCount), val2: (params.volumeCountGuidance.decisionVolumeCountRange.min), val3: (params.volumeCountGuidance.decisionVolumeCountRange.max) }) }),
    params.hasUnsavedVolumeDraft ? "本次会直接使用当前页面未保存草稿作为参考。" : "本次会基于当前工作区状态生成建议。",
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
    "将根据当前卷战略建议生成或重生成全书卷骨架。",
    "这一步会清空已有节奏板和相邻卷再平衡建议，但不会直接删除章节正文。",
    params.hasUnsavedVolumeDraft ? "本次会直接使用当前页面草稿作为卷骨架上下文。" : "本次会基于当前卷工作区继续推进。",
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
    params.setStructuredMessage("当前卷不存在，无法生成节奏板。");
    return;
  }
  if (!params.strategyPlan) {
    params.setStructuredMessage("请先生成卷战略建议，再生成当前卷节奏板。");
    return;
  }
  const existingBeatSheet = findBeatSheet(params.beatSheets, params.volumeId);
  if (existingBeatSheet) {
    const volumeName = targetVolume.title?.trim() || i18next.t("novels.volumeName", { order: targetVolume.sortOrder, defaultValue: i18next.t("novels.outlineCurrentVolumeWorkspace.xrxl0b", { val1: (targetVolume.sortOrder) }) });
    const confirmed = window.confirm([
      i18next.t("novels.reGenBeatMsg", { volumeName, defaultValue: i18next.t("novels.useNovelVolumePlanning.actions.f8r3d", { val1: (volumeName) }) }),
      "这一步会覆盖当前卷现有节奏段与交付项。",
      "已有章节列表和章节细化资产不会被直接删除，但如果新节奏区间发生变化，建议随后检查章节列表是否仍然匹配。",
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
    params.setStructuredMessage("当前卷不存在，无法生成章节列表。");
    return;
  }
  if (!findBeatSheet(params.beatSheets, params.volumeId)) {
    params.setStructuredMessage("当前卷还没有节奏板，默认不能直接拆章节列表。");
    return;
  }
  if (!params.ensureCharacterGuard()) {
    return;
  }
  const generationMode = params.request?.generationMode ?? "full_volume";
  const targetBeatKey = params.request?.targetBeatKey?.trim();
  if (generationMode === "single_beat" && !targetBeatKey) {
    params.setStructuredMessage("当前节奏段不存在，无法重生该段章节标题。");
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
  const syncSuffix = params.autoSyncedToChapterExecution ? "，并连接到章节执行区" : "";
  if (params.generationMode === "single_beat" && params.targetVolumeId && params.targetBeatKey) {
    const targetBeat = findBeatSheet(params.document.beatSheets, params.targetVolumeId)?.beats
      .find((beat) => beat.key === params.targetBeatKey);
    const beatName = targetBeat ? `${targetBeat.label}${targetBeat.title ? ` · ${targetBeat.title}` : ""}` : params.targetBeatKey;
    return updatedChapterCount > 0
      ? i18next.t("novels.singleBeatSuccessCount", { beatName, syncSuffix, count: updatedChapterCount, defaultValue: i18next.t("novels.useNovelVolumePlanning.actions.rwtc8p", { val1: (beatName), val2: (syncSuffix), val3: (updatedChapterCount) }) })
      : i18next.t("novels.singleBeatSuccess", { beatName, syncSuffix, defaultValue: i18next.t("novels.useNovelVolumePlanning.actions.k1lpsn", { val1: (beatName), val2: (syncSuffix) }) });
  }
  return updatedChapterCount > 0
    ? i18next.t("novels.fullVolumeSuccessCount", { syncSuffix, count: updatedChapterCount, defaultValue: i18next.t("novels.useNovelVolumePlanning.actions.51evfs", { val1: (syncSuffix), val2: (updatedChapterCount) }) })
    : i18next.t("novels.fullVolumeSuccess", { syncSuffix, defaultValue: i18next.t("novels.useNovelVolumePlanning.actions.4i2l27", { val1: (syncSuffix) }) });
}
