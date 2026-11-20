import type { RagSearchOptions, RetrievedChunk } from "../types";

export function filterChapterCharacterScope(rows: RetrievedChunk[], scope: RagSearchOptions["chapterCharacterScope"]): RetrievedChunk[] {
  if (!scope) return rows;
  const adjusted = new Set(scope.adjustedCharacterIds);
  const visible = new Set(scope.visibleChapterIds);
  return rows.filter(row => {
    if (row.ownerType === "character") return !adjusted.has(row.ownerId);
    if (row.ownerType === "chapter" || row.ownerType === "chapter_summary") return visible.has(row.ownerId);
    if (row.ownerType !== "character_timeline" && row.ownerType !== "consistency_fact") return true;
    try {
      const metadata = JSON.parse(row.metadataJson ?? "null") as { chapterId?: string; source?: string } | null;
      return metadata?.source !== "author_adjust" && !!metadata?.chapterId && visible.has(metadata.chapterId);
    } catch {
      return false;
    }
  });
}
