import { manualChapterSyncService, type ManualChapterSyncPayload } from "../../services/novel/chapterEditor/synchronization";
import type { NovelSideEffectJob } from "@prisma/client";
import { getSharedNovelServices } from "../../services/novel/application/sharedNovelServices";
import { characterDynamicsService } from "../../services/novel/dynamics/CharacterDynamicsService";
import { payoffLedgerSyncService } from "../../services/payoff/PayoffLedgerSyncService";
import { prisma } from "../../db/prisma";
import { chapterTimelineFinalizationService } from "../../services/novel/runtime/ChapterTimelineFinalizationService";
import { buildTimelineContentHash, TimelineContentVersionError } from "../../modules/timeline";
import {directorV2CharacterEnrichmentService} from "../../services/novel/characterPrep/deferred";
import {
  type BookContractPayoffSyncPayload,
  type ChapterTimelineFinalizationPayload,
  NOVEL_SIDE_EFFECT_PAYLOAD_VERSION,
  type CharacterPostDraftEnrichmentPayload,
  type DirectorV2CharacterEnrichmentPayload,
  type CharacterVolumeRebuildPayload,
  type PipelineSnapshotPayload,
} from "./NovelSideEffectJobTypes";

export class UnsupportedNovelSideEffectPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedNovelSideEffectPayloadError";
  }
}

function parsePayload<T>(job: NovelSideEffectJob): T {
  if (job.payloadVersion !== NOVEL_SIDE_EFFECT_PAYLOAD_VERSION) {
    throw new UnsupportedNovelSideEffectPayloadError(
      `Unsupported novel side effect payload version ${job.payloadVersion}.`,
    );
  }
  const parsed = JSON.parse(job.payloadJson) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new UnsupportedNovelSideEffectPayloadError("Novel side effect payload must be an object.");
  }
  return parsed as T;
}

export class NovelSideEffectJobHandlers {
  constructor(
    private readonly dependencies: {
      syncPayoffLedger?: (novelId: string) => Promise<unknown>;
    } = {},
  ) {}

  async execute(job: NovelSideEffectJob): Promise<void | {deferUntil: Date}> {
    switch (job.jobType) {
      case "chapter.manualSync": {
        const payload = parsePayload<ManualChapterSyncPayload>(job);
        if (payload.novelId !== job.novelId || !payload.chapterId || !payload.contentHash || !payload.revision) {
          throw new UnsupportedNovelSideEffectPayloadError("正文同步任务缺少归属或版本。");
        }
        const result = await manualChapterSyncService.run(payload);
        // An identity review is resumed only by the author's explicit command.
        if (result.characterReviewId) return;
        if (result.status === "pending") return {deferUntil: new Date(Date.now() + 5_000)};
        if (result.status === "failed") throw new Error(result.reason || "正文已保存，章节资料同步失败。");
        return;
      }
      case "chapter.timelineFinalization": {
        const payload = parsePayload<ChapterTimelineFinalizationPayload>(job);
        if (payload.novelId !== job.novelId || !payload.chapterId || !payload.contentHash) {
          throw new UnsupportedNovelSideEffectPayloadError("章节时间线任务的归属或正文版本不完整。");
        }
        const chapter = await prisma.chapter.findFirst({
          where: { id: payload.chapterId, novelId: payload.novelId }, select: { content: true },
        });
        if (!chapter || buildTimelineContentHash(chapter.content ?? "") !== payload.contentHash) return;
        try {
          const result = await chapterTimelineFinalizationService.finalizeCurrentContent({
            novelId: payload.novelId, chapterId: payload.chapterId,
            content: chapter.content ?? "", sourceStage: "manual_chapter_save",
          });
          if (!result.checkpointWritten) return { deferUntil: new Date(Date.now() + 5_000) };
        } catch (error) {
          if (!(error instanceof TimelineContentVersionError)) throw error;
        }
        return;
      }
      case "character.volumeRebuild": {
        const payload = parsePayload<CharacterVolumeRebuildPayload>(job);
        await characterDynamicsService.rebuildDynamics(payload.novelId, {
          sourceType: payload.sourceType,
        });
        return;
      }
      case "character.postDraftEnrichment": {
        const payload = parsePayload<CharacterPostDraftEnrichmentPayload>(job);
        const novel = await prisma.novel.findUnique({where: {id: payload.novelId}, select: {directorVersion: true, directorEpoch: true}});
        if (!novel || novel.directorVersion === "v2" || (payload.executionEpoch ?? 0) !== novel.directorEpoch
          || (!novel.directorVersion && await prisma.directorNextRun.findFirst({
          where: {novelId: payload.novelId}, select: {id: true},
        }))) return;
        const activeProduction = await prisma.generationJob.findFirst({
          where: {
            novelId: payload.novelId,
            status: { in: ["queued", "running"] },
          },
          select: { id: true },
        });
        if (activeProduction) {
          throw new Error("正文生产仍在运行，延迟角色增强等待低优先级重试。");
        }
        await getSharedNovelServices().runDeferredCharacterEnhancements(payload.novelId);
        return;
      }
      case "character.v2DeferredEnrichment": {
        const payload = parsePayload<DirectorV2CharacterEnrichmentPayload>(job);
        if (payload.novelId !== job.novelId) throw new UnsupportedNovelSideEffectPayloadError("角色补全任务的小说归属不一致。");
        const result = await directorV2CharacterEnrichmentService.execute(payload, {id: job.id, leaseOwner: job.leaseOwner});
        return result === "deferred" ? {deferUntil: new Date(Date.now() + 60_000)} : undefined;
      }
      case "novel.pipelineSnapshot": {
        const payload = parsePayload<PipelineSnapshotPayload>(job);
        await getSharedNovelServices().createNovelSnapshot(
          payload.novelId,
          "auto_milestone",
          payload.label,
        );
        return;
      }
      case "payoff.bookContractSync": {
        const payload = parsePayload<BookContractPayoffSyncPayload>(job);
        await (this.dependencies.syncPayoffLedger ?? ((novelId: string) => (
          payoffLedgerSyncService.syncLedger(novelId)
        )))(payload.novelId);
        return;
      }
      default:
        throw new UnsupportedNovelSideEffectPayloadError(`Unsupported novel side effect job type ${job.jobType}.`);
    }
  }
}

