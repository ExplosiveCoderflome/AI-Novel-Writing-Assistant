import type { Prisma } from "@prisma/client";
import { prisma } from "../../../../db/prisma";
import { withSqliteRetry } from "../../../../db/sqliteRetry";
import type { ManualChapterArtifacts } from "../domain/manualChapterArtifacts";

async function lockCurrentContent(tx: Prisma.TransactionClient, novelId: string, chapterId: string, content: string) {
  const current = await tx.chapter.findFirst({
    where: { id: chapterId, novelId, content }, select: { updatedAt: true },
  });
  if (!current) return false;
  const result = await tx.chapter.updateMany({
    where: { id: chapterId, novelId, content, updatedAt: current.updatedAt },
    data: { updatedAt: current.updatedAt },
  });
  return result.count === 1;
}

/** Replaces derived rows only while their source body is still current. */
export class ChapterArtifactProjectionStore {
  async readCharacterSources(novelId: string, chapterId: string) {
    const [chapter, characters] = await Promise.all([
      prisma.chapter.findFirst({ where: { id: chapterId, novelId }, select: { order: true, title: true } }),
      prisma.character.findMany({ where: { novelId }, select: { id: true, name: true } }),
    ]);
    return { chapter, characters };
  }

  replaceCharacterTimeline(novelId: string, chapterId: string, content: string, events: Prisma.CharacterTimelineCreateManyInput[]) {
    return withSqliteRetry(() => prisma.$transaction(async (tx) => {
      if (!await lockCurrentContent(tx, novelId, chapterId, content)) return [];
      await tx.characterTimeline.deleteMany({ where: { novelId, chapterId, source: "chapter_extract" } });
      if (events.length) await tx.characterTimeline.createMany({ data: events });
      return tx.characterTimeline.findMany({
        where: { novelId, chapterId, source: "chapter_extract" }, select: { id: true },
      });
    }), { label: "novelChapterArtifacts.characterTimeline" });
  }

  replaceSummaryAndFacts(novelId: string, chapterId: string, content: string, projection: ManualChapterArtifacts) {
    return withSqliteRetry(() => prisma.$transaction(async (tx) => {
      if (!await lockCurrentContent(tx, novelId, chapterId, content)) return null;
      const { facts, ...summary } = projection;
      await tx.chapterSummary.upsert({
        where: { chapterId }, update: summary, create: { novelId, chapterId, ...summary },
      });
      await tx.consistencyFact.deleteMany({ where: { novelId, chapterId } });
      if (facts.length) {
        await tx.consistencyFact.createMany({
          data: facts.map((item) => ({ novelId, chapterId, category: item.category,
            content: item.content, source: "chapter_auto_extract" })),
        });
      }
      return tx.consistencyFact.findMany({ where: { novelId, chapterId }, select: { id: true } });
    }), { label: "novelChapterArtifacts.summaryAndFacts" });
  }
}
