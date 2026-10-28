import type { ProductionJson } from "../../common";
export interface ArtifactStepIdentity {
  runId: string;
  ownerKey: string;
  novelId: string;
  chapterId: string;
  contentHash: string;
  unitRequestKey: string;
  stepKey: string;
  step: string;
  executionToken: string;
  kind: "model" | "consumer";
}
export interface ArtifactClaim { identity: ArtifactStepIdentity; token: string; attempt: number }
export type ArtifactClaimResult = { status: "claimed"; claim: ArtifactClaim }
  | { status: "cached"; value: ProductionJson }
  | { status: "busy" | "unknown" | "exhausted" | "not_started" };
export interface ArtifactCheckpointPort {
  /** existingOnly reads a saved result without creating a claim or authorizing model dispatch. */
  claim(identity: ArtifactStepIdentity, options?: { existingOnly?: boolean }): Promise<ArtifactClaimResult>;
  succeed(claim: ArtifactClaim, value: ProductionJson): Promise<void>;
  fail(claim: ArtifactClaim): Promise<void>;
  /**
   * Only for a request known to have produced no durable effect: either it was
   * never dispatched (a pre-dispatch budget refusal), or it was dispatched but
   * answered with unusable output and the port wrote nothing (a retryable
   * structured-output failure). Any other outcome stays claimed.
   */
  release(claim: ArtifactClaim): Promise<void>;
}
