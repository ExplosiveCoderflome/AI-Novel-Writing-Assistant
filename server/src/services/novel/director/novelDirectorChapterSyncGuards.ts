import type { VolumePlanDocument } from "@ai-novel/shared/types/novel";
import { flattenPreparedOutlineChapters } from "./novelDirectorStructuredOutlineRecovery";

function normalizeChapterTitle(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

export function executionChapterListMatchesWorkspace(input: {
  workspace: VolumePlanDocument;
  chapters: Array<{ order: number; title?: string | null }>;
  range?: { startOrder: number; endOrder: number } | null;
}): boolean {
  const expected = flattenPreparedOutlineChapters(input.workspace)
    .filter((chapter) => (
      !input.range
      || (
        chapter.chapterOrder >= input.range.startOrder
        && chapter.chapterOrder <= input.range.endOrder
      )
    ))
    .slice()
    .sort((left, right) => left.chapterOrder - right.chapterOrder);
  const actual = input.chapters
    .slice()
    .sort((left, right) => left.order - right.order);
  if (expected.length === 0 || actual.length !== expected.length) {
    return false;
  }
  return expected.every((chapter, index) => {
    const current = actual[index];
    return Boolean(current)
      && current.order === chapter.chapterOrder
      && normalizeChapterTitle(current.title) === normalizeChapterTitle(chapter.title);
  });
}
