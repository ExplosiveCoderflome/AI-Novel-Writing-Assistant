import type { NovelSideEffectJob } from "@prisma/client";
import { getSharedNovelServices } from "../../services/novel/application/sharedNovelServices";
import { characterDynamicsService } from "../../services/novel/dynamics/CharacterDynamicsService";
import {
  NOVEL_SIDE_EFFECT_PAYLOAD_VERSION,
  type ChapterDraftSyncPayload,
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
  async execute(job: NovelSideEffectJob): Promise<void> {
    switch (job.jobType) {
      case "character.chapterDraftSync": {
        const payload = parsePayload<ChapterDraftSyncPayload>(job);
        await characterDynamicsService.syncChapterDraftDynamics(
          payload.novelId,
          payload.chapterId,
          payload.chapterOrder,
        );
        return;
      }
      case "character.volumeRebuild": {
        const payload = parsePayload<CharacterVolumeRebuildPayload>(job);
        await characterDynamicsService.rebuildDynamics(payload.novelId, {
          sourceType: payload.sourceType,
        });
        return;
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
      default:
        throw new UnsupportedNovelSideEffectPayloadError(`Unsupported novel side effect job type ${job.jobType}.`);
    }
  }
}

