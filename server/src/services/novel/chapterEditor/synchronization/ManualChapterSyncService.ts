import { randomUUID } from "node:crypto";
import { claimManualChapterSyncLease } from "./ManualChapterSyncLease";
import { syncChapterArtifacts } from "../application/ChapterArtifactProjectionService";
import type { RunContract } from "../../../../modules/director";
import { prisma } from "../../../../db/prisma";
import { readRunExecutionEpoch } from "../../../../modules/novel/director-routing";
import { chapterArtifactBackgroundSyncService } from "../../runtime/ChapterArtifactBackgroundSyncService";
import { buildChapterArtifactContentHash } from "../../runtime/artifactSync/ChapterArtifactContentVersion";
import { CHAPTER_ARTIFACT_BOUNDARY_TYPE, hasCurrentChapterArtifactSyncBoundary } from "../../runtime/artifactSync/ChapterArtifactSyncBoundary";
import { ChapterArtifactSyncBoundaryError, type ChapterArtifactSyncResult } from "../../runtime/artifactSync/ChapterArtifactSyncResult";
import { MANUAL_CHAPTER_SYNC_TYPE, queueManualChapterSync, readManualChapterSync, type ManualChapterSyncPayload } from "./ManualChapterSyncStore";

const RUNNING_STALE_MS = 15 * 60 * 1000;

/** Refreshes saved author prose; never generates/replaces prose or resumes a director. */
export class ManualChapterSyncService {
  private readonly active = new Map<string, Promise<ChapterArtifactSyncResult>>();

  run(payload: ManualChapterSyncPayload): Promise<ChapterArtifactSyncResult> {
    const existing = this.active.get(payload.revision);
    if (existing) return existing;
    const promise = this.execute(payload).finally(() => this.active.delete(payload.revision));
    this.active.set(payload.revision, promise);
    return promise;
  }

  async ensurePrevious(novelId: string, beforeOrder: number, checkCancelled: () => Promise<void>): Promise<void> {
    const chapters = await prisma.chapter.findMany({where: {novelId, order: {lt: beforeOrder}, OR: [
      {generationState: {in: ["approved", "published"]}}, {chapterStatus: "completed"},
      {artifactSyncCheckpoints: {some: {artifactType: MANUAL_CHAPTER_SYNC_TYPE}}},
    ]}, orderBy: {order: "asc"}, select: {id: true}});
    for (const chapter of chapters) await this.ensureCurrent(novelId, chapter.id, checkCancelled);
  }

  private async execute(payload: ManualChapterSyncPayload): Promise<ChapterArtifactSyncResult> {
    const empty = { contentHash: payload.contentHash, completedArtifacts: [] };
    const release = await claimManualChapterSyncLease(payload.novelId, payload.chapterId);
    if (!release) return {...empty, status: "pending", reason: "章节资料正在同步。"};
    try {
      const chapter = await prisma.chapter.findFirst({ where: { id: payload.chapterId, novelId: payload.novelId },
        include: { novel: { select: { directorVersion: true, directorEpoch: true } } } });
      if (!chapter || buildChapterArtifactContentHash(chapter.content ?? "") !== payload.contentHash) {
        return { ...empty, status: "completed", reason: "旧修订已被新正文替代。" };
      }
      const marker = await readManualChapterSync(payload.novelId, payload.chapterId, chapter.content ?? "");
      if (!marker || JSON.parse(marker.metadataJson ?? "{}").revision !== payload.revision) {
        return { ...empty, status: "completed", reason: "旧修订已被新正文替代。" };
      }
      if (marker.status === "succeeded") return { ...empty, status: "completed", completedArtifacts: ["artifact_delta"] };
      const identity = { id: marker.id, metadataJson: JSON.stringify({...payload, attemptId: randomUUID()}) };
      const claimed = await prisma.chapterArtifactSyncCheckpoint.updateMany({ where: { id: marker.id, metadataJson: marker.metadataJson,
        OR: [{ status: { not: "running" } }, { updatedAt: { lt: new Date(Date.now() - RUNNING_STALE_MS) } }] },
        data: { status: "running", metadataJson: identity.metadataJson, updatedAt: new Date() } });
      if (!claimed.count) return { ...empty, status: "pending", reason: "正文已保存，章节资料正在同步。" };
      const heartbeat = setInterval(() => {
        void prisma.chapterArtifactSyncCheckpoint.updateMany({ where: { ...identity, status: "running" },
          data: { updatedAt: new Date() } }).catch(() => {});
      }, 30_000);
      heartbeat.unref();
      let result: ChapterArtifactSyncResult;
      try {
        await prisma.chapterArtifactSyncCheckpoint.updateMany({ where: {novelId: payload.novelId, chapterId: payload.chapterId,
          contentHash: payload.contentHash, syncMode: `manual:${payload.revision}`, status: "failed"}, data: {status: "pending"} });
        const runs = await prisma.directorNextRun.findMany({ where: { novelId: payload.novelId },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, contractJson: true } });
        const run = runs.find(row => readRunExecutionEpoch(row.contractJson) === chapter.novel.directorEpoch);
        const v2 = chapter.novel.directorVersion === "v2" || (!chapter.novel.directorVersion && !!run);
        const contract = run ? JSON.parse(run.contractJson) as RunContract : null;
        if (!v2) await syncChapterArtifacts(payload.novelId, payload.chapterId, chapter.content ?? "", {scheduleBackgroundSync: false});
        if (!chapter.content?.trim()) {
          result = { ...empty, status: "completed" };
        } else {
          result = await chapterArtifactBackgroundSyncService.runChapterSyncNow(payload.novelId, payload.chapterId, chapter.content, {
            ...(v2 ? { artifactSyncPolicy: "director_v2" as const, directorRunId: run?.id } : {}),
            ...(v2 && contract ? {provider: contract.modelConfig?.route, model: contract.modelConfig?.model, temperature: contract.launchInput?.temperature} : {}),
            checkpointScope: `manual:${payload.revision}`, manualRevision: payload.revision, revisionGuard: {...identity, novel: {directorEpoch: chapter.novel.directorEpoch, directorVersion: chapter.novel.directorVersion}},
          });
        }
        // A legacy degraded extraction is not proof that the new author version was synchronized.
        if (chapter.content?.trim() && !result.completedArtifacts.includes("artifact_delta") && result.status !== "pending") {
          result = { ...result, status: "failed" };
        }
      } catch (error) {
        result = { ...empty, status: "failed", reason: error instanceof Error ? error.message : String(error) };
      } finally { clearInterval(heartbeat); }
      await prisma.chapterArtifactSyncCheckpoint.updateMany({ where: identity, data: {
        status: result.status === "completed" || result.status === "degraded" ? "succeeded" : "failed",
        metadataJson: JSON.stringify({ ...payload, result }), updatedAt: new Date(),
      } });
      return result;
    } finally { await release(); }
  }

  /** Called only by a write/continue command or its worker, never by a read projection. */
  async ensureCurrent(novelId: string, chapterId: string, checkCancelled: () => Promise<void> = async () => {}): Promise<void> {
    const deadline = Date.now() + RUNNING_STALE_MS;
    while (Date.now() < deadline) {
      await checkCancelled();
      const chapter = await prisma.chapter.findFirst({ where: { id: chapterId, novelId }, include: {
        artifactSyncCheckpoints: { where: { artifactType: CHAPTER_ARTIFACT_BOUNDARY_TYPE, status: "succeeded" },
          orderBy: { updatedAt: "desc" }, take: 6 },
      } });
      if (!chapter?.content?.trim()) return;
      let marker = await readManualChapterSync(novelId, chapterId, chapter.content);
      const terminal = chapter.generationState === "approved" || chapter.generationState === "published"
        || chapter.chapterStatus === "completed";
      // Also recover edits saved by older clients. Unfinished generated drafts retain their production recovery path.
      const currentBoundary = hasCurrentChapterArtifactSyncBoundary(chapter.content, chapter.artifactSyncCheckpoints, {requireAppliedDelta: true});
      if (!currentBoundary && ((!marker && terminal) || marker?.status === "succeeded")) {
        await prisma.$transaction(async tx => {
          const locked = await tx.chapter.updateMany({ where: { id: chapterId, novelId, content: chapter.content,
            updatedAt: chapter.updatedAt }, data: { updatedAt: chapter.updatedAt } });
          if (locked.count) await queueManualChapterSync(tx, chapter);
        });
        marker = await readManualChapterSync(novelId, chapterId, chapter.content);
        if (!marker) continue;
      }
      if (!marker || (marker.status === "succeeded" && currentBoundary)) return;
      const payload = JSON.parse(marker.metadataJson ?? "null") as ManualChapterSyncPayload;
      if (!payload?.revision || payload.novelId !== novelId || payload.chapterId !== chapterId) {
        throw new Error("本章同步记录无法读取，请保存正文后再继续。");
      }
      const result = await this.run(payload);
      await checkCancelled();
      const latest = await prisma.chapter.findFirst({where: {id: chapterId, novelId}, select: {content: true}});
      const latestMarker = latest && await readManualChapterSync(novelId, chapterId, latest.content ?? "");
      if (latest?.content !== chapter.content || JSON.parse(latestMarker?.metadataJson ?? "{}").revision !== payload.revision) continue;
      if (result.status === "pending" && !result.characterReviewId) {
        await new Promise(resolve => setTimeout(resolve, 1_000));
        continue;
      }
      if (result.status !== "completed" && result.status !== "degraded") {
        throw new ChapterArtifactSyncBoundaryError({ ...result,
          reason: result.characterReviewId ? result.reason : `正文已保存，章节资料同步未完成。请从保存进度继续重试。${result.reason ? ` ${result.reason}` : ""}` });
      }
      // Re-read the latest committed revision before allowing production to continue.
    }
    throw new Error("正文已保存，章节资料仍在同步，请稍后从保存进度继续。");
  }
}

export const manualChapterSyncService = new ManualChapterSyncService();
