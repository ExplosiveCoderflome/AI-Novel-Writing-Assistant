import { randomUUID } from "node:crypto";
import { prisma } from "../../../../db/prisma";

/** Serialize revisions of one chapter across workers; a later revision must apply last. */
export async function claimManualChapterSyncLease(novelId: string, chapterId: string) {
  const identity = { novelId, chapterId, contentHash: "chapter", artifactType: "manual_chapter_sync_lease:v1", syncMode: "manual" };
  const metadataJson = JSON.stringify({ owner: randomUUID() });
  try {
    await prisma.chapterArtifactSyncCheckpoint.create({ data: { ...identity, status: "running", metadataJson } });
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "P2002")) throw error;
    const claimed = await prisma.chapterArtifactSyncCheckpoint.updateMany({ where: { ...identity,
      OR: [{ status: "idle" }, { updatedAt: { lt: new Date(Date.now() - 15 * 60_000) } }] },
      data: { status: "running", metadataJson, updatedAt: new Date() } });
    if (!claimed.count) return null;
  }
  const heartbeat = setInterval(() => {
    void prisma.chapterArtifactSyncCheckpoint.updateMany({ where: { ...identity, metadataJson, status: "running" },
      data: { updatedAt: new Date() } }).catch(() => {});
  }, 30_000);
  heartbeat.unref();
  return async () => {
    clearInterval(heartbeat);
    await prisma.chapterArtifactSyncCheckpoint.updateMany({ where: { ...identity, metadataJson }, data: { status: "idle" } });
  };
}
