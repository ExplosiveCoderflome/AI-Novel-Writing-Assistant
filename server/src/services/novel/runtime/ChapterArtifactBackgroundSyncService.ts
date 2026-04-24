import { prisma } from "../../../db/prisma";
import type { StateChangeProposal } from "@ai-novel/shared/types/canonicalState";
import { CharacterDynamicsService } from "../dynamics/CharacterDynamicsService";
import { characterResourceExtractionService } from "../characterResource/CharacterResourceExtractionService";
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

interface ChapterChangeFlags {
  introducedPayoff: boolean;
  payoffResolutionSignal: boolean;
  relationshipShiftSignal: boolean;
  majorStateShiftSignal: boolean;
}

function detectChapterChangeFlags(content: string, taskSheet: string | null | undefined): ChapterChangeFlags {
  const combinedText = `${taskSheet ?? ""}\n${content}`;
  return {
    introducedPayoff: /(伏笔|线索|埋下|承诺|约定|秘密|计划)/u.test(combinedText),
    payoffResolutionSignal: /(兑现|揭晓|完成|成功|达成|得手|反杀|逆转|破解)/u.test(combinedText),
    relationshipShiftSignal: /(联盟|合作|和解|决裂|背叛|表白|结盟|翻脸)/u.test(combinedText),
    majorStateShiftSignal: /(觉醒|突破|晋升|加入|离开|死亡|成了|成为|暴露|接管)/u.test(combinedText),
  };
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
      select: { id: true, order: true, title: true, taskSheet: true },
    });
    if (!chapter) {
      return;
    }
    const changeFlags = detectChapterChangeFlags(content, chapter.taskSheet);
    const isBatchBoundary = chapter.order <= 1 || chapter.order % 3 === 0;

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
    const dynamicsSyncPromise = (isBatchBoundary || changeFlags.relationshipShiftSignal || changeFlags.majorStateShiftSignal)
      ? this.runTrackedActivity(novelId, context, "character_dynamics", async () => {
        await this.characterDynamicsService.syncChapterDraftDynamics(
          novelId,
          chapterId,
          chapter.order,
        );
      })
      : Promise.resolve();

    await Promise.allSettled([stateSyncPromise, dynamicsSyncPromise]);

    let characterResourceProposals: StateChangeProposal[] = [];
    await this.runTrackedActivity(novelId, context, "character_resources", async () => {
      characterResourceProposals = await characterResourceExtractionService.extractChapterResourceProposals({
        novelId,
        chapterId,
        chapterOrder: chapter.order,
        sourceType: "chapter_background_sync",
        sourceStage: "chapter_execution",
      });
    }).catch((error) => {
      console.warn("[chapter-artifact-background-sync] character resource extraction skipped", {
        novelId,
        chapterId,
        error: error instanceof Error ? error.message : String(error),
      });
      characterResourceProposals = [];
    });

    if (isBatchBoundary || changeFlags.introducedPayoff || changeFlags.payoffResolutionSignal) {
      await this.runTrackedActivity(novelId, context, "payoff_ledger", async () => {
        await payoffLedgerSyncService.syncLedger(novelId, {
          chapterOrder: chapter.order,
          sourceChapterId: chapterId,
        });
      });
    }

    await this.runTrackedActivity(novelId, context, "canonical_state", async () => {
      await stateCommitService.proposeAndCommit({
        novelId,
        chapterId,
        chapterOrder: chapter.order,
        sourceType: "chapter_background_sync",
        sourceStage: "chapter_execution",
        proposals: characterResourceProposals,
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
