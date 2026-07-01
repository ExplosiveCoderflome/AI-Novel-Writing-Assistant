import { prisma } from "../../../db/prisma";
import { payoffLedgerSyncService } from "../../payoff/PayoffLedgerSyncService";
import {
  parsePipelinePayload,
  stringifyPipelinePayload,
} from "../pipelineJobState";
import type {
  ArtifactSyncMode,
  PipelineBackgroundSyncActivity,
  PipelineBackgroundSyncKind,
  PipelinePayload,
} from "../novelCoreShared";
import type { ContentProvenance } from "@ai-novel/shared/types/canonicalState";
import { buildContentHash, ChapterArtifactDeltaService } from "./ChapterArtifactDeltaService";

interface ChapterBackgroundSyncContext {
  chapterId: string;
  chapterOrder: number;
  chapterTitle: string;
}

interface ChapterArtifactBackgroundSyncOptions {
  artifactSyncMode?: ArtifactSyncMode;
  provider?: string;
  model?: string;
  temperature?: number;
  contentProvenance?: ContentProvenance;
}

type ArtifactSyncClaimStatus = "claimed" | "already_done" | "running";

const DEFAULT_ARTIFACT_SYNC_MODE: ArtifactSyncMode = "adaptive";
const DEFERRED_SYNC_DELAY_MS = 5000;
const ARTIFACT_SYNC_RUNNING_STALE_MS = 15 * 60 * 1000;

export class ChapterArtifactBackgroundSyncService {
  private readonly artifactDeltaService = new ChapterArtifactDeltaService();
  private readonly activeSyncKeys = new Set<string>();
  private readonly latestSyncedContentHashByChapter = new Map<string, string>();

  scheduleChapterSync(
    novelId: string,
    chapterId: string,
    content: string,
    options: ChapterArtifactBackgroundSyncOptions = {},
  ): void {
    const artifactSyncMode = options.artifactSyncMode ?? DEFAULT_ARTIFACT_SYNC_MODE;
    const delayMs = artifactSyncMode === "deferred" ? DEFERRED_SYNC_DELAY_MS : 0;
    const runOptions: ChapterArtifactBackgroundSyncOptions = {
      ...options,
      artifactSyncMode,
    };
    const run = () => {
      void this.runChapterSyncNow(novelId, chapterId, content, runOptions);
    };
    if (delayMs > 0) {
      setTimeout(run, delayMs).unref?.();
      return;
    }
    run();
  }

  async runChapterSyncNow(
    novelId: string,
    chapterId: string,
    content: string,
    options: ChapterArtifactBackgroundSyncOptions = {},
  ): Promise<void> {
    const artifactSyncMode = options.artifactSyncMode ?? DEFAULT_ARTIFACT_SYNC_MODE;
    const contentHash = buildContentHash(content);
    const chapterKey = `${novelId}:${chapterId}:${artifactSyncMode}`;
    const syncKey = `${chapterKey}:${contentHash}`;
    if (
      this.activeSyncKeys.has(syncKey)
      || this.latestSyncedContentHashByChapter.get(chapterKey) === contentHash
    ) {
      return;
    }
    this.activeSyncKeys.add(syncKey);
    try {
      await this.runChapterSync(novelId, chapterId, content, artifactSyncMode, contentHash, options);
      this.latestSyncedContentHashByChapter.set(chapterKey, contentHash);
    } catch (error) {
      console.warn("[chapter-artifact-background-sync] background sync failed", {
        novelId,
        chapterId,
        artifactSyncMode,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.activeSyncKeys.delete(syncKey);
    }
  }

  private async runChapterSync(
    novelId: string,
    chapterId: string,
    content: string,
    artifactSyncMode: ArtifactSyncMode,
    contentHash: string,
    options: ChapterArtifactBackgroundSyncOptions,
  ): Promise<void> {
    const chapter = await prisma.chapter.findFirst({
      where: { id: chapterId, novelId },
      select: { id: true, order: true, title: true },
    });
    if (!chapter) {
      return;
    }
    if (await this.hasCompletedCheckpoint({
      novelId,
      chapterId,
      contentHash,
      artifactType: "artifact_delta",
      syncMode: artifactSyncMode,
    })) {
      return;
    }
    const deltaClaim = await this.claimCheckpoint({
      novelId,
      chapterId,
      contentHash,
      artifactType: "artifact_delta",
      syncMode: artifactSyncMode,
      sourceType: "chapter_background_sync",
      sourceStage: "chapter_execution",
      metadata: {
        reason: "artifact_delta_started",
        contentProvenance: options.contentProvenance ?? "confirmed",
      },
    });
    if (deltaClaim !== "claimed") {
      return;
    }
    const context: ChapterBackgroundSyncContext = {
      chapterId,
      chapterOrder: chapter.order,
      chapterTitle: chapter.title,
    };

    let deltaMetadata: Record<string, unknown> = {};
    let requiresFullReconcileFromDelta = false;
    try {
      await this.runTrackedActivity(novelId, context, "artifact_delta", async () => {
        const result = await this.artifactDeltaService.syncChapterArtifacts({
          novelId,
          chapterId,
          content,
          sourceType: "chapter_background_sync",
          sourceStage: "chapter_execution",
          provider: options.provider,
          model: options.model,
          temperature: options.temperature,
          contentProvenance: options.contentProvenance,
        });
        requiresFullReconcileFromDelta = result.requiresFullReconcile;
        deltaMetadata = {
          stateSnapshotId: result.stateSnapshotId,
          characterResourceProposalCount: result.characterResourceProposalCount,
          characterDynamicsCount: result.characterDynamicsCount,
          characterKnowledgeStateCount: result.characterKnowledgeStateCount,
          payoffDeltaCount: result.payoffDeltaCount,
          canonicalCommittedCount: result.canonicalCommittedCount,
          concreteFactCount: result.concreteFactCount,
          syncPlan: result.output.syncPlan,
          confidence: result.output.confidence,
          contentProvenance: options.contentProvenance ?? "confirmed",
        };
      });
    } catch (error) {
      await this.markCheckpointFailed({
        novelId,
        chapterId,
        contentHash,
        artifactType: "artifact_delta",
        syncMode: artifactSyncMode,
        sourceType: "chapter_background_sync",
        sourceStage: "chapter_execution",
        metadata: { reason: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }
    await this.markCheckpoint({
      novelId,
      chapterId,
      contentHash,
      artifactType: "artifact_delta",
      syncMode: artifactSyncMode,
      sourceType: "chapter_background_sync",
      sourceStage: "chapter_execution",
      metadata: deltaMetadata,
    });

    const shouldReconcile = await this.shouldRunPayoffFullReconcile({
      novelId,
      chapterOrder: chapter.order,
      artifactSyncMode,
      requiresFullReconcileFromDelta,
    });
    if (shouldReconcile && !(await this.hasCompletedCheckpoint({
      novelId,
      chapterId,
      contentHash,
      artifactType: "payoff_ledger_full_reconcile",
      syncMode: artifactSyncMode,
    }))) {
      await this.runTrackedActivity(novelId, context, "payoff_ledger", async () => {
        await payoffLedgerSyncService.syncLedger(novelId, {
          chapterOrder: chapter.order,
          sourceChapterId: chapterId,
        });
      });
      await this.markCheckpoint({
        novelId,
        chapterId,
        contentHash,
        artifactType: "payoff_ledger_full_reconcile",
        syncMode: artifactSyncMode,
        sourceType: "chapter_background_sync",
        sourceStage: "chapter_execution",
        metadata: {
          trigger: this.describePayoffReconcileTrigger({
            chapterOrder: chapter.order,
            artifactSyncMode,
            requiresFullReconcileFromDelta,
            isVolumeTail: await this.isVolumeTail(novelId, chapter.order),
          }),
        },
      });
    }
  }

  private async shouldRunPayoffFullReconcile(input: {
    novelId: string;
    chapterOrder: number;
    artifactSyncMode: ArtifactSyncMode;
    requiresFullReconcileFromDelta: boolean;
  }): Promise<boolean> {
    if (input.artifactSyncMode === "strict") {
      return true;
    }
    if (input.requiresFullReconcileFromDelta) {
      return true;
    }
    if (input.artifactSyncMode === "deferred") {
      return false;
    }
    if (input.chapterOrder > 0 && input.chapterOrder % 3 === 0) {
      return true;
    }
    return this.isVolumeTail(input.novelId, input.chapterOrder);
  }

  private describePayoffReconcileTrigger(input: {
    chapterOrder: number;
    artifactSyncMode: ArtifactSyncMode;
    requiresFullReconcileFromDelta: boolean;
    isVolumeTail: boolean;
  }): string {
    if (input.artifactSyncMode === "strict") {
      return "strict_mode";
    }
    if (input.requiresFullReconcileFromDelta) {
      return "artifact_delta_risk";
    }
    if (input.chapterOrder > 0 && input.chapterOrder % 3 === 0) {
      return "adaptive_three_chapter_checkpoint";
    }
    if (input.isVolumeTail) {
      return "adaptive_volume_tail";
    }
    return "manual";
  }

  private async isVolumeTail(novelId: string, chapterOrder: number): Promise<boolean> {
    const volume = await prisma.volumePlan.findFirst({
      where: {
        novelId,
        chapters: {
          some: { chapterOrder },
        },
      },
      include: {
        chapters: {
          select: { chapterOrder: true },
        },
      },
    });
    if (!volume || volume.chapters.length === 0) {
      return false;
    }
    const maxChapterOrder = Math.max(...volume.chapters.map((item) => item.chapterOrder));
    return chapterOrder === maxChapterOrder;
  }

  private async hasCompletedCheckpoint(input: {
    novelId: string;
    chapterId: string;
    contentHash: string;
    artifactType: string;
    syncMode: ArtifactSyncMode;
  }): Promise<boolean> {
    const row = await prisma.chapterArtifactSyncCheckpoint.findUnique({
      where: {
        novelId_chapterId_contentHash_artifactType_syncMode: {
          novelId: input.novelId,
          chapterId: input.chapterId,
          contentHash: input.contentHash,
          artifactType: input.artifactType,
          syncMode: input.syncMode,
        },
      },
      select: { status: true },
    }).catch(() => null);
    return row?.status === "succeeded";
  }

  private async claimCheckpoint(input: {
    novelId: string;
    chapterId: string;
    contentHash: string;
    artifactType: string;
    syncMode: ArtifactSyncMode;
    sourceType?: string | null;
    sourceStage?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<ArtifactSyncClaimStatus> {
    const where = {
      novelId_chapterId_contentHash_artifactType_syncMode: {
        novelId: input.novelId,
        chapterId: input.chapterId,
        contentHash: input.contentHash,
        artifactType: input.artifactType,
        syncMode: input.syncMode,
      },
    };
    const metadataJson = JSON.stringify(input.metadata ?? {});
    try {
      await prisma.chapterArtifactSyncCheckpoint.create({
        data: {
          novelId: input.novelId,
          chapterId: input.chapterId,
          contentHash: input.contentHash,
          artifactType: input.artifactType,
          syncMode: input.syncMode,
          status: "running",
          sourceType: input.sourceType ?? null,
          sourceStage: input.sourceStage ?? null,
          metadataJson,
        },
      });
      return "claimed";
    } catch {
      const existing = await prisma.chapterArtifactSyncCheckpoint.findUnique({
        where,
        select: { status: true, updatedAt: true },
      }).catch(() => null);
      if (existing?.status === "succeeded") {
        return "already_done";
      }
      const staleBefore = new Date(Date.now() - ARTIFACT_SYNC_RUNNING_STALE_MS);
      if (existing?.status === "running" && existing.updatedAt > staleBefore) {
        return "running";
      }
      const claimed = await prisma.chapterArtifactSyncCheckpoint.updateMany({
        where: {
          novelId: input.novelId,
          chapterId: input.chapterId,
          contentHash: input.contentHash,
          artifactType: input.artifactType,
          syncMode: input.syncMode,
          OR: [
            { status: { not: "running" } },
            { updatedAt: { lt: staleBefore } },
          ],
        },
        data: {
          status: "running",
          sourceType: input.sourceType ?? null,
          sourceStage: input.sourceStage ?? null,
          metadataJson,
          updatedAt: new Date(),
        },
      }).catch(() => ({ count: 0 }));
      return claimed.count > 0 ? "claimed" : "running";
    }
  }

  private async markCheckpoint(input: {
    novelId: string;
    chapterId: string;
    contentHash: string;
    artifactType: string;
    syncMode: ArtifactSyncMode;
    sourceType?: string | null;
    sourceStage?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await prisma.chapterArtifactSyncCheckpoint.upsert({
      where: {
        novelId_chapterId_contentHash_artifactType_syncMode: {
          novelId: input.novelId,
          chapterId: input.chapterId,
          contentHash: input.contentHash,
          artifactType: input.artifactType,
          syncMode: input.syncMode,
        },
      },
      create: {
        novelId: input.novelId,
        chapterId: input.chapterId,
        contentHash: input.contentHash,
        artifactType: input.artifactType,
        syncMode: input.syncMode,
        status: "succeeded",
        sourceType: input.sourceType ?? null,
        sourceStage: input.sourceStage ?? null,
        metadataJson: JSON.stringify(input.metadata ?? {}),
      },
      update: {
        status: "succeeded",
        sourceType: input.sourceType ?? null,
        sourceStage: input.sourceStage ?? null,
        metadataJson: JSON.stringify(input.metadata ?? {}),
        updatedAt: new Date(),
      },
    }).catch((error) => {
      console.warn("[chapter-artifact-background-sync] checkpoint write failed", {
        novelId: input.novelId,
        chapterId: input.chapterId,
        artifactType: input.artifactType,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  private async runTrackedActivity(
    novelId: string,
    chapter: ChapterBackgroundSyncContext,
    kind: PipelineBackgroundSyncKind,
    runner: () => Promise<void>,
  ): Promise<void> {
    await this.updateBackgroundActivity(novelId, chapter, kind, "running");
    try {
      await runner();
      await this.clearBackgroundActivity(novelId, chapter.chapterId, kind);
    } catch (error) {
      await this.clearBackgroundActivity(novelId, chapter.chapterId, kind);
      throw error;
    }
  }

  private async markCheckpointFailed(input: {
    novelId: string;
    chapterId: string;
    contentHash: string;
    artifactType: string;
    syncMode: ArtifactSyncMode;
    sourceType?: string | null;
    sourceStage?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await prisma.chapterArtifactSyncCheckpoint.updateMany({
      where: {
        novelId: input.novelId,
        chapterId: input.chapterId,
        contentHash: input.contentHash,
        artifactType: input.artifactType,
        syncMode: input.syncMode,
        status: "running",
      },
      data: {
        status: "failed",
        sourceType: input.sourceType ?? null,
        sourceStage: input.sourceStage ?? null,
        metadataJson: JSON.stringify(input.metadata ?? {}),
        updatedAt: new Date(),
      },
    }).catch(() => null);
  }

  private async updateBackgroundActivity(
    novelId: string,
    chapter: ChapterBackgroundSyncContext,
    kind: PipelineBackgroundSyncKind,
    status: PipelineBackgroundSyncActivity["status"],
  ): Promise<void> {
    const jobRows = await this.findActiveJobsForChapter(novelId, chapter.chapterOrder);
    if (jobRows.length === 0) {
      return;
    }

    await Promise.all(jobRows.map(async (job) => {
      const payload = parsePipelinePayload(job.payload);
      const nextActivities = (payload.backgroundSync?.activities ?? [])
        .filter((item) => item.kind !== kind)
        .concat({
          kind,
          status,
          chapterId: chapter.chapterId,
          chapterOrder: chapter.chapterOrder,
          chapterTitle: chapter.chapterTitle,
          updatedAt: new Date().toISOString(),
        })
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
      await this.persistJobPayload(job.id, job.payload, payload, nextActivities);
    }));
  }

  private async clearBackgroundActivity(
    novelId: string,
    chapterId: string,
    kind: PipelineBackgroundSyncKind,
  ): Promise<void> {
    const jobRows = await prisma.generationJob.findMany({
      where: {
        novelId,
        status: { in: ["queued", "running"] },
      },
      select: {
        id: true,
        payload: true,
      },
    });
    if (jobRows.length === 0) {
      return;
    }

    await Promise.all(jobRows.map(async (job) => {
      const payload = parsePipelinePayload(job.payload);
      const nextActivities = (payload.backgroundSync?.activities ?? [])
        .filter((item) => !(item.kind === kind && item.chapterId === chapterId));
      if (nextActivities.length === (payload.backgroundSync?.activities ?? []).length) {
        const unchanged = nextActivities.every((item, index) => {
          const previous = (payload.backgroundSync?.activities ?? [])[index];
          return previous
            && previous.kind === item.kind
            && previous.chapterId === item.chapterId
            && previous.status === item.status;
        });
        if (unchanged) {
          return;
        }
      }
      await this.persistJobPayload(job.id, job.payload, payload, nextActivities);
    }));
  }

  private async persistJobPayload(
    jobId: string,
    currentPayloadString: string | null,
    payload: PipelinePayload,
    activities: PipelineBackgroundSyncActivity[],
  ): Promise<void> {
    const nextPayload: PipelinePayload = {
      ...payload,
      backgroundSync: activities.length > 0 ? { activities } : undefined,
    };
    const nextPayloadString = stringifyPipelinePayload(nextPayload);
    if ((currentPayloadString ?? "") === nextPayloadString) {
      return;
    }
    await prisma.generationJob.update({
      where: { id: jobId },
      data: {
        payload: nextPayloadString,
        heartbeatAt: new Date(),
      },
    }).catch(() => null);
  }

  private async findActiveJobsForChapter(novelId: string, chapterOrder: number) {
    return prisma.generationJob.findMany({
      where: {
        novelId,
        status: { in: ["queued", "running"] },
        startOrder: { lte: chapterOrder },
        endOrder: { gte: chapterOrder },
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        payload: true,
      },
    });
  }
}

export const chapterArtifactBackgroundSyncService = new ChapterArtifactBackgroundSyncService();
