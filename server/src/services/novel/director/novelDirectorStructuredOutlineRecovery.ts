import type {
  VolumeBeat,
  VolumeBeatSheet,
  VolumeChapterPlan,
  VolumePlan,
  VolumePlanDocument,
} from "@ai-novel/shared/types/novel";
import type { DirectorAutoExecutionPlan } from "@ai-novel/shared/types/novelDirector";
import {
  buildDirectorAutoExecutionScopeLabel,
  countDirectorAutoExecutionChapterRange,
  normalizeDirectorAutoExecutionPlan,
  resolveDirectorAutoExecutionPlanChapterRange,
} from "./novelDirectorAutoExecution";
import { DIRECTOR_CHAPTER_DETAIL_MODES } from "./novelDirectorProgress";
import {
  getBeatExpectedChapterCount,
  getBeatSheet,
  allocateChapterBudgets,
  resolveVolumeChapterBeatKey,
} from "../volume/volumeGenerationHelpers";
import {
  inferRequiredChapterCountFromBeatSheet,
  resolveTargetChapterCount,
} from "../volume/volumeBeatSheetChapterBudget";

export type StructuredOutlineDetailMode = (typeof DIRECTOR_CHAPTER_DETAIL_MODES)[number];
export type StructuredOutlineRecoveryStep =
  | "beat_sheet"
  | "chapter_list"
  | "chapter_detail_bundle"
  | "chapter_sync"
  | "completed";

export interface PreparedOutlineChapterRef {
  id: string;
  volumeId: string;
  volumeOrder: number;
  volumeTitle: string;
  chapterOrder: number;
  title: string;
}

export interface StructuredOutlineRecoveryCursor {
  step: StructuredOutlineRecoveryStep;
  scopeLabel: string;
  requiredVolumes: VolumePlan[];
  preparedVolumeIds: string[];
  selectedChapters: PreparedOutlineChapterRef[];
  totalChapterCount: number;
  completedChapterCount: number;
  totalDetailSteps: number;
  completedDetailSteps: number;
  nextChapterIndex: number | null;
  volumeId: string | null;
  volumeOrder: number | null;
  volumeTitle: string | null;
  beatKey: string | null;
  beatLabel: string | null;
  chapterId: string | null;
  chapterOrder: number | null;
  detailMode: StructuredOutlineDetailMode | null;
}

function buildStructuredOutlineVolumeCursor(input: {
  step: "beat_sheet" | "chapter_list";
  normalizedPlan: DirectorAutoExecutionPlan;
  requiredVolumes: VolumePlan[];
  preparedVolumeIds: string[];
  volume: VolumePlan;
  beat?: VolumeBeat | null;
}): StructuredOutlineRecoveryCursor {
  return {
    step: input.step,
    scopeLabel: buildDirectorAutoExecutionScopeLabel(input.normalizedPlan, null, input.volume.title),
    requiredVolumes: input.requiredVolumes,
    preparedVolumeIds: input.preparedVolumeIds,
    selectedChapters: [],
    totalChapterCount: 0,
    completedChapterCount: 0,
    totalDetailSteps: 0,
    completedDetailSteps: 0,
    nextChapterIndex: null,
    volumeId: input.volume.id,
    volumeOrder: input.volume.sortOrder,
    volumeTitle: input.volume.title,
    beatKey: input.beat?.key ?? null,
    beatLabel: input.beat?.label ?? null,
    chapterId: null,
    chapterOrder: null,
    detailMode: null,
  };
}

function hasPreparedOutlineChapterBoundary(chapter: VolumeChapterPlan | null): boolean {
  if (!chapter) {
    return false;
  }
  return typeof chapter.conflictLevel === "number"
    || typeof chapter.revealLevel === "number"
    || typeof chapter.targetWordCount === "number"
    || Boolean(chapter.mustAvoid?.trim())
    || chapter.payoffRefs.length > 0;
}

export function hasPreparedOutlineChapterExecutionDetail(
  chapter: VolumeChapterPlan | null,
): boolean {
  if (!chapter) {
    return false;
  }
  return Boolean(chapter.purpose?.trim())
    && hasPreparedOutlineChapterBoundary(chapter)
    && Boolean(chapter.taskSheet?.trim())
    && Boolean(chapter.sceneCards?.trim());
}

function hasPreparedOutlineChapterDetailMode(
  chapter: VolumeChapterPlan | null,
  detailMode: StructuredOutlineDetailMode,
): boolean {
  if (!chapter) {
    return false;
  }
  return detailMode === "task_sheet"
    ? Boolean(chapter.purpose?.trim())
      && hasPreparedOutlineChapterBoundary(chapter)
      && Boolean(chapter.taskSheet?.trim())
      && Boolean(chapter.sceneCards?.trim())
    : false;
}

function findPreparedOutlineChapterDetail(
  workspace: VolumePlanDocument,
  target: PreparedOutlineChapterRef,
): VolumePlanDocument["volumes"][number]["chapters"][number] | null {
  const volume = workspace.volumes.find((item) => item.id === target.volumeId);
  if (!volume) {
    return null;
  }
  return volume.chapters.find((chapter) => chapter.id === target.id) ?? null;
}

export function flattenPreparedOutlineChapters(workspace: VolumePlanDocument): PreparedOutlineChapterRef[] {
  return workspace.volumes
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .flatMap((volume) => volume.chapters
      .slice()
      .sort((left, right) => left.chapterOrder - right.chapterOrder)
      .map((chapter) => ({
        id: chapter.id,
        volumeId: volume.id,
        volumeOrder: volume.sortOrder,
        volumeTitle: volume.title,
        chapterOrder: chapter.chapterOrder,
        title: chapter.title,
      })));
}

function resolveRequiredVolumes(
  workspace: VolumePlanDocument,
  plan: DirectorAutoExecutionPlan | null | undefined,
): VolumePlan[] {
  const normalizedPlan = normalizeDirectorAutoExecutionPlan(plan);
  const sortedVolumes = workspace.volumes
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder);
  const requiredVolumes: VolumePlan[] = [];
  let maxPreparedChapterOrder = 0;
  const targetChapterRange = resolveDirectorAutoExecutionPlanChapterRange(normalizedPlan);

  for (const volume of sortedVolumes) {
    if (normalizedPlan.mode === "volume" && volume.sortOrder > (normalizedPlan.volumeOrder ?? 1)) {
      break;
    }
    if (targetChapterRange && maxPreparedChapterOrder >= targetChapterRange.endOrder) {
      break;
    }

    requiredVolumes.push(volume);
    maxPreparedChapterOrder = Math.max(
      maxPreparedChapterOrder,
      ...volume.chapters.map((chapter) => chapter.chapterOrder),
    );
  }

  return requiredVolumes;
}

function selectPreparedOutlineChapters(
  workspace: VolumePlanDocument,
  plan: DirectorAutoExecutionPlan | null | undefined,
): PreparedOutlineChapterRef[] {
  const normalizedPlan = normalizeDirectorAutoExecutionPlan(plan);
  const prepared = flattenPreparedOutlineChapters(workspace);
  if (normalizedPlan.mode === "volume") {
    return prepared.filter((chapter) => chapter.volumeOrder === normalizedPlan.volumeOrder);
  }
  const targetChapterRange = resolveDirectorAutoExecutionPlanChapterRange(normalizedPlan);
  if (targetChapterRange) {
    return prepared.filter((chapter) => (
      chapter.chapterOrder >= targetChapterRange.startOrder
      && chapter.chapterOrder <= targetChapterRange.endOrder
    ));
  }
  return [];
}

function hasReadableBeatSheetChapterSpans(beatSheet: VolumeBeatSheet): boolean {
  return inferRequiredChapterCountFromBeatSheet(beatSheet) > 0;
}

function isBeatSheetAcceptedForVolumeBudget(input: {
  beatSheet: VolumeBeatSheet;
  expectedChapterCount?: number | null;
}): boolean {
  if (typeof input.expectedChapterCount !== "number" || input.expectedChapterCount <= 0) {
    return true;
  }
  return resolveTargetChapterCount({
    budgetedChapterCount: input.expectedChapterCount,
    beatSheetRequiredChapterCount: inferRequiredChapterCountFromBeatSheet(input.beatSheet),
  }).beatSheetCountAccepted;
}

function findMissingSelectedChapterOrders(
  selectedChapters: PreparedOutlineChapterRef[],
  targetRange: { startOrder: number; endOrder: number },
): number[] {
  const selectedOrders = new Set(selectedChapters.map((chapter) => chapter.chapterOrder));
  const missingOrders: number[] = [];
  for (let order = targetRange.startOrder; order <= targetRange.endOrder; order += 1) {
    if (!selectedOrders.has(order)) {
      missingOrders.push(order);
    }
  }
  return missingOrders;
}

function resolveVolumeForMissingChapterOrder(
  requiredVolumes: VolumePlan[],
  missingChapterOrder: number,
): VolumePlan | null {
  const sortedVolumes = requiredVolumes
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder);
  for (const volume of sortedVolumes) {
    const chapterOrders = volume.chapters.map((chapter) => chapter.chapterOrder);
    if (chapterOrders.length === 0) {
      continue;
    }
    const minOrder = Math.min(...chapterOrders);
    const maxOrder = Math.max(...chapterOrders);
    if (missingChapterOrder >= minOrder && missingChapterOrder <= maxOrder + 1) {
      return volume;
    }
  }
  return sortedVolumes[sortedVolumes.length - 1] ?? null;
}

function resolveVolumeChapterListCursor(input: {
  volume: VolumePlan;
  workspace: VolumePlanDocument;
  expectedChapterCount?: number | null;
}): {
  isReady: boolean;
  nextBeat: VolumeBeat | null;
} {
  const beatSheet = getBeatSheet(input.workspace, input.volume.id);
  if (!beatSheet || beatSheet.beats.length === 0) {
    return {
      isReady: false,
      nextBeat: null,
    };
  }

  const chapters = input.volume.chapters
    .slice()
    .sort((left, right) => left.chapterOrder - right.chapterOrder);

  if (typeof input.expectedChapterCount === "number" && input.expectedChapterCount > 0) {
    const expectedDrift = Math.max(8, Math.ceil(input.expectedChapterCount * 0.25));
    if (chapters.length < input.expectedChapterCount - expectedDrift) {
      return {
        isReady: false,
        nextBeat: beatSheet.beats[0] ?? null,
      };
    }
  }

  for (const beat of beatSheet.beats) {
    const matchedChapterCount = chapters.filter((chapter) => resolveVolumeChapterBeatKey({
      chapter,
      volume: input.volume,
      beatSheet,
    }) === beat.key).length;
    if (matchedChapterCount !== Math.max(1, getBeatExpectedChapterCount(beat))) {
      return {
        isReady: false,
        nextBeat: beat,
      };
    }
  }

  return {
    isReady: true,
    nextBeat: null,
  };
}

function resolveSelectedOutlineDetailProgress(input: {
  workspace: VolumePlanDocument;
  selectedChapters: PreparedOutlineChapterRef[];
  targetVolumeId?: string | null;
}): {
  totalDetailSteps: number;
  completedDetailSteps: number;
  completedChapterCount: number;
  nextChapterIndex: number | null;
  nextChapter: PreparedOutlineChapterRef | null;
  nextDetailMode: StructuredOutlineDetailMode | null;
} {
  const totalDetailSteps = input.selectedChapters.length * DIRECTOR_CHAPTER_DETAIL_MODES.length;
  let completedDetailSteps = 0;
  let completedChapterCount = 0;
  let nextChapterIndex: number | null = null;
  let nextChapter: PreparedOutlineChapterRef | null = null;
  let nextDetailMode: StructuredOutlineDetailMode | null = null;

  for (const [chapterIndex, chapterRef] of input.selectedChapters.entries()) {
    const chapter = findPreparedOutlineChapterDetail(input.workspace, chapterRef);
    let chapterComplete = true;
    for (const detailMode of DIRECTOR_CHAPTER_DETAIL_MODES) {
      if (hasPreparedOutlineChapterDetailMode(chapter, detailMode)) {
        completedDetailSteps += 1;
        continue;
      }
      chapterComplete = false;
      if (
        nextChapterIndex == null
        && (!input.targetVolumeId || chapterRef.volumeId === input.targetVolumeId)
      ) {
        nextChapterIndex = chapterIndex;
        nextChapter = chapterRef;
        nextDetailMode = detailMode;
      }
      break;
    }
    if (chapterComplete) {
      completedChapterCount += 1;
    }
  }

  return {
    totalDetailSteps,
    completedDetailSteps,
    completedChapterCount,
    nextChapterIndex,
    nextChapter,
    nextDetailMode,
  };
}

function buildStructuredOutlineDetailCursor(input: {
  normalizedPlan: DirectorAutoExecutionPlan;
  requiredVolumes: VolumePlan[];
  preparedVolumeIds: string[];
  selectedChapters: PreparedOutlineChapterRef[];
  selectedChapterRange: { startOrder: number; endOrder: number } | null;
  detailProgress: ReturnType<typeof resolveSelectedOutlineDetailProgress>;
}): StructuredOutlineRecoveryCursor | null {
  const { nextChapter, nextDetailMode } = input.detailProgress;
  if (!nextChapter || !nextDetailMode) {
    return null;
  }

  const scopeLabel = buildDirectorAutoExecutionScopeLabel(
    input.normalizedPlan,
    input.selectedChapterRange
      ? countDirectorAutoExecutionChapterRange(input.selectedChapterRange)
      : input.selectedChapters.length,
    input.normalizedPlan.mode === "volume" ? input.selectedChapters[0]?.volumeTitle ?? null : null,
  );

  return {
    step: "chapter_detail_bundle",
    scopeLabel,
    requiredVolumes: input.requiredVolumes,
    preparedVolumeIds: input.preparedVolumeIds,
    selectedChapters: input.selectedChapters,
    totalChapterCount: input.selectedChapters.length,
    completedChapterCount: input.detailProgress.completedChapterCount,
    totalDetailSteps: input.detailProgress.totalDetailSteps,
    completedDetailSteps: input.detailProgress.completedDetailSteps,
    nextChapterIndex: input.detailProgress.nextChapterIndex,
    volumeId: nextChapter.volumeId,
    volumeOrder: nextChapter.volumeOrder,
    volumeTitle: nextChapter.volumeTitle,
    beatKey: null,
    beatLabel: null,
    chapterId: nextChapter.id,
    chapterOrder: nextChapter.chapterOrder,
    detailMode: nextDetailMode,
  };
}

export function resolveStructuredOutlineRecoveryCursor(input: {
  workspace: VolumePlanDocument;
  plan?: DirectorAutoExecutionPlan | null;
  estimatedChapterCount?: number | null;
}): StructuredOutlineRecoveryCursor {
  const normalizedPlan = normalizeDirectorAutoExecutionPlan(input.plan);
  const requiredVolumes = resolveRequiredVolumes(input.workspace, normalizedPlan);
  const selectedChapters = selectPreparedOutlineChapters(input.workspace, normalizedPlan);
  const selectedChapterRange = resolveDirectorAutoExecutionPlanChapterRange(normalizedPlan);
  const preparedVolumeIds: string[] = [];
  const shouldValidateFullVolumeBudget = Boolean(
    (normalizedPlan.mode === "volume" || normalizedPlan.mode === "chapter_range")
      && typeof input.estimatedChapterCount === "number"
      && input.estimatedChapterCount > 0,
  );
  const expectedChapterBudgets = shouldValidateFullVolumeBudget
    && typeof input.estimatedChapterCount === "number"
    && input.estimatedChapterCount > 0
    ? allocateChapterBudgets({
      volumeCount: Math.max(input.workspace.volumes.length, 1),
      chapterBudget: input.estimatedChapterCount,
      existingVolumes: input.workspace.volumes,
    })
    : [];

  for (const volume of requiredVolumes) {
    const beatSheet = getBeatSheet(input.workspace, volume.id);
    if (!beatSheet || beatSheet.beats.length === 0) {
      return buildStructuredOutlineVolumeCursor({
        step: "beat_sheet",
        normalizedPlan,
        requiredVolumes,
        preparedVolumeIds,
        volume,
      });
    }

    const expectedChapterCount = shouldValidateFullVolumeBudget
      ? expectedChapterBudgets[volume.sortOrder - 1] ?? null
      : null;
    if (
      !hasReadableBeatSheetChapterSpans(beatSheet)
      || !isBeatSheetAcceptedForVolumeBudget({ beatSheet, expectedChapterCount })
    ) {
      return buildStructuredOutlineVolumeCursor({
        step: "beat_sheet",
        normalizedPlan,
        requiredVolumes,
        preparedVolumeIds,
        volume,
      });
    }

    const chapterListCursor = resolveVolumeChapterListCursor({
      volume,
      workspace: input.workspace,
      expectedChapterCount,
    });
    if (!chapterListCursor.isReady) {
      return buildStructuredOutlineVolumeCursor({
        step: "chapter_list",
        normalizedPlan,
        requiredVolumes,
        preparedVolumeIds,
        volume,
        beat: chapterListCursor.nextBeat,
      });
    }

    preparedVolumeIds.push(volume.id);

    const detailCursor = buildStructuredOutlineDetailCursor({
      normalizedPlan,
      requiredVolumes,
      preparedVolumeIds,
      selectedChapters,
      selectedChapterRange,
      detailProgress: resolveSelectedOutlineDetailProgress({
        workspace: input.workspace,
        selectedChapters,
        targetVolumeId: volume.id,
      }),
    });
    if (detailCursor) {
      return detailCursor;
    }
  }

  if (selectedChapterRange) {
    const missingOrders = findMissingSelectedChapterOrders(selectedChapters, selectedChapterRange);
    if (missingOrders.length > 0) {
      const targetVolume = resolveVolumeForMissingChapterOrder(requiredVolumes, missingOrders[0]);
      if (targetVolume) {
        return buildStructuredOutlineVolumeCursor({
          step: "beat_sheet",
          normalizedPlan,
          requiredVolumes,
          preparedVolumeIds,
          volume: targetVolume,
        });
      }
    }
  }

  const detailProgress = resolveSelectedOutlineDetailProgress({
    workspace: input.workspace,
    selectedChapters,
  });
  const detailCursor = buildStructuredOutlineDetailCursor({
    normalizedPlan,
    requiredVolumes,
    preparedVolumeIds,
    selectedChapters,
    selectedChapterRange,
    detailProgress,
  });
  if (detailCursor) {
    return detailCursor;
  }

  const scopeLabel = buildDirectorAutoExecutionScopeLabel(
    normalizedPlan,
    selectedChapterRange ? countDirectorAutoExecutionChapterRange(selectedChapterRange) : selectedChapters.length,
    normalizedPlan.mode === "volume" ? selectedChapters[0]?.volumeTitle ?? null : null,
  );

  return {
    step: selectedChapters.length > 0 ? "chapter_sync" : "completed",
    scopeLabel,
    requiredVolumes,
    preparedVolumeIds,
    selectedChapters,
    totalChapterCount: selectedChapters.length,
    completedChapterCount: detailProgress.completedChapterCount,
    totalDetailSteps: detailProgress.totalDetailSteps,
    completedDetailSteps: detailProgress.completedDetailSteps,
    nextChapterIndex: null,
    volumeId: null,
    volumeOrder: null,
    volumeTitle: null,
    beatKey: null,
    beatLabel: null,
    chapterId: null,
    chapterOrder: null,
    detailMode: null,
  };
}
