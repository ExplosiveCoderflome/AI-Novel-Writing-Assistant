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
const MAX_FAILED_ATTEMPTS = 2;

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
      let retryMetadata = metadata;
      if (existing.status === "failed") {
        try {
          const metadata = existing.metadataJson ? JSON.parse(existing.metadataJson) as Record<string, unknown> : {};
          if (Number(metadata.attemptCount ?? 0) >= MAX_FAILED_ATTEMPTS) {
            return "already_done";
          }
          retryMetadata = { ...metadata, ...retryMetadata, attemptCount: Number(metadata.attemptCount ?? 0) + 1 };
        } catch {
          return "already_done";
        }
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
          metadataJson: JSON.stringify(retryMetadata),
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
          attemptCount: await this.readAttemptCount(identity),
          reason: error instanceof Error ? error.message : String(error),
        }),
        updatedAt: new Date(),
      },
    });
  }

  private async readAttemptCount(identity: ChapterArtifactCheckpointIdentity): Promise<number> {
    const row = await this.read(identity).catch(() => null);
    if (!row?.metadataJson) return 1;
    try {
      const metadata = JSON.parse(row.metadataJson) as Record<string, unknown>;
      return Number(metadata.attemptCount ?? 0) + 1;
    } catch {
      return 1;
    }
  }

  private uniqueWhere(identity: ChapterArtifactCheckpointIdentity) {
    return {
      novelId_chapterId_contentHash_artifactType_syncMode: identity,
    };
  }
}
