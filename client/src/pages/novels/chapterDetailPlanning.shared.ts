import type { VolumePlan } from "@ai-novel/shared/types/novel";

export type StructuredVolumeChapter = VolumePlan["chapters"][number];
export type ChapterDetailMode = "purpose" | "boundary" | "task_sheet";

export const CHAPTER_DETAIL_MODES: ChapterDetailMode[] = ["purpose", "boundary", "task_sheet"];

export interface ChapterDetailBatchSelection {
  chapterIds: string[];
  label?: string;
}

export type ChapterDetailBundleRequest = string | ChapterDetailBatchSelection;

export function detailModeLabel(mode: ChapterDetailMode): string {
  if (mode === "purpose") return "章节目标";
  if (mode === "boundary") return "执行边界";
  return "任务单";
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
  return Boolean(chapter.taskSheet?.trim());
}

export function hasAnyChapterDetailDraft(chapter: StructuredVolumeChapter): boolean {
  return CHAPTER_DETAIL_MODES.some((mode) => hasChapterDetailDraft(chapter, mode));
}

export function hasChapterExecutionDetail(chapter: StructuredVolumeChapter): boolean {
  return Boolean(
    chapter.title?.trim()
    || chapter.summary?.trim()
    || hasAnyChapterDetailDraft(chapter),
  );
}
