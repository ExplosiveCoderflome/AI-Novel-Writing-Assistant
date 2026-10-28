import type { ProductionJson } from "../../common";
import type { UnitRun } from "../../application";

export const ARTIFACT_CONSUMERS = ["summary_facts", "state_snapshot", "character_resources", "payoff",
  "character_dynamics", "knowledge", "mind", "dialogue_influence", "character_locations", "character_appearances"] as const;
export type ArtifactConsumer = typeof ARTIFACT_CONSUMERS[number];
export interface ArtifactContext {
  run: UnitRun;
  /** Opaque caller lease identity; a replacement owner gets a different value. */
  executionToken: string;
  content: string;
  contentHash: string;
  requestKey: string;
  extraction?: ProductionJson;
}
import type { ArtifactClaim, ArtifactCheckpointPort } from "../checkpoints/types";
export type { ArtifactStepIdentity, ArtifactClaim, ArtifactClaimResult, ArtifactCheckpointPort } from "../checkpoints/types";
export interface PreparedArtifactExtraction {
  inputFingerprint: string;
  outputTokens: number;
  /** Exact serialized input; invocation must use this prepared value. */
  input: ProductionJson;
}
export interface ArtifactExtractionPort {
  prepare(context: ArtifactContext): Promise<PreparedArtifactExtraction>;
  invoke(context: ArtifactContext, prepared: PreparedArtifactExtraction, requestKey: string): Promise<ProductionJson>;
  validate(value: ProductionJson): ProductionJson;
}
export interface ArtifactConsumerPort {
  /** Caller binds its existing write guards. Idempotent by stepKey, including after a crash before checkpoint save. */
  apply(input: { context: ArtifactContext; output: ProductionJson; previous: ProductionJson; stepKey: string; claim?: ArtifactClaim }): Promise<ProductionJson>;
}
export interface ArtifactReconciliationPorts {
  checkpoints: ArtifactCheckpointPort;
  extraction: ArtifactExtractionPort;
  fullReconcile?: ArtifactExtractionPort;
  fullReconcileConsumer?: ArtifactConsumerPort;
  timeline?: { extraction: ArtifactExtractionPort; consumer: ArtifactConsumerPort };
  consumers: Record<ArtifactConsumer, ArtifactConsumerPort>;
  fence(context: ArtifactContext): Promise<void>;
  reserve(context: ArtifactContext, requestKey: string, outputTokens: number): Promise<boolean>;
  /** Identity resolution is caller-bound and idempotent; no model calls or workflow commands. */
  prepareCandidates?(context: ArtifactContext, output: ProductionJson): Promise<ProductionJson>;
}
