import { cloneProductionData, type ProductionJson } from "./serializedData";

export type ProductionSeverity = "low" | "medium" | "high" | "critical";
export interface ProductionQualityIssue { code: string; severity: ProductionSeverity; patchable: boolean }
export interface ProductionMissingObligation {
  kind: string;
  summary?: string;
  repairability: "patchable_obligation_gap" | "rewrite_needed" | "plan_misalignment" | "none";
}
/** Decision projection. Full source attribution remains in the lossless envelope below. */
export interface QualityDebt {
  code: string;
  severity: ProductionSeverity;
  source: "accept" | "repair" | "verify";
  issue?: ProductionQualityIssue;
  obligation?: ProductionMissingObligation;
}
export interface StopSignal { kind: "pause_for_manual" | "stop_for_replan"; reason: string }

export interface QualityDebtEnvelope {
  version: 1;
  longChapter?: { [key: string]: ProductionJson };
  shortStory?: string[];
}

/** Source owners retain their complete debt payloads; this envelope does not reinterpret them. */
export function createQualityDebtEnvelope(input: Omit<QualityDebtEnvelope, "version">): QualityDebtEnvelope {
  return cloneProductionData({ version: 1, ...input });
}

export interface ProductionStopInput {
  hasUsableContent: boolean;
  replan: "none" | "local_window" | "global_book";
  manualPause: boolean;
  integrityFailure?: boolean;
  runtimeFailure?: boolean;
}
export type ProductionStopDecision =
  | { kind: "continue" }
  | { kind: "pause_for_manual" }
  | { kind: "stop_for_replan"; scope: "global_book" }
  | { kind: "fail"; reason: "data_integrity" | "runtime_failure" | "no_usable_content" };

export function decideProductionStop(input: ProductionStopInput): ProductionStopDecision {
  if (input.integrityFailure) return { kind: "fail", reason: "data_integrity" };
  if (input.runtimeFailure) return { kind: "fail", reason: "runtime_failure" };
  if (!input.hasUsableContent) return { kind: "fail", reason: "no_usable_content" };
  if (input.replan === "global_book") return { kind: "stop_for_replan", scope: "global_book" };
  if (input.manualPause) return { kind: "pause_for_manual" };
  return { kind: "continue" };
}
