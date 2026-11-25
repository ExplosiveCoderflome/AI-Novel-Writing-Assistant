import type { Prisma } from "@prisma/client";
import type { OutlineBookMapping } from "@ai-novel/shared/types/outlineOpenBook";

export async function readWrittenChapterIds(db: Prisma.TransactionClient, projectId: string): Promise<string[]> {
  const binding = await db.outlineBookBinding.findUnique({where: {projectId}, select: {novelId: true, mappingJson: true}});
  if (!binding) return [];
  const {chapters} = JSON.parse(binding.mappingJson) as OutlineBookMapping;
  const written = await db.chapter.findMany({
    where: {novelId: binding.novelId, content: {not: ""}},
    select: {id: true, order: true},
  });
  const ids = new Set(written.map(row => row.id));
  const orders = new Set(written.map(row => row.order));
  return chapters.filter(link => ids.has(link.chapterId) || orders.has(link.chapterOrder)).map(link => link.nodeId);
}
