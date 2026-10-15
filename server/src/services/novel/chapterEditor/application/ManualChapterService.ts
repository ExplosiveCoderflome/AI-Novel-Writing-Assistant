import type { Chapter } from "@prisma/client";
import type { ChapterInput } from "../../novelCoreShared";
import type { NovelVolumeService } from "../../volume/NovelVolumeService";
import { queueRagDelete, queueRagUpsert } from "../../novelCoreSupport";
import { ManualChapterStore } from "../persistence/ManualChapterStore";

/** Manual editing has its own contract; it does not advance production state. */
export class ManualChapterService {
  private readonly store = new ManualChapterStore();

  constructor(private readonly volumes: Pick<NovelVolumeService, "mirrorChapterIntoWorkspace">) {}

  async createChapter(novelId: string, input: ChapterInput) {
    const chapter = await this.store.createChapter(novelId, input);
    await this.synchronizeSavedChapter(chapter);
    return chapter;
  }

  async updateChapter(novelId: string, chapterId: string, input: Partial<ChapterInput>) {
    const chapter = await this.store.updateChapter(novelId, chapterId, input);
    await this.synchronizeSavedChapter(chapter);
    return chapter;
  }

  async deleteChapter(novelId: string, chapterId: string) {
    await this.store.deleteChapter(novelId, chapterId);
    queueRagDelete("chapter", chapterId);
    queueRagDelete("chapter_summary", chapterId);
  }

  private async synchronizeSavedChapter(chapter: Chapter) {
    await this.volumes.mirrorChapterIntoWorkspace(chapter.novelId, {
      id: chapter.id,
      order: chapter.order,
      title: chapter.title,
      expectation: chapter.expectation,
      targetWordCount: chapter.targetWordCount,
      conflictLevel: chapter.conflictLevel,
      revealLevel: chapter.revealLevel,
      mustAvoid: chapter.mustAvoid,
      taskSheet: chapter.taskSheet,
      sceneCards: chapter.sceneCards,
    }).catch(() => null);
    queueRagUpsert("chapter", chapter.id);
  }
}
