import type { VolumePlanDocument, VolumeChapterPlan, VolumeBeat } from "@ai-novel/shared/types/novel";
import type { WorkspaceBook, WorkspaceChapter, Selection } from "./model";

export interface PlannedChapter { plan?: VolumeChapterPlan; chapter?: WorkspaceChapter }
export function chapterSelection(row: PlannedChapter): Selection {
  return row.chapter ? { kind: "chapter", id: row.chapter.id } : { kind: "plan", id: row.plan!.id };
}
export function beatSelection(volumeId: string, beat: VolumeBeat): Selection {
  return { kind: "beat", id: beat.key, volumeId };
}
export function sameSelection(a: Selection, b: Selection) {
  return a.kind === b.kind && (!("id" in a) || ("id" in b && a.id === b.id))
    && (a.kind !== "beat" || (b.kind === "beat" && a.volumeId === b.volumeId));
}

// Association comes from persisted planning links, never the descriptive chapter-span hint.
export function buildStoryDirectory(book: WorkspaceBook, document?: VolumePlanDocument) {
  const used = new Set<string>();
  const volumes = (document?.volumes ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder).map(volume => {
    const chapters: PlannedChapter[] = volume.chapters.slice().sort((a,b) => a.chapterOrder-b.chapterOrder).map(plan => {
      const chapter = plan.chapterId
        ? book.chapters.find(row => row.id === plan.chapterId)
        : book.chapters.find(row => row.order === plan.chapterOrder);
      if (chapter) used.add(chapter.id);
      return {plan, chapter};
    });
    const beats = (document?.beatSheets.find(sheet => sheet.volumeId === volume.id)?.beats ?? []).map(beat => ({
      beat, chapters: chapters.filter(row => row.plan?.beatKey === beat.key),
    }));
    return { volume, beats, chapters, unassigned: chapters.filter(row => !beats.some(group => group.beat.key === row.plan?.beatKey)) };
  });
  return {volumes, unassigned: book.chapters.filter(row => !used.has(row.id)).map(chapter => ({chapter} as PlannedChapter))};
}
