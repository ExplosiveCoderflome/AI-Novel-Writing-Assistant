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
import { buildContentHash } from "./ChapterArtifactDeltaService";
import { CHAPTER_ARTIFACT_BOUNDARY_TYPE } from "./artifactSync/ChapterArtifactSyncBoundary";
import {
  ChapterArtifactRecoveryPendingError,
  ChapterArtifactRecoveryService,
} from "./artifactSync/ChapterArtifactRecoveryService";
import {
  ChapterArtifactContentVersionError,
  type ChapterArtifactSyncResult,
} from "./artifactSync/ChapterArtifactSyncResult";

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
const RECOVERABLE_ARTIFACT_DELTA_TYPE = "artifact_delta_recoverable:v1";

export class ChapterArtifactBackgroundSyncService {
  private artifactRecoveryService: ChapterArtifactRecoveryService | null = null;
  private readonly activeSyncs = new Map<string, Promise<ChapterArtifactSyncResult>>();
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
  ): Promise<ChapterArtifactSyncResult> {
    const artifactSyncMode = options.artifactSyncMode ?? DEFAULT_ARTIFACT_SYNC_MODE;
    const contentHash = buildContentHash(content);
    const chapterKey = `${novelId}:${chapterId}:${artifactSyncMode}`;
    const syncKey = `${chapterKey}:${contentHash}`;
    const activeSync = this.activeSyncs.get(syncKey);
    if (activeSync) {
      return activeSync;
    }
    if (this.latestSyncedContentHashByChapter.get(chapterKey) === contentHash) {
      return {
        status: "completed",
        contentHash,
        completedArtifacts: ["artifact_delta"],
      };
    }
    // Extraction, boundary persistence, and the local cache are one result
    // boundary. Concurrent callers must receive that same final result.
    const execution = (async (): Promise<ChapterArtifactSyncResult> => {
      let result = await this.runChapterSync(
        novelId,
        chapterId,
        content,
        artifactSyncMode,
        contentHash,
        options,
      ).catch((error): ChapterArtifactSyncResult => ({
        status: "failed",
        contentHash,
        completedArtifacts: [],
        reason: error instanceof Error ? error.message : String(error),
      }));
      if (result.status === "completed" || result.status === "degraded") {
        try {
          await this.recordContinuityBoundary({
            novelId,
            chapterId,
            contentHash,
            artifactSyncMode,
            result,
          });
        } catch (error) {
          result = {
            ...result,
            status: "failed",
            reason: `无法保存当前正文的资产完成边界：${error instanceof Error ? error.message : String(error)}`,
          };
        }
      }
      if (result.status === "completed") {
        this.latestSyncedContentHashByChapter.set(chapterKey, contentHash);
      }
      return result;
    })();
    this.activeSyncs.set(syncKey, execution);
    void execution.finally(() => {
      if (this.activeSyncs.get(syncKey) === execution) {
        this.activeSyncs.delete(syncKey);
      }
    });
    return execution;
  }

  private async runChapterSync(
    novelId: string,
    chapterId: string,
    content: string,
    artifactSyncMode: ArtifactSyncMode,
    contentHash: string,
    options: ChapterArtifactBackgroundSyncOptions,
  ): Promise<ChapterArtifactSyncResult> {
    const chapter = await prisma.chapter.findFirst({
      where: { id: chapterId, novelId },
      select: { id: true, order: true, title: true, content: true },
    });
    if (!chapter) {
      return { status: "failed", contentHash, completedArtifacts: [], reason: "章节不存在，无法同步当前正文资产。" };
    }
    if (buildContentHash(chapter.content ?? "") !== contentHash) {
      return { status: "failed", contentHash, completedArtifacts: [], reason: "章节正文版本已变化，已拒绝过期资产同步结果。" };
    }
    const context: ChapterBackgroundSyncContext = {
      chapterId,
      chapterOrder: chapter.order,
      chapterTitle: chapter.title,
    };

    let deltaMetadata: Record<string, unknown> = {};
    let requiresFullReconcileFromDelta = false;
    const completedDeltaMetadata = await this.getCompletedCheckpointMetadata({
      novelId,
      chapterId,
      contentHash,
      artifactType: RECOVERABLE_ARTIFACT_DELTA_TYPE,
      syncMode: artifactSyncMode,
    });
    if (completedDeltaMetadata) {
      deltaMetadata = completedDeltaMetadata;
      requiresFullReconcileFromDelta = completedDeltaMetadata.requiresFullReconcile === true;
    } else {
      const deltaClaim = await this.claimCheckpoint({
        novelId,
        chapterId,
        contentHash,
        artifactType: RECOVERABLE_ARTIFACT_DELTA_TYPE,
        syncMode: artifactSyncMode,
        sourceType: "chapter_background_sync",
        sourceStage: "chapter_execution",
        metadata: {
          reason: "artifact_delta_started",
          contentProvenance: options.contentProvenance ?? "confirmed",
        },
      });
      if (deltaClaim === "running") {
        return {
          status: artifactSyncMode === "strict" ? "pending" : "degraded",
          contentHash,
          completedArtifacts: [],
          reason: "同一正文版本的资产同步仍在运行。",
        };
      }
      if (deltaClaim !== "already_done") {
        try {
          await this.runTrackedActivity(novelId, context, "artifact_delta", async () => {
            const result = await this.getArtifactRecoveryService().syncChapterArtifacts({
          novelId,
          chapterId,
          content,
          artifactSyncMode,
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
          requiresFullReconcile: result.requiresFullReconcile,
          contentProvenance: options.contentProvenance ?? "confirmed",
            };
          });
        } catch (error) {
          if (error instanceof ChapterArtifactRecoveryPendingError) {
            return {
              status: "pending",
              contentHash,
              completedArtifacts: [],
              reason: error.message,
            };
          }
          await this.markCheckpointFailed({
        novelId,
        chapterId,
        contentHash,
        artifactType: RECOVERABLE_ARTIFACT_DELTA_TYPE,
        syncMode: artifactSyncMode,
        sourceType: "chapter_background_sync",
        sourceStage: "chapter_execution",
        metadata: { reason: error instanceof Error ? error.message : String(error) },
          });
          if (error instanceof ChapterArtifactContentVersionError) {
            return {
              status: "failed",
              contentHash,
              completedArtifacts: [],
              reason: error.message,
            };
          }
          return {
            status: "degraded",
            contentHash,
            completedArtifacts: [],
            reason: error instanceof Error ? error.message : String(error),
          };
        }
        await this.markCheckpoint({
          novelId,
          chapterId,
          contentHash,
          artifactType: RECOVERABLE_ARTIFACT_DELTA_TYPE,
          syncMode: artifactSyncMode,
          sourceType: "chapter_background_sync",
          sourceStage: "chapter_execution",
          metadata: deltaMetadata,
        });
      } else {
        const completed = await this.getCompletedCheckpointMetadata({
          novelId,
          chapterId,
          contentHash,
          artifactType: RECOVERABLE_ARTIFACT_DELTA_TYPE,
          syncMode: artifactSyncMode,
        });
        // Older whole-delta checkpoints did not retain recovery metadata. They
        // remain a completed delta, while strict mode still forces reconcile.
        deltaMetadata = completed ?? {};
        requiresFullReconcileFromDelta = completed?.requiresFullReconcile === true;
      }
    }

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
      const reconcileClaim = await this.claimCheckpoint({
        novelId,
        chapterId,
        contentHash,
        artifactType: "payoff_ledger_full_reconcile",
        syncMode: artifactSyncMode,
        sourceType: "chapter_background_sync",
        sourceStage: "chapter_execution",
      });
      if (reconcileClaim === "running") {
        return {
          status: artifactSyncMode === "strict" ? "pending" : "degraded",
          contentHash,
          completedArtifacts: ["artifact_delta"],
          reason: "同一正文版本的伏笔账本对账仍在运行。",
        };
      }
      if (reconcileClaim === "claimed") {
        try {
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
        } catch (error) {
          await this.markCheckpointFailed({
            novelId,
            chapterId,
            contentHash,
            artifactType: "payoff_ledger_full_reconcile",
            syncMode: artifactSyncMode,
            sourceType: "chapter_background_sync",
            sourceStage: "chapter_execution",
            metadata: { reason: error instanceof Error ? error.message : String(error) },
          });
          return {
            status: "degraded",
            contentHash,
            completedArtifacts: ["artifact_delta"],
            reason: error instanceof Error ? error.message : String(error),
          };
        }
      }
      return {
        status: "completed",
        contentHash,
        completedArtifacts: ["artifact_delta", "payoff_ledger_full_reconcile"],
      };
    }
    return { status: "completed", contentHash, completedArtifacts: ["artifact_delta"] };
  }

  private getArtifactRecoveryService(): ChapterArtifactRecoveryService {
    this.artifactRecoveryService ??= new ChapterArtifactRecoveryService();
    return this.artifactRecoveryService;
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

  private async getCompletedCheckpointMetadata(input: {
    novelId: string;
    chapterId: string;
    contentHash: string;
    artifactType: string;
    syncMode: ArtifactSyncMode;
  }): Promise<Record<string, unknown> | null> {
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
      select: { status: true, metadataJson: true },
    }).catch(() => null);
    if (row?.status !== "succeeded" || !row.metadataJson) {
      return null;
    }
    try {
      const metadata: unknown = JSON.parse(row.metadataJson);
      return metadata && typeof metadata === "object" && !Array.isArray(metadata)
        ? metadata as Record<string, unknown>
        : null;
    } catch {
      return null;
    }
  }

  private async recordContinuityBoundary(input: {
    novelId: string;
    chapterId: string;
    contentHash: string;
    artifactSyncMode: ArtifactSyncMode;
    result: ChapterArtifactSyncResult;
  }): Promise<void> {
    const chapter = await prisma.chapter.findFirst({
      where: { id: input.chapterId, novelId: input.novelId },
      select: { content: true },
    });
    if (!chapter || buildContentHash(chapter.content ?? "") !== input.contentHash) {
      throw new ChapterArtifactContentVersionError("章节正文版本已变化，无法保存过期的资产完成边界。");
    }
    await prisma.chapterArtifactSyncCheckpoint.upsert({
      where: {
        novelId_chapterId_contentHash_artifactType_syncMode: {
          novelId: input.novelId,
          chapterId: input.chapterId,
          contentHash: input.contentHash,
          artifactType: CHAPTER_ARTIFACT_BOUNDARY_TYPE,
          syncMode: input.artifactSyncMode,
        },
      },
      create: {
        novelId: input.novelId,
        chapterId: input.chapterId,
        contentHash: input.contentHash,
        artifactType: CHAPTER_ARTIFACT_BOUNDARY_TYPE,
        syncMode: input.artifactSyncMode,
        status: "succeeded",
        sourceType: "chapter_background_sync",
        sourceStage: "chapter_execution",
        metadataJson: JSON.stringify({
          outcome: input.result.status,
          completedArtifacts: input.result.completedArtifacts,
          reason: input.result.reason ?? null,
        }),
      },
      update: {
        status: "succeeded",
        sourceType: "chapter_background_sync",
        sourceStage: "chapter_execution",
        metadataJson: JSON.stringify({
          outcome: input.result.status,
          completedArtifacts: input.result.completedArtifacts,
          reason: input.result.reason ?? null,
        }),
        updatedAt: new Date(),
      },
    });
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
