import { prisma } from "../../../../../db/prisma";
import { buildChapterArtifactContentHash } from "../ChapterArtifactContentVersion";

interface ArtifactFact { text: string; category: "completed" | "revealed" | "state_changed" }

/** null means legacy ownership; a V2 result without an output is an invalidated version. */
export async function loadCurrentChapterArtifactFacts(chapterId: string) {
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    select: { id: true, novelId: true, order: true, title: true, content: true,
      novel: { select: { directorVersion: true } } },
  });
  if (!chapter) return { chapter: null, contentHash: "", summary: null, facts: [] as ArtifactFact[] };
  if (chapter.novel.directorVersion !== "v2") return null;
  const contentHash = buildChapterArtifactContentHash(chapter.content ?? "");
  const checkpoint = await prisma.chapterArtifactSyncCheckpoint.findFirst({
    where: { novelId: chapter.novelId, chapterId, contentHash,
      artifactType: "artifact_delta_extraction:v1", status: "succeeded" },
    orderBy: { updatedAt: "desc" }, select: { metadataJson: true },
  });
  if (!checkpoint) return { chapter, contentHash, summary: null, facts: [] as ArtifactFact[] };
  const metadata = JSON.parse(checkpoint.metadataJson ?? "null");
  const output = metadata?.output;
  if (metadata?.schemaVersion !== 1 || typeof output?.summary !== "string" || !Array.isArray(output?.concreteFacts)) {
    throw new Error("章节事实检查点缺少有效的统一抽取结果。");
  }
  const rows = await prisma.novelFactEntry.findMany({
    where: { novelId: chapter.novelId, chapterOrder: chapter.order }, select: { text: true, category: true },
  });
  const committed = new Set(rows.map(row => `${row.category}\0${row.text.replace(/\s+/g, " ").trim()}`));
  const facts: ArtifactFact[] = [];
  const seen = new Set<string>();
  for (const fact of output.concreteFacts) {
    if (typeof fact?.text !== "string" || !["completed", "revealed", "state_changed"].includes(fact.category)) {
      throw new Error("章节事实检查点包含无效事实。");
    }
    const text = fact.text.replace(/\s+/g, " ").trim();
    const key = `${fact.category}\0${text}`;
    if (text && committed.has(key) && !seen.has(key)) {
      facts.push({text, category: fact.category});
      seen.add(key);
    }
  }
  return { chapter, contentHash, summary: output.summary.replace(/\s+/g, " ").trim() as string, facts };
}
