import type { VolumePlan } from "@ai-novel/shared/types/novel";
import { assessChapterExecutionContractShape } from "@ai-novel/shared/types/chapterTaskSheetQuality";

export type StructuredVolumeChapter = VolumePlan["chapters"][number];
export type ChapterDetailMode = "purpose" | "boundary" | "task_sheet";
export type ChapterExecutionDetailStatus = "empty" | "partial" | "complete";

export const CHAPTER_DETAIL_MODES: ChapterDetailMode[] = ["task_sheet"];

export interface ChapterDetailBatchSelection {
  chapterIds: string[];
  label?: string;
}

export type ChapterDetailBundleRequest = string | ChapterDetailBatchSelection;

export function detailModeLabel(mode: ChapterDetailMode): string {
  if (mode === "purpose") return "Chapter Objectives";
  if (mode === "boundary") return "execution boundary";
  return "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.";
}

export function hasChapterDetailDraft(
  chapter: StructuredVolumeChapter,
  mode: ChapterDetailMode,
): boolean {
  if (mode === "purpose") {
    return Boolean(chapter.purpose?.trim());
  }
  if (mode === "boundary") {
    return typeof chapter.conflictLevel === "number"
      || typeof chapter.revealLevel === "number"
      || typeof chapter.targetWordCount === "number"
      || Boolean(chapter.mustAvoid?.trim())
      || chapter.payoffRefs.length > 0;
  }
  return assessChapterExecutionContractShape({
    novelId: "workspace",
    volumeId: chapter.volumeId,
    chapterId: chapter.id,
    chapterOrder: chapter.chapterOrder,
    title: chapter.title,
    summary: chapter.summary,
    purpose: chapter.purpose,
    exclusiveEvent: chapter.exclusiveEvent,
    endingState: chapter.endingState,
    nextChapterEntryState: chapter.nextChapterEntryState,
    conflictLevel: chapter.conflictLevel,
    revealLevel: chapter.revealLevel,
    targetWordCount: chapter.targetWordCount,
    mustAvoid: chapter.mustAvoid,
    payoffRefs: chapter.payoffRefs,
    taskSheet: chapter.taskSheet,
    sceneCards: chapter.sceneCards,
  }).canEnterExecution;
}

export function hasAnyChapterDetailDraft(chapter: StructuredVolumeChapter): boolean {
  return CHAPTER_DETAIL_MODES.some((mode) => hasChapterDetailDraft(chapter, mode));
}

export function hasCompleteChapterDetailDraft(chapter: StructuredVolumeChapter): boolean {
  return CHAPTER_DETAIL_MODES.every((mode) => hasChapterDetailDraft(chapter, mode));
}

export function getChapterExecutionDetailStatus(
  chapter: StructuredVolumeChapter,
): ChapterExecutionDetailStatus {
  if (hasCompleteChapterDetailDraft(chapter)) {
    return "complete";
  }
  if (hasAnyChapterDetailDraft(chapter)) {
    return "partial";
  }
  return "empty";
}

export function hasChapterExecutionDetail(chapter: StructuredVolumeChapter): boolean {
  return getChapterExecutionDetailStatus(chapter) === "complete";
}
