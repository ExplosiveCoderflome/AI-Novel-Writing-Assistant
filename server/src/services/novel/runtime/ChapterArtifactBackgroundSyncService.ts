import { prisma } from "../../../db/prisma";
import { CharacterDynamicsService } from "../dynamics/CharacterDynamicsService";
import { payoffLedgerSyncService } from "../../payoff/PayoffLedgerSyncService";
import { stateService } from "../../state/StateService";
import { stateCommitService } from "../state/StateCommitService";
import {
  parsePipelinePayload,
  stringifyPipelinePayload,
} from "../pipelineJobState";
import type {
  PipelineBackgroundSyncActivity,
  PipelineBackgroundSyncKind,
  PipelinePayload,
} from "../novelCoreShared";

interface ChapterBackgroundSyncContext {
  chapterId: string;
  chapterOrder: number;
  chapterTitle: string;
}

export class ChapterArtifactBackgroundSyncService {
  private readonly characterDynamicsService = new CharacterDynamicsService();

  scheduleChapterSync(novelId: string, chapterId: string, content: string): void {
    void this.runChapterSync(novelId, chapterId, content).catch((error) => {
      console.warn("[chapter-artifact-background-sync] background sync failed", {
        novelId,
        chapterId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  private async runChapterSync(novelId: string, chapterId: string, content: string): Promise<void> {
    const chapter = await prisma.chapter.findFirst({
      where: { id: chapterId, novelId },
      select: { id: true, order: true, title: true },
    });
    if (!chapter) {
      return;
    }

    const context: ChapterBackgroundSyncContext = {
      chapterId,
      chapterOrder: chapter.order,
      chapterTitle: chapter.title,
    };

    const stateSyncPromise = this.runTrackedActivity(novelId, context, "state_snapshot", async () => {
      await stateService.syncChapterState(novelId, chapterId, content, {
        skipPayoffLedgerSync: true,
      });
    });
    const dynamicsSyncPromise = this.runTrackedActivity(novelId, context, "character_dynamics", async () => {
      await this.characterDynamicsService.syncChapterDraftDynamics(
        novelId,
        chapterId,
        chapter.order,
      );
    });

    await Promise.allSettled([stateSyncPromise, dynamicsSyncPromise]);

    await this.runTrackedActivity(novelId, context, "payoff_ledger", async () => {
      await payoffLedgerSyncService.syncLedger(novelId, {
        chapterOrder: chapter.order,
        sourceChapterId: chapterId,
      });
    });

    await this.runTrackedActivity(novelId, context, "canonical_state", async () => {
      await stateCommitService.proposeAndCommit({
        novelId,
        chapterId,
        chapterOrder: chapter.order,
        sourceType: "chapter_background_sync",
        sourceStage: "chapter_execution",
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
