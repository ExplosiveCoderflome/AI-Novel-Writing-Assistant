import type { Prisma } from "@prisma/client";
import { NovelSideEffectJobService } from "../../../events/sideEffects/queue";
import { buildTimelineContentHash, supersedeChapterTimeline } from "../persistence/chapterVersion";

/** Called inside the same transaction that saves user text. No model calls on the save path. */
export async function queueManualChapterTimeline(
  db: Prisma.TransactionClient,
  chapter: { id: string; novelId: string; content: string | null; updatedAt: Date },
): Promise<void> {
  const input = { novelId: chapter.novelId, chapterId: chapter.id };
  const contentHash = buildTimelineContentHash(chapter.content ?? "");
  await supersedeChapterTimeline(db, input);
  await db.chapterTimeAnchor.updateMany({
    where: input,
    data: { storyDayIndex: null, timeLabel: "待按正文同步", endedWithIdsJson: "[]", nextHookIdsJson: "[]" },
  });
  await db.chapterArtifactSyncCheckpoint.updateMany({
    where: { ...input, artifactType: "timeline_finalization" },
    data: { status: "stale" },
  });
  await db.chapterArtifactSyncCheckpoint.upsert({
    where: { novelId_chapterId_contentHash_artifactType_syncMode: {
      ...input, contentHash, artifactType: "timeline_finalization", syncMode: "manual_pending",
    } },
    create: { ...input, contentHash, artifactType: "timeline_finalization", syncMode: "manual_pending",
      status: "pending", sourceType: "manual_edit", sourceStage: "chapter_save" },
    update: { status: "pending", updatedAt: new Date() },
  });
  await new NovelSideEffectJobService({ db }).enqueueJob({
    novelId: chapter.novelId,
    jobType: "chapter.timelineFinalization",
    idempotencyKey: `chapter.timelineFinalization:${chapter.id}:${chapter.updatedAt.toISOString()}`,
    payload: { novelId: chapter.novelId, chapterId: chapter.id, contentHash },
  });
}
