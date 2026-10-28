import type { ProductionSeverity, ProductionQualityIssue, ProductionMissingObligation, QualityDebt } from "../common/index";
export type { QualityDebt, StopSignal } from "../common/index";
export const STAGES = ["prepare", "draft", "accept", "repair", "verify", "select", "commit", "reconcile"] as const;
export type StageId = typeof STAGES[number];
export interface UnitRef { novelId: string; chapterId: string; order: number }
export type Severity = ProductionSeverity;
export interface AcceptanceVerdict {
  contentHash: string;
  gateAvailable: boolean;
  issues: ReadonlyArray<ProductionQualityIssue>;
  missingObligations: ReadonlyArray<ProductionMissingObligation>;
  replan: "none" | "local_window" | "global_book";
  factPreservation?: "preserved" | "authorized_correction" | "violated" | "unknown";
  proseRegression?: boolean;
  reviewIncomplete?: boolean;
}
export interface ProductionProfile {
  id: string;
  stages: StageId[];
  repair: { maxAttempts: 0 | 1; mode: "light_repair" | "heavy_repair" | "detect_only" };
  context: string;
  reconcile: "adaptive" | "deferred" | "strict";
  outputBudgets: Partial<Record<StageId, number>>;
  capabilities: string[];
}
export interface IssuePolicySnapshot { blockingAction: "continue_with_warning" | "pause_for_manual" }
export interface SelectionRecord {
  selected: "original" | "candidate";
  contentHash: string;
  reasonCode: string;
}
export type StageResult =
  | { stage: "prepare" }
  | { stage: "draft"; contentHash: string | null }
  | { stage: "accept" | "verify"; verdict: AcceptanceVerdict }
  | { stage: "repair"; outcome: "candidate"; contentHash: string }
  | { stage: "repair"; outcome: "failed" | "unchanged"; failureCode?: string }
  | { stage: "select"; selection: SelectionRecord }
  | { stage: "commit"; contentHash: string }
  | { stage: "reconcile"; status: "completed" | "degraded" | "pending" | "failed" };
export interface UnitProgress {
  unit: UnitRef;
  completed: ReadonlyArray<StageId>;
  repairAttemptsUsed: number;
  original?: { contentHash: string; verdict?: AcceptanceVerdict };
  candidate?: { contentHash: string; verdict?: AcceptanceVerdict };
  selected?: "original" | "candidate";
  selectedContentHash?: string;
  selectionReasonCode?: string;
  committedContentHash?: string;
  userEditedSinceStart?: boolean;
  repairOutcome?: "candidate" | "failed" | "unchanged";
  repairFailureCode?: string;
  debts?: ReadonlyArray<QualityDebt>;
  debtRecorded?: boolean;
  reconcileStatus?: "completed" | "degraded" | "pending" | "failed";
  stageResults?: Partial<Record<StageId, StageResult>>;
  qualityPause?: { contentHash: string; reason: "blocking_quality_policy"; acknowledged: boolean };
}
export type UnitAction =
  | { kind: "run_stage"; stage: StageId }
  | ({ kind: "select_final" } & SelectionRecord)
  | { kind: "record_debt"; debts: QualityDebt[]; then: "commit" }
  | { kind: "record_quality_pause"; contentHash: string; reason: "blocking_quality_policy" }
  | { kind: "acknowledge_quality_pause"; contentHash: string }
  | { kind: "pause_for_manual"; reason: string }
  | { kind: "stop_for_replan"; scope: "local_window" | "global_book" }
  | { kind: "fail"; reason: "no_usable_content" | "data_integrity" }
  | { kind: "done" };
