import type { SimpleCreationShelfProjection, CharacterTimeline } from "@ai-novel/shared/types/novel";

// Saved creative assets only. The legacy shelf's workflow projection is intentionally excluded.
export type WorkspaceBook = Pick<SimpleCreationShelfProjection, "novel" | "chapters" | "materials">;
export type WorkspaceChapter = WorkspaceBook["chapters"][number];
export type WorkspaceCharacter = WorkspaceBook["materials"]["characters"][number];
export type Selection = { kind: "story" | "world" } | { kind: "chapter" | "character" | "volume"; id: string };
export type HistoryBoundary = number | null | "latest";

export function readableChapter(chapter: { content: string | null }) {
  return Boolean(chapter.content?.trim());
}

export function resolveSelection(selection: Selection | null, book: WorkspaceBook): Selection {
  if (selection) {
    if (selection.kind === "story" || selection.kind === "world") return selection;
    const rows = selection.kind === "chapter" ? book.chapters : selection.kind === "character" ? book.materials.characters : book.materials.volumes;
    const id = "id" in selection ? selection.id : undefined;
    if (rows.some(row => row.id === id)) return selection;
  }
  const chapter = book.chapters.find(readableChapter);
  return chapter ? { kind: "chapter", id: chapter.id } : { kind: "story" };
}

export function visibleCharacterHistory<T extends Pick<CharacterTimeline, "chapterOrder">>(rows: T[], boundary: HistoryBoundary): T[] {
  if (boundary === null) return [];
  return rows.filter(row => boundary === "latest" || (typeof row.chapterOrder === "number" && row.chapterOrder <= boundary))
    .sort((a, b) => (b.chapterOrder ?? -1) - (a.chapterOrder ?? -1));
}
