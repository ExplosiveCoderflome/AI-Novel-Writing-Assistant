import { prisma } from "../../db/prisma";
import { briefSummary, extractCharacterEventLines, extractFacts } from "./novelCoreShared";
import { queueRagUpsert } from "./novelCoreSupport";
import { chapterArtifactBackgroundSyncService } from "./runtime/ChapterArtifactBackgroundSyncService";

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

  await prisma.$transaction(async (tx) => {
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
  });

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

  await prisma.$transaction(async (tx) => {
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
  });

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
