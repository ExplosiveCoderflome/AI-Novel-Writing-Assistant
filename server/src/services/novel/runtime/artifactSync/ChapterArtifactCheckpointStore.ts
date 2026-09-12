import { prisma } from "../../../../db/prisma";

export type ChapterArtifactCheckpointClaim = "claimed" | "already_done" | "running";

export interface ChapterArtifactCheckpointIdentity {
  novelId: string;
  chapterId: string;
  contentHash: string;
  artifactType: string;
  syncMode: string;
}

export interface ChapterArtifactCheckpointRecord {
  status: string;
  metadataJson: string | null;
  updatedAt: Date;
}

const RUNNING_STALE_MS = 15 * 60 * 1000;

export class ChapterArtifactCheckpointStore {
  async read(identity: ChapterArtifactCheckpointIdentity): Promise<ChapterArtifactCheckpointRecord | null> {
    return prisma.chapterArtifactSyncCheckpoint.findUnique({
      where: this.uniqueWhere(identity),
      select: { status: true, metadataJson: true, updatedAt: true },
    });
  }

  async claim(
    identity: ChapterArtifactCheckpointIdentity,
    metadata: Record<string, unknown> = {},
  ): Promise<ChapterArtifactCheckpointClaim> {
    try {
      await prisma.chapterArtifactSyncCheckpoint.create({
        data: {
          ...identity,
          status: "running",
          sourceType: "chapter_background_sync",
          sourceStage: "chapter_execution",
          metadataJson: JSON.stringify(metadata),
        },
      });
      return "claimed";
    } catch (createError) {
      const existing = await this.read(identity).catch(() => null);
      if (!existing) {
        throw createError;
      }
      if (existing.status === "succeeded") {
        return "already_done";
      }
      const staleBefore = new Date(Date.now() - RUNNING_STALE_MS);
      if (existing.status === "running" && existing.updatedAt > staleBefore) {
        return "running";
      }
      const claimed = await prisma.chapterArtifactSyncCheckpoint.updateMany({
        where: {
          ...identity,
          OR: [
            { status: { not: "running" } },
            { updatedAt: { lt: staleBefore } },
          ],
        },
        data: {
          status: "running",
          sourceType: "chapter_background_sync",
          sourceStage: "chapter_execution",
          metadataJson: JSON.stringify(metadata),
          updatedAt: new Date(),
        },
      });
      return claimed.count > 0 ? "claimed" : "running";
    }
  }

  async succeed(
    identity: ChapterArtifactCheckpointIdentity,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await prisma.chapterArtifactSyncCheckpoint.upsert({
      where: this.uniqueWhere(identity),
      create: {
        ...identity,
        status: "succeeded",
        sourceType: "chapter_background_sync",
        sourceStage: "chapter_execution",
        metadataJson: JSON.stringify(metadata),
      },
      update: {
        status: "succeeded",
        sourceType: "chapter_background_sync",
        sourceStage: "chapter_execution",
        metadataJson: JSON.stringify(metadata),
        updatedAt: new Date(),
      },
    });
  }

  async fail(
    identity: ChapterArtifactCheckpointIdentity,
    error: unknown,
  ): Promise<void> {
    await prisma.chapterArtifactSyncCheckpoint.updateMany({
      where: { ...identity, status: "running" },
      data: {
        status: "failed",
        metadataJson: JSON.stringify({
          reason: error instanceof Error ? error.message : String(error),
        }),
        updatedAt: new Date(),
      },
    });
  }

  private uniqueWhere(identity: ChapterArtifactCheckpointIdentity) {
    return {
      novelId_chapterId_contentHash_artifactType_syncMode: identity,
    };
  }
}
