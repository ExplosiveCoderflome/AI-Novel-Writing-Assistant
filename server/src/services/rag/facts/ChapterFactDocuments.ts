import { prisma } from "../../../db/prisma";
import { loadCurrentChapterArtifactFacts, buildChapterArtifactContentHash } from "../../novel/runtime/artifactSync/facts";
import type { RagSearchOptions, RagSourceDocument, RetrievedChunk } from "../types";

export async function loadVersionedChapterSummaryDocuments(
  chapterId: string, tenantId: string, summary: { summary: string },
): Promise<RagSourceDocument[] | null> {
  const projection = await loadCurrentChapterArtifactFacts(chapterId);
  if (projection === null) return null;
  if (!projection.chapter || !projection.summary || projection.summary !== summary.summary.trim()) return [];
  const preChunks = [
    {chunkText: projection.summary, metadata: {artifactKind: "summary"}},
    ...projection.facts.map(fact => ({chunkText: fact.text, metadata: {artifactKind: "fact", category: fact.category}})),
  ];
  return [{ownerType: "chapter_summary", ownerId: chapterId, tenantId,
    novelId: projection.chapter.novelId, title: projection.chapter.title,
    content: preChunks.map(chunk => chunk.chunkText).join("\n"), preChunks,
    metadata: {chapterArtifactVersion: 1, chapterId, chapterOrder: projection.chapter.order,
      chapterContentHash: projection.contentHash},
  }];
}

function artifactMetadata(chunk: RetrievedChunk): Record<string, unknown> | null {
  if ((chunk.ownerType !== "chapter_summary" && chunk.ownerType !== "chapter") || !chunk.metadataJson) return null;
  try {
    const metadata = JSON.parse(chunk.metadataJson);
    return metadata?.chapterArtifactVersion === 1 ? metadata : null;
  } catch { return null; }
}

/** Version validation precedes fusion so stale hits cannot occupy the topK budget. */
export async function filterCurrentArtifactChunks(chunks: RetrievedChunk[], options: RagSearchOptions): Promise<RetrievedChunk[]> {
  const versioned = chunks.filter(chunk => artifactMetadata(chunk));
  if (versioned.length === 0) return chunks;
  const rows = await prisma.chapter.findMany({
    where: {id: {in: [...new Set(versioned.map(chunk => chunk.ownerId))]},
      ...(options.novelId ? {novelId: options.novelId} : {})},
    select: {id: true, novelId: true, order: true, content: true},
  });
  const chapters = new Map(rows.map(row => [row.id, row]));
  return chunks.filter(chunk => {
    const metadata = artifactMetadata(chunk);
    if (!metadata) return true;
    const chapter = chapters.get(chunk.ownerId);
    return Boolean(chapter && chunk.novelId === chapter.novelId && metadata.chapterId === chapter.id
      && metadata.chapterOrder === chapter.order
      && (options.currentChapterOrder == null || chapter.order < options.currentChapterOrder)
      && metadata.chapterContentHash === buildChapterArtifactContentHash(chapter.content ?? ""));
  });
}
