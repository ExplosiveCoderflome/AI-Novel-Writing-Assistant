import type { Prisma } from "@prisma/client";
import { prisma } from "../../../db/prisma";
import { PrismaTimelineRepository } from "../timeline.repository";
import { StoryTimelineService } from "../timeline.service";
import { buildTimelineContentHash as hashContent, supersedeChapterTimeline, withCurrentTimelineContent } from "./chapterVersion";
import { TIMELINE_FINALIZATION_RUNNING_STALE_MS, type ChapterTimelineFinalizationMode } from "../domain/finalizationPolicy";

type TimelineFinalizationClaimStatus = "claimed" | "already_done" | "running";
type ContentVersion = { novelId: string; chapterId: string; content: string };
type Checkpoint = {
  novelId: string; chapterId: string; contentHash: string;
  syncMode: ChapterTimelineFinalizationMode; sourceStage: string; metadata: Record<string, unknown>;
};

/** Owns checkpoint claims and atomic, body-fenced timeline commits. Never invokes AI. */
export class TimelineFinalizationStore {
  findChapter(novelId: string, chapterId: string) {
    return prisma.chapter.findFirst({
      where: { id: chapterId, novelId }, select: { id: true, content: true, order: true },
    });
  }

  listPendingEarlierChapters(novelId: string, chapterOrder: number) {
    return prisma.chapterArtifactSyncCheckpoint.findMany({
      where: { novelId, artifactType: "timeline_finalization", syncMode: "manual_pending",
        status: "pending", chapter: { order: { lt: chapterOrder } } },
      select: { chapter: { select: { id: true, content: true } } },
      orderBy: { chapter: { order: "asc" } },
    });
  }

  findPreviousChapter(novelId: string, currentChapterOrder: number) {
    return prisma.chapter.findFirst({
      where: { novelId, order: currentChapterOrder - 1, content: { not: null } },
      select: { id: true, title: true, order: true, content: true, expectation: true },
    });
  }

  findNovelTitle(novelId: string) {
    return prisma.novel.findUnique({ where: { id: novelId }, select: { title: true } });
  }

  commitStable(input: {
    version: ContentVersion;
    timeline: Parameters<StoryTimelineService["commitChapterTimeline"]>[0];
    checkpoint: Checkpoint;
  }) {
    return withCurrentTimelineContent(input.version, async (db) => {
      await supersedeChapterTimeline(db, input.version);
      await new StoryTimelineService(new PrismaTimelineRepository(db)).commitChapterTimeline(input.timeline);
      await this.markCheckpoint(input.checkpoint, db);
    });
  }

  commitDegraded(input: {
    version: ContentVersion;
    anchor: Parameters<PrismaTimelineRepository["upsertChapterTimeAnchor"]>[0];
    expireOverdueHooks: boolean;
    checkpoint: Checkpoint;
  }) {
    return withCurrentTimelineContent(input.version, async (db) => {
      await supersedeChapterTimeline(db, input.version);
      const repository = new PrismaTimelineRepository(db);
      await repository.upsertChapterTimeAnchor(input.anchor);
      if (input.expireOverdueHooks) {
        await repository.expireOverdueImmediateHooks({
          novelId: input.version.novelId, chapterId: input.version.chapterId,
          chapterIndex: input.anchor.chapterIndex,
        });
      }
      await this.markCheckpoint(input.checkpoint, db);
    });
  }

  async findCurrentFinalizationMode(input: {
    novelId: string;
    chapterId: string;
    content: string;
  }): Promise<ChapterTimelineFinalizationMode | null> {
    const contentHash = hashContent(input.content.trim());
    const row = await prisma.chapterArtifactSyncCheckpoint.findFirst({
      where: {
        novelId: input.novelId,
        chapterId: input.chapterId,
        contentHash,
        artifactType: "timeline_finalization",
        syncMode: { in: ["stable", "degraded"] },
        status: "succeeded",
      },
      orderBy: [
        { syncMode: "desc" },
        { updatedAt: "desc" },
      ],
      select: { syncMode: true },
    });
    return row?.syncMode === "stable" || row?.syncMode === "degraded" ? row.syncMode : null;
  }

  async resolveChapterOrder(chapterId: string): Promise<number> {
    const chapter = await prisma.chapter.findUnique({
      where: { id: chapterId },
      select: { order: true },
    });
    return chapter?.order ?? 0;
  }

  private async markCheckpoint(input: {
    novelId: string;
    chapterId: string;
    contentHash: string;
    syncMode: ChapterTimelineFinalizationMode;
    sourceStage: string;
    metadata: Record<string, unknown>;
  }, db: Prisma.TransactionClient = prisma): Promise<void> {
    await db.chapterArtifactSyncCheckpoint.upsert({
      where: {
        novelId_chapterId_contentHash_artifactType_syncMode: {
          novelId: input.novelId,
          chapterId: input.chapterId,
          contentHash: input.contentHash,
          artifactType: "timeline_finalization",
          syncMode: input.syncMode,
        },
      },
      create: {
        novelId: input.novelId,
        chapterId: input.chapterId,
        contentHash: input.contentHash,
        artifactType: "timeline_finalization",
        syncMode: input.syncMode,
        status: "succeeded",
        sourceType: "chapter_runtime",
        sourceStage: input.sourceStage,
        metadataJson: JSON.stringify(input.metadata),
      },
      update: {
        status: "succeeded",
        sourceType: "chapter_runtime",
        sourceStage: input.sourceStage,
        metadataJson: JSON.stringify(input.metadata),
        updatedAt: new Date(),
      },
    });
    await db.chapterArtifactSyncCheckpoint.updateMany({
      where: { novelId: input.novelId, chapterId: input.chapterId, contentHash: input.contentHash,
        artifactType: "timeline_finalization", syncMode: "manual_pending", status: "pending" },
      data: { status: "succeeded" },
    });
  }

  async claimCheckpoint(input: {
    novelId: string;
    chapterId: string;
    contentHash: string;
    syncMode: ChapterTimelineFinalizationMode;
    sourceStage: string;
    metadata: Record<string, unknown>;
  }): Promise<TimelineFinalizationClaimStatus> {
    const where = {
      novelId_chapterId_contentHash_artifactType_syncMode: {
        novelId: input.novelId,
        chapterId: input.chapterId,
        contentHash: input.contentHash,
        artifactType: "timeline_finalization",
        syncMode: input.syncMode,
      },
    };
    const metadataJson = JSON.stringify(input.metadata);
    try {
      await prisma.chapterArtifactSyncCheckpoint.create({
        data: {
          novelId: input.novelId,
          chapterId: input.chapterId,
          contentHash: input.contentHash,
          artifactType: "timeline_finalization",
          syncMode: input.syncMode,
          status: "running",
          sourceType: "chapter_runtime",
          sourceStage: input.sourceStage,
          metadataJson,
        },
      });
      return "claimed";
    } catch (error) {
      if (!error || typeof error !== "object" || !("code" in error) || error.code !== "P2002") throw error;
      const existing = await prisma.chapterArtifactSyncCheckpoint.findUnique({
        where,
        select: { status: true, updatedAt: true },
      });
      if (existing?.status === "succeeded") {
        return "already_done";
      }
      const staleBefore = new Date(Date.now() - TIMELINE_FINALIZATION_RUNNING_STALE_MS);
      if (existing?.status === "running" && existing.updatedAt > staleBefore) {
        return "running";
      }
      const claimed = await prisma.chapterArtifactSyncCheckpoint.updateMany({
        where: {
          novelId: input.novelId,
          chapterId: input.chapterId,
          contentHash: input.contentHash,
          artifactType: "timeline_finalization",
          syncMode: input.syncMode,
          OR: [
            { status: { notIn: ["running", "succeeded"] } },
            { status: "running", updatedAt: { lt: staleBefore } },
          ],
        },
        data: {
          status: "running",
          sourceType: "chapter_runtime",
          sourceStage: input.sourceStage,
          metadataJson,
          updatedAt: new Date(),
        },
      });
      return claimed.count > 0 ? "claimed" : "running";
    }
  }

  async markCheckpointFailed(input: {
    novelId: string;
    chapterId: string;
    contentHash: string;
    syncMode: ChapterTimelineFinalizationMode;
    sourceStage: string;
    metadata: Record<string, unknown>;
  }): Promise<void> {
    await prisma.chapterArtifactSyncCheckpoint.updateMany({
      where: {
        novelId: input.novelId,
        chapterId: input.chapterId,
        contentHash: input.contentHash,
        artifactType: "timeline_finalization",
        syncMode: input.syncMode,
        status: "running",
      },
      data: {
        status: "failed",
        sourceType: "chapter_runtime",
        sourceStage: input.sourceStage,
        metadataJson: JSON.stringify(input.metadata),
        updatedAt: new Date(),
      },
    });
  }
}
