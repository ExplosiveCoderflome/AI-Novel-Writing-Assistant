import type { RagOwnerType } from "../../rag/types";
import { prisma } from "../../../db/prisma";
import { ragServices } from "../../rag";
import { briefSummary, extractFacts } from "../novelP0Utils";
import { chapterArtifactBackgroundSyncService } from "./ChapterArtifactBackgroundSyncService";

export class ChapterArtifactSyncService {
  async saveDraftAndArtifacts(
    novelId: string,
    chapterId: string,
    content: string,
    generationState: "drafted" | "repaired",
  ): Promise<void> {
    await prisma.chapter.update({
      where: { id: chapterId },
      data: {
        content,
        generationState,
        chapterStatus: "generating",
      },
    });
    await this.syncChapterArtifacts(novelId, chapterId, content);
  }

  private async syncChapterArtifacts(novelId: string, chapterId: string, content: string): Promise<void> {
    const facts = extractFacts(content);
    const summary = briefSummary(content, facts);

    await prisma.$transaction(async (tx) => {
      await tx.chapterSummary.upsert({
        where: { chapterId },
        update: {
          summary,
          keyEvents: facts.map((item) => item.content).slice(0, 3).join(""),
          characterStates: facts.filter((item) => item.category === "character").map((item) => item.content).slice(0, 3).join(""),
        },
        create: {
          novelId,
          chapterId,
          summary,
          keyEvents: facts.map((item) => item.content).slice(0, 3).join(""),
          characterStates: facts.filter((item) => item.category === "character").map((item) => item.content).slice(0, 3).join(""),
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

    await this.syncCharacterTimelineForChapter(novelId, chapterId, content);
    chapterArtifactBackgroundSyncService.scheduleChapterSync(novelId, chapterId, content);
    this.queueRagUpsert("chapter", chapterId);
    this.queueRagUpsert("chapter_summary", chapterId);
    this.queueRagUpsert("novel", novelId);

    const factRows = await prisma.consistencyFact.findMany({
      where: { novelId, chapterId },
      select: { id: true },
    });
    for (const fact of factRows) {
      this.queueRagUpsert("consistency_fact", fact.id);
    }

  }

  private async syncCharacterTimelineForChapter(novelId: string, chapterId: string, content: string): Promise<void> {
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
      const lines = content
        .split(/[\n。！？!?]/)
        .map((item) => item.trim())
        .filter((item) => item.length >= 8 && item.includes(character.name))
        .slice(0, 3);
      for (const line of lines) {
        events.push({
          novelId,
          characterId: character.id,
          chapterId,
          chapterOrder: chapter.order,
          title: `${chapter.order} - ${chapter.title}`,
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
      this.queueRagUpsert("character_timeline", timeline.id);
    }
  }

  private queueRagUpsert(ownerType: RagOwnerType, ownerId: string): void {
    void ragServices.ragIndexService.enqueueUpsert(ownerType, ownerId).catch(() => {});
  }
}
