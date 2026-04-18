import type {
  VolumeBeat,
  VolumeChapterPlan,
  VolumePlan,
  VolumePlanDocument,
} from "@ai-novel/shared/types/novel";
import type { DirectorAutoExecutionPlan } from "@ai-novel/shared/types/novelDirector";
import {
  buildDirectorAutoExecutionScopeLabel,
  normalizeDirectorAutoExecutionPlan,
} from "./novelDirectorAutoExecution";
import { DIRECTOR_CHAPTER_DETAIL_MODES } from "./novelDirectorProgress";
import {
  getBeatExpectedChapterCount,
  getBeatSheet,
  resolveVolumeChapterBeatKey,
} from "../volume/volumeGenerationHelpers";

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
    && Boolean(chapter.taskSheet?.trim());
}

function hasPreparedOutlineChapterDetailMode(
  chapter: VolumeChapterPlan | null,
  detailMode: StructuredOutlineDetailMode,
): boolean {
  if (!chapter) {
    return false;
  }
  if (detailMode === "purpose") {
    return Boolean(chapter.purpose?.trim());
  }
  if (detailMode === "boundary") {
    return hasPreparedOutlineChapterBoundary(chapter);
  }
  return Boolean(chapter.taskSheet?.trim());
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

  for (const volume of sortedVolumes) {
    if (normalizedPlan.mode === "front10" && requiredVolumes.length > 0) {
      break;
    }
    if (normalizedPlan.mode === "volume" && volume.sortOrder > (normalizedPlan.volumeOrder ?? 1)) {
      break;
    }
    if (normalizedPlan.mode === "chapter_range" && maxPreparedChapterOrder >= (normalizedPlan.endOrder ?? 1)) {
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
  if (normalizedPlan.mode === "chapter_range") {
    return prepared.filter((chapter) => (
      chapter.chapterOrder >= (normalizedPlan.startOrder ?? 1)
      && chapter.chapterOrder <= (normalizedPlan.endOrder ?? normalizedPlan.startOrder ?? 1)
    ));
  }
  return prepared.slice(0, 10);
}

function resolveVolumeChapterListCursor(input: {
  volume: VolumePlan;
  workspace: VolumePlanDocument;
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

export function resolveStructuredOutlineRecoveryCursor(input: {
  workspace: VolumePlanDocument;
  plan?: DirectorAutoExecutionPlan | null;
}): StructuredOutlineRecoveryCursor {
  const normalizedPlan = normalizeDirectorAutoExecutionPlan(input.plan);
  const requiredVolumes = resolveRequiredVolumes(input.workspace, normalizedPlan);
  const preparedVolumeIds: string[] = [];

  for (const volume of requiredVolumes) {
    const beatSheet = getBeatSheet(input.workspace, volume.id);
    if (!beatSheet || beatSheet.beats.length === 0) {
      return {
        step: "beat_sheet",
        scopeLabel: buildDirectorAutoExecutionScopeLabel(normalizedPlan, null, volume.title),
        requiredVolumes,
        preparedVolumeIds,
        selectedChapters: [],
        totalChapterCount: 0,
        completedChapterCount: 0,
        totalDetailSteps: 0,
        completedDetailSteps: 0,
        nextChapterIndex: null,
        volumeId: volume.id,
        volumeOrder: volume.sortOrder,
        volumeTitle: volume.title,
        beatKey: null,
        beatLabel: null,
        chapterId: null,
        chapterOrder: null,
        detailMode: null,
      };
    }

    const chapterListCursor = resolveVolumeChapterListCursor({
      volume,
      workspace: input.workspace,
    });
    if (!chapterListCursor.isReady) {
      return {
        step: "chapter_list",
        scopeLabel: buildDirectorAutoExecutionScopeLabel(normalizedPlan, null, volume.title),
        requiredVolumes,
        preparedVolumeIds,
        selectedChapters: [],
        totalChapterCount: 0,
        completedChapterCount: 0,
        totalDetailSteps: 0,
        completedDetailSteps: 0,
        nextChapterIndex: null,
        volumeId: volume.id,
        volumeOrder: volume.sortOrder,
        volumeTitle: volume.title,
        beatKey: chapterListCursor.nextBeat?.key ?? null,
        beatLabel: chapterListCursor.nextBeat?.label ?? null,
        chapterId: null,
        chapterOrder: null,
        detailMode: null,
      };
    }

    preparedVolumeIds.push(volume.id);
  }

  const selectedChapters = selectPreparedOutlineChapters(input.workspace, normalizedPlan);
  const totalDetailSteps = selectedChapters.length * DIRECTOR_CHAPTER_DETAIL_MODES.length;
  let completedDetailSteps = 0;
  let completedChapterCount = 0;
  let nextChapterIndex: number | null = null;
  let nextChapter: PreparedOutlineChapterRef | null = null;
  let nextDetailMode: StructuredOutlineDetailMode | null = null;

  for (const [chapterIndex, chapterRef] of selectedChapters.entries()) {
    const chapter = findPreparedOutlineChapterDetail(input.workspace, chapterRef);
    let chapterComplete = true;
    for (const detailMode of DIRECTOR_CHAPTER_DETAIL_MODES) {
      if (hasPreparedOutlineChapterDetailMode(chapter, detailMode)) {
        completedDetailSteps += 1;
        continue;
      }
      chapterComplete = false;
      if (nextChapterIndex == null) {
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

  const scopeLabel = buildDirectorAutoExecutionScopeLabel(
    normalizedPlan,
    selectedChapters.length,
    normalizedPlan.mode === "volume" ? selectedChapters[0]?.volumeTitle ?? null : null,
  );

  if (nextChapter && nextDetailMode) {
    return {
      step: "chapter_detail_bundle",
      scopeLabel,
      requiredVolumes,
      preparedVolumeIds,
      selectedChapters,
      totalChapterCount: selectedChapters.length,
      completedChapterCount,
      totalDetailSteps,
      completedDetailSteps,
      nextChapterIndex,
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

  return {
    step: selectedChapters.length > 0 ? "chapter_sync" : "completed",
    scopeLabel,
    requiredVolumes,
    preparedVolumeIds,
    selectedChapters,
    totalChapterCount: selectedChapters.length,
    completedChapterCount,
    totalDetailSteps,
    completedDetailSteps,
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
