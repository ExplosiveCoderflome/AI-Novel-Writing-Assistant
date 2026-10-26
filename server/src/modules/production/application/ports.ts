import type { IssuePolicySnapshot, ProductionProfile, StageId, StageResult, UnitProgress, UnitRef } from "../domain";
import type { ProductionBudgetReservation, ProductionJson } from "../common";

export interface ModelSnapshot {
  provider: string;
  model: string;
  promptVersion: string;
  configVersion: string;
  inputFingerprint: string;
}
export interface UnitRequest {
  ownerKey: string;
  unit: UnitRef;
  profile: ProductionProfile;
  policy: IssuePolicySnapshot;
  model: ModelSnapshot;
  /** Complete resolved caller policy, retained without reducing it to blockingAction. */
  policySource?: ProductionJson;
}
export interface UnitSnapshots {
  profile: ProductionProfile;
  policy: IssuePolicySnapshot;
  model: ModelSnapshot;
  policySource?: ProductionJson;
}
export interface StageDescriptor {
  callsModel: boolean;
  outputTokens?: number;
  input?: ProductionJson;
  inputFingerprint: string;
  promptVersion: string;
  configVersion: string;
}
export interface ChapterWrite {
  expected: { content: string | null; updatedAt: string };
  content: string;
  generationState: "drafted" | "repaired";
  chapterStatus: "pending_review" | "needs_repair";
}
export interface StageReply {
  result: StageResult;
  artifacts?: { original?: string; candidate?: string; prepared?: ProductionJson; reconciliation?: ProductionJson;
    stageData?: Partial<Record<StageId, ProductionJson>> };
  chapterWrite?: ChapterWrite;
}
export interface UnitArtifacts {
  original?: string;
  candidate?: string;
  prepared?: ProductionJson;
  reconciliation?: ProductionJson;
  stageData?: Partial<Record<StageId, ProductionJson>>;
  receipts: Partial<Record<StageId, { requestKey: string; result: StageResult }>>;
  activeDescriptor?: StageDescriptor;
  /** A proven unsent request retains its exact input when explicit budget recovery permits another execution. */
  deferredDescriptor?: {stage: StageId; descriptor: StageDescriptor};
}
export interface UnitRun {
  id: string;
  ownerKey: string;
  version: number;
  snapshots: UnitSnapshots;
  progress: UnitProgress;
  artifacts: UnitArtifacts;
  activeStage: StageId | null;
  activeRequestKey: string | null;
}
export type UnitRunUpdate = Pick<UnitRun, "progress" | "artifacts" | "activeStage" | "activeRequestKey">;
export interface UnitProgressStore {
  loadOrCreate(request: UnitRequest): Promise<UnitRun>;
  /** Atomic CAS; a ChapterWrite must share its transaction with progress and its receipt. */
  compareAndSwap(expected: UnitRun, next: UnitRunUpdate, chapterWrite?: ChapterWrite): Promise<UnitRun | null>;
}
export type FencePoint = "loaded" | "before_claim" | "before_execute" | "after_execute" | "before_save";
export type Fence = (run: UnitRun, point: FencePoint) => Promise<void>;
export interface BudgetPort {
  /** Persist before dispatch, idempotent by requestKey, bounded by the caller's saved policy. */
  reserve(input: { runId: string; stage: StageId; requestKey: string; outputTokens: number }): Promise<ProductionBudgetReservation>;
}
export interface StagePort {
  /** Read-only preparation: no model calls or business writes. Fingerprint the full actual input. */
  describe(run: UnitRun): Promise<StageDescriptor>;
  execute(run: UnitRun, invocation: StageDescriptor & { requestKey: string }): Promise<StageReply>;
  /** Only fetch already durable results. Never dispatch/retry a model from this method. */
  recover?(run: UnitRun, requestKey: string): Promise<StageReply | undefined>;
}
export interface StoryStatePort {
  read(novelId: string, beforeChapterOrder: number): Promise<ProductionJson>;
  reconcile(run: UnitRun): Promise<StageReply>;
}
export interface UnitPorts {
  store: UnitProgressStore;
  fence: Fence;
  budget: BudgetPort;
  stages: Partial<Record<Exclude<StageId, "select">, StagePort>>;
}
export interface UnitOutcome {
  status: "completed" | "paused" | "stopped" | "failed" | "busy" | "unknown" | "budget_exhausted" | "pending";
  progress: UnitProgress;
  reason?: string;
}
