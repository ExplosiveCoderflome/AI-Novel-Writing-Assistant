import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../../../db/prisma";
import { NovelSideEffectJobService } from "../../../../events/sideEffects/queue";
import { buildChapterArtifactContentHash } from "../../runtime/artifactSync/ChapterArtifactContentVersion";
import { CHAPTER_ARTIFACT_BOUNDARY_TYPE } from "../../runtime/artifactSync/ChapterArtifactSyncBoundary";

export const MANUAL_CHAPTER_SYNC_TYPE = "manual_chapter_sync:v1";
export interface ManualChapterSyncPayload {
  novelId: string;
  chapterId: string;
  contentHash: string;
  revision: string;
}

/** The body and the obligation to refresh its derived assets commit together. */
export async function queueManualChapterSync(tx: Prisma.TransactionClient, chapter: {
  id: string; novelId: string; content: string | null;
}): Promise<ManualChapterSyncPayload> {
  const payload = { novelId: chapter.novelId, chapterId: chapter.id,
    contentHash: buildChapterArtifactContentHash(chapter.content ?? ""), revision: randomUUID() };
  const identity = { novelId: payload.novelId, chapterId: payload.chapterId,
    contentHash: payload.contentHash, artifactType: MANUAL_CHAPTER_SYNC_TYPE, syncMode: "manual" };
  await tx.chapterArtifactSyncCheckpoint.upsert({
    where: { novelId_chapterId_contentHash_artifactType_syncMode: identity },
    create: { ...identity, status: "pending", sourceType: "manual_chapter_save", metadataJson: JSON.stringify(payload) },
    update: { status: "pending", metadataJson: JSON.stringify(payload), updatedAt: new Date() },
  });
  // Returning to an earlier text still requires reapplying its assets. Preserve historical rows.
  await tx.chapterArtifactSyncCheckpoint.updateMany({
    where: { novelId: payload.novelId, chapterId: payload.chapterId, contentHash: payload.contentHash,
      artifactType: CHAPTER_ARTIFACT_BOUNDARY_TYPE, status: "succeeded" },
    data: { status: "superseded" },
  });
  await new NovelSideEffectJobService({ db: tx }).enqueueJob({
    novelId: payload.novelId, jobType: "chapter.manualSync", payload,
    idempotencyKey: `chapter.manualSync:${payload.chapterId}:${payload.revision}`,
  });
  return payload;
}

export function readManualChapterSync(novelId: string, chapterId: string, content: string) {
  return prisma.chapterArtifactSyncCheckpoint.findUnique({ where: {
    novelId_chapterId_contentHash_artifactType_syncMode: { novelId, chapterId,
      contentHash: buildChapterArtifactContentHash(content), artifactType: MANUAL_CHAPTER_SYNC_TYPE, syncMode: "manual" },
  } });
}
