import type { CharacterTimeline } from "@ai-novel/shared/types/novel";
import type {DirectorWorkspace} from "@/api/directorNext";

// Saved creative assets only. The legacy shelf's workflow projection is intentionally excluded.
export type WorkspaceBook = DirectorWorkspace;
export type WorkspaceChapter = WorkspaceBook["chapters"][number];
export type WorkspaceCharacter = WorkspaceBook["materials"]["characters"][number];
export type Selection = { kind: "story" | "world" } | { kind: "chapter" | "character" | "volume" | "plan"; id: string } | { kind: "beat"; id: string; volumeId: string };
export type HistoryBoundary = number | null | "latest";

export function readableChapter(chapter: { content: string | null }) {
  return Boolean(chapter.content?.trim());
}

export function resolveSelection(selection: Selection | null, book: WorkspaceBook): Selection {
  if (selection) {
    if (selection.kind === "story" || selection.kind === "world") return selection;
    if (selection.kind === "beat") {
      if (book.planning?.beatSheets.some(sheet => sheet.volumeId === selection.volumeId && sheet.beats.some(beat => beat.key === selection.id))) return selection;
    } else if (selection.kind === "plan") {
      if (book.planning?.volumes.some(volume => volume.chapters.some(plan => plan.id === selection.id))) return selection;
    } else {
    const rows = selection.kind === "chapter" ? book.chapters : selection.kind === "character" ? book.materials.characters : book.planning?.volumes ?? book.materials.volumes;
    const id = "id" in selection ? selection.id : undefined;
    if (rows.some(row => row.id === id)) return selection;
    }
  }
  const chapter = book.chapters.find(readableChapter);
  return chapter ? { kind: "chapter", id: chapter.id } : { kind: "story" };
}

export function visibleCharacterHistory<T extends Pick<CharacterTimeline, "chapterOrder">>(rows: T[], boundary: HistoryBoundary): T[] {
  if (boundary === null) return [];
  return rows.filter(row => boundary === "latest" || (typeof row.chapterOrder === "number" && row.chapterOrder <= boundary))
    .sort((a, b) => (b.chapterOrder ?? -1) - (a.chapterOrder ?? -1));
}
