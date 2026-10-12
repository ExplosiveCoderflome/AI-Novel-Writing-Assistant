export const NOVEL_SIDE_EFFECT_PAYLOAD_VERSION = 1;

export const NOVEL_SIDE_EFFECT_JOB_TYPES = [
  "character.volumeRebuild",
  "character.postDraftEnrichment",
  "character.v2DeferredEnrichment",
  "novel.pipelineSnapshot",
  "payoff.bookContractSync",
] as const;

export type NovelSideEffectJobType = (typeof NOVEL_SIDE_EFFECT_JOB_TYPES)[number];

export type NovelSideEffectJobStatus = "pending" | "running" | "succeeded" | "failed" | "dead";

export interface CharacterVolumeRebuildPayload {
  novelId: string;
  sourceType: "volume_projection";
}

export interface CharacterPostDraftEnrichmentPayload {
  novelId: string;
  executionEpoch?: number;
}

export interface DirectorV2CharacterEnrichmentPayload {
  novelId: string;
  runId: string;
  executionEpoch: number;
  optionId: string;
  characterIds: string[];
}

export interface PipelineSnapshotPayload {
  novelId: string;
  jobId: string;
  label: string;
}

export interface BookContractPayoffSyncPayload {
  novelId: string;
}

export type NovelSideEffectPayload =
  | CharacterVolumeRebuildPayload
  | CharacterPostDraftEnrichmentPayload
  | DirectorV2CharacterEnrichmentPayload
  | PipelineSnapshotPayload
  | BookContractPayoffSyncPayload;

export interface EnqueueNovelSideEffectJobInput {
  novelId?: string | null;
  jobType: NovelSideEffectJobType;
  idempotencyKey: string;
  payload: NovelSideEffectPayload;
  payloadVersion?: number;
  runAfter?: Date;
  maxAttempts?: number;
}

export interface NovelSideEffectLeaseOptions {
  workerId: string;
  leaseMs: number;
  now?: Date;
}

