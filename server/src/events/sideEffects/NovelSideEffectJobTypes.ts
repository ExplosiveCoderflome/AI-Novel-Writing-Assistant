export const NOVEL_SIDE_EFFECT_PAYLOAD_VERSION = 1;

export const NOVEL_SIDE_EFFECT_JOB_TYPES = [
  "character.volumeRebuild",
  "novel.pipelineSnapshot",
] as const;

export type NovelSideEffectJobType = (typeof NOVEL_SIDE_EFFECT_JOB_TYPES)[number];

export type NovelSideEffectJobStatus = "pending" | "running" | "succeeded" | "failed" | "dead";

export interface CharacterVolumeRebuildPayload {
  novelId: string;
  sourceType: "volume_projection";
}

export interface PipelineSnapshotPayload {
  novelId: string;
  jobId: string;
  label: string;
}

export type NovelSideEffectPayload =
  | CharacterVolumeRebuildPayload
  | PipelineSnapshotPayload;

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

