import { extractCharacterEventLines } from "../../novelCoreShared";
import { queueRagUpsert } from "../../novelCoreSupport";
import { chapterArtifactBackgroundSyncService } from "../../runtime/ChapterArtifactBackgroundSyncService";
import { projectManualChapterArtifacts } from "../domain/manualChapterArtifacts";
import { ChapterArtifactProjectionStore } from "../persistence/ChapterArtifactProjectionStore";

const store = new ChapterArtifactProjectionStore();

export async function syncCharacterTimelineForChapter(novelId: string, chapterId: string, content: string) {
  const { chapter, characters } = await store.readCharacterSources(novelId, chapterId);
  if (!chapter || !characters.length) return;
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

  const timelines = await store.replaceCharacterTimeline(novelId, chapterId, content, events);
  for (const timeline of timelines) queueRagUpsert("character_timeline", timeline.id);
}

export async function syncChapterArtifacts(
  novelId: string, chapterId: string, content: string, options: { scheduleBackgroundSync?: boolean } = {},
) {
  const facts = await store.replaceSummaryAndFacts(novelId, chapterId, content, projectManualChapterArtifacts(content));
  if (!facts) return;
  await syncCharacterTimelineForChapter(novelId, chapterId, content);
  if (options.scheduleBackgroundSync !== false) {
    chapterArtifactBackgroundSyncService.scheduleChapterSync(novelId, chapterId, content);
  }
  queueRagUpsert("chapter", chapterId);
  queueRagUpsert("chapter_summary", chapterId);
  queueRagUpsert("novel", novelId);
  for (const fact of facts) queueRagUpsert("consistency_fact", fact.id);
}
