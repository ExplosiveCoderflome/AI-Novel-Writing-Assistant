import type { StepResult } from "../../../modules/director";
import type { UnitOutcome, UnitRef } from "../../../modules/production";
type StopSignal = NonNullable<StepResult["stopSignal"]>;

export interface MappedProductionUnit {
  unit: UnitRef;
  closed: boolean;
  debts: NonNullable<StepResult["debts"]>;
  stopSignal?: StopSignal;
}

/** Maps saved structured decisions only; completed means finalized assets, not an absence of quality debt. */
export function mapProductionUnitOutcome(outcome: UnitOutcome): MappedProductionUnit {
  const progress = outcome.progress;
  const saved = Boolean(progress.selected && progress.selectedContentHash
    && progress.committedContentHash === progress.selectedContentHash && progress.completed.includes("commit"));
  const manual = outcome.status === "paused";
  const debts = [...new Set(progress.debts?.map(debt => debt.code) ?? [])].map(code => ({ chapterOrder: progress.unit.order,
    code, action: manual ? "pause_for_manual" : "defer_and_continue" }));
  const result: MappedProductionUnit = { unit: { ...progress.unit }, closed: false, debts };
  const stop = (signal: StopSignal): MappedProductionUnit => ({ ...result, stopSignal: signal });
  const integrity = () => stop({ kind: "data_integrity", action: "fail_task", source: "runtime", reason: "章节正文与完成记录不一致，请返回章节页面检查。" });
  if (outcome.status === "completed") {
    if (!saved || !progress.completed.includes("reconcile") || !["completed", "degraded"].includes(progress.reconcileStatus ?? "")) return integrity();
    return { ...result, closed: true };
  }
  if (manual) {
    if (progress.styleReviewPause && !progress.styleReviewPause.acknowledged) {
      if (progress.committedContentHash || !progress.selectedContentHash
        || progress.styleReviewPause.contentHash !== progress.selectedContentHash) return integrity();
      // A book-level opt-in review rejection is a runtime gate: it must block commit in
      // any issue policy, so it cannot rely on the quality_first-only pause signal.
      return stop({ kind: "manual_recovery", action: "pause_for_manual", source: "runtime",
        reason: "本章写法复核未通过，请从章节页面确认后继续创作。" });
    }
    if (!saved || !progress.qualityPause || progress.qualityPause.acknowledged
      || progress.qualityPause.contentHash !== progress.committedContentHash) return integrity();
    return stop({ kind: "manual_recovery", action: "pause_for_manual", source: "quality", reason: "本章正文已保存，请从章节页面检查质量提醒后继续创作。" });
  }
  if (outcome.status === "stopped" && outcome.reason === "global_book") {
    return stop({ kind: "replan", action: "stop_for_replan", source: "quality", reason: "当前章节需要调整整书规划，请从创作页面检查后续安排。" });
  }
  if (outcome.status === "failed") {
    if (outcome.reason === "data_integrity") return integrity();
    if (outcome.reason === "no_usable_content") return stop({kind: "manual_recovery", action: "pause_for_manual", source: "runtime", reason: "generation_output_unusable"});
    return stop({ kind: "safety", action: "fail_task", source: "runtime", reason: "本章写作未能安全完成，请返回章节页面检查。" });
  }
  return stop({ kind: "manual_recovery", action: "pause_for_manual", source: "runtime",
    reason: outcome.status === "budget_exhausted" ? "本章可用额度不足，请从创作页面调整额度后继续。" : "本章写作结果尚未确认，请返回章节页面检查后继续。" });
}
