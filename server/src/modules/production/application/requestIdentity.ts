import { createHash } from "node:crypto";
import { z } from "zod";
import { canonicalProductionJson, cloneProductionData } from "../common";
import { defineProfile, type StageId } from "../domain";
import type { StageDescriptor, UnitRequest, UnitRun, UnitSnapshots } from "./ports";

export class InvalidProductionRequestError extends Error {
  constructor(message: string) { super(message); this.name = "InvalidProductionRequestError"; }
}
export class ProductionSnapshotConflictError extends Error {
  constructor() { super("The saved production request does not match this invocation"); this.name = "ProductionSnapshotConflictError"; }
}
const text = z.string().min(1);
const modelSchema = z.object({ provider: text, model: text, promptVersion: text, configVersion: text, inputFingerprint: text }).strict();
const descriptorSchema = z.object({ callsModel: z.boolean(), outputTokens: z.number().int().positive().optional(),
  input: z.unknown().optional(), inputFingerprint: text, promptVersion: text, configVersion: text }).strict().superRefine((descriptor, context) => {
  if (descriptor.callsModel && !descriptor.outputTokens) context.addIssue({ code: "custom", message: "Model output budget is required" });
});

export function validateUnitRequest(request: UnitRequest): UnitRequest {
  try {
    z.object({ ownerKey: text, unit: z.object({ novelId: text, chapterId: text, order: z.number().int().min(1) }).strict(),
      policy: z.object({ blockingAction: z.enum(["continue_with_warning", "pause_for_manual"]) }).strict(), model: modelSchema,
    }).passthrough().parse(request);
    const copied = cloneProductionData(request);
    copied.profile = defineProfile(copied.profile);
    return copied;
  } catch {
    throw new InvalidProductionRequestError("Invalid production identity, profile, policy or model snapshot");
  }
}
export function validateStageDescriptor(descriptor: StageDescriptor): StageDescriptor {
  try { return cloneProductionData(descriptorSchema.parse(descriptor)) as StageDescriptor; }
  catch { throw new InvalidProductionRequestError("A stage must describe its complete input and versions"); }
}
export function snapshotsFor(request: UnitRequest): UnitSnapshots {
  return { profile: request.profile, policy: request.policy, model: request.model,
    ...(request.policySource === undefined ? {} : { policySource: request.policySource }) };
}
export function assertRunMatches(request: UnitRequest, run: UnitRun): void {
  if (run.ownerKey !== request.ownerKey || canonicalProductionJson(run.progress.unit) !== canonicalProductionJson(request.unit)
    || canonicalProductionJson(run.snapshots) !== canonicalProductionJson(snapshotsFor(request))) {
    throw new ProductionSnapshotConflictError();
  }
  if (!Number.isSafeInteger(run.version) || run.version < 1 || Boolean(run.activeStage) !== Boolean(run.activeRequestKey)) {
    throw new InvalidProductionRequestError("Invalid persisted run version or claim");
  }
}
export function hashProductionContent(content: string): string { return createHash("sha256").update(content).digest("hex"); }
export function createStageRequestKey(request: UnitRequest, stage: StageId, descriptor: StageDescriptor, contentHash: string | null): string {
  return hashProductionContent(canonicalProductionJson({
    ownerKey: request.ownerKey, unit: request.unit, snapshots: snapshotsFor(request), stage, contentHash,
    descriptor: validateStageDescriptor(descriptor),
  }));
}
