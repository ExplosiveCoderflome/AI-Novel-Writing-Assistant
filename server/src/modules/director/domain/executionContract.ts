/** Property order is part of persisted V2 approval hashes. */
export function savedExecutionContract(chapter: {
  id: string; order: number; taskSheet: string | null; sceneCards: string | null;
  targetWordCount?: number | null; conflictLevel?: number | null; revealLevel?: number | null; mustAvoid?: string | null;
}) {
  return {chapterId: chapter.id, chapterOrder: chapter.order, taskSheet: chapter.taskSheet, sceneCards: chapter.sceneCards,
    targetWordCount: chapter.targetWordCount ?? null, conflictLevel: chapter.conflictLevel ?? null,
    revealLevel: chapter.revealLevel ?? null, mustAvoid: chapter.mustAvoid ?? null};
}
