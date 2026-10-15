export interface ManualChapterRemovalState {
  generationState: string;
  chapterStatus: string | null;
  content: string | null;
  expectation: string | null;
  taskSheet: string | null;
  sceneCards: string | null;
  repairHistory: string | null;
  riskFlags: string | null;
}

/** Only an untouched manual placeholder may be removed. */
export function canRemoveManualChapter(chapter: ManualChapterRemovalState): boolean {
  return chapter.generationState === "planned"
      && (chapter.chapterStatus ?? "unplanned") === "unplanned"
      && !chapter.content?.trim()
      && !chapter.expectation?.trim()
      && !chapter.taskSheet?.trim()
      && !chapter.sceneCards?.trim()
      && !chapter.repairHistory?.trim()
      && !chapter.riskFlags?.trim();
}
