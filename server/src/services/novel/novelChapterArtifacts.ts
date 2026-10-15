import type { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { withSqliteRetry } from "../../db/sqliteRetry";
import { briefSummary, extractCharacterEventLines, extractFacts } from "./novelCoreShared";
import { queueRagUpsert } from "./novelCoreSupport";
import { chapterArtifactBackgroundSyncService } from "./runtime/ChapterArtifactBackgroundSyncService";

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

export async function syncCharacterTimelineForChapter(novelId: string, chapterId: string, content: string) {
  const [chapter, characters] = await Promise.all([
    prisma.chapter.findFirst({
      where: { id: chapterId, novelId },
      select: { order: true, title: true },
    }),
    prisma.character.findMany({
      where: { novelId },
      select: { id: true, name: true },
    }),
  ]);

  if (!chapter || characters.length === 0) {
    return;
  }

  const events: Array<{
    novelId: string;
    characterId: string;
    chapterId: string;
    chapterOrder: number;
    title: string;
    content: string;
    source: string;
  }> = [];

  for (const character of characters) {
    const lines = extractCharacterEventLines(content, character.name, 3);
    for (const line of lines) {
      events.push({
        novelId,
        characterId: character.id,
        chapterId,
        chapterOrder: chapter.order,
        title: `${chapter.order} · ${chapter.title}`,
        content: line,
        source: "chapter_extract",
      });
    }
  }

  await withSqliteRetry(
    () => prisma.$transaction(async (tx) => {
      if (!await lockCurrentContent(tx, novelId, chapterId, content)) return;
      await tx.characterTimeline.deleteMany({
        where: {
          novelId,
          chapterId,
          source: "chapter_extract",
        },
      });
      if (events.length > 0) {
        await tx.characterTimeline.createMany({ data: events });
      }
    }),
    { label: "novelChapterArtifacts.characterTimeline" },
  );

  const timelines = await prisma.characterTimeline.findMany({
    where: {
      novelId,
      chapterId,
      source: "chapter_extract",
    },
    select: { id: true },
  });

  for (const timeline of timelines) {
    queueRagUpsert("character_timeline", timeline.id);
  }
}

export async function syncChapterArtifacts(novelId: string, chapterId: string, content: string) {
  const facts = extractFacts(content);
  const summary = briefSummary(content, facts);

  const synced = await withSqliteRetry(
    () => prisma.$transaction(async (tx) => {
      if (!await lockCurrentContent(tx, novelId, chapterId, content)) return false;
      await tx.chapterSummary.upsert({
        where: { chapterId },
        update: {
          summary,
          keyEvents: facts.map((item) => item.content).slice(0, 3).join(""),
          characterStates: facts
            .filter((item) => item.category === "character")
            .map((item) => item.content)
            .slice(0, 3)
            .join(""),
        },
        create: {
          novelId,
          chapterId,
          summary,
          keyEvents: facts.map((item) => item.content).slice(0, 3).join(""),
          characterStates: facts
            .filter((item) => item.category === "character")
            .map((item) => item.content)
            .slice(0, 3)
            .join(""),
        },
      });

      await tx.consistencyFact.deleteMany({ where: { novelId, chapterId } });
      if (facts.length > 0) {
        await tx.consistencyFact.createMany({
          data: facts.map((item) => ({
            novelId,
            chapterId,
            category: item.category,
            content: item.content,
            source: "chapter_auto_extract",
          })),
        });
      }
      return true;
    }),
    { label: "novelChapterArtifacts.summaryAndFacts" },
  );
  if (!synced) return;

  await syncCharacterTimelineForChapter(novelId, chapterId, content);
  chapterArtifactBackgroundSyncService.scheduleChapterSync(novelId, chapterId, content);

  queueRagUpsert("chapter", chapterId);
  queueRagUpsert("chapter_summary", chapterId);
  queueRagUpsert("novel", novelId);

  const factRows = await prisma.consistencyFact.findMany({
    where: { novelId, chapterId },
    select: { id: true },
  });
  for (const fact of factRows) {
    queueRagUpsert("consistency_fact", fact.id);
  }

}
