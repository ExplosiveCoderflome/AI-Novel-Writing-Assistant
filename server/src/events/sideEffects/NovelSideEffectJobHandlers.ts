import type { NovelSideEffectJob } from "@prisma/client";
import { getSharedNovelServices } from "../../services/novel/application/sharedNovelServices";
import { characterDynamicsService } from "../../services/novel/dynamics/CharacterDynamicsService";
import { payoffLedgerSyncService } from "../../services/payoff/PayoffLedgerSyncService";
import { prisma } from "../../db/prisma";
import {directorV2CharacterEnrichmentService} from "../../services/novel/characterPrep/deferred";
import {
  type BookContractPayoffSyncPayload,
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

