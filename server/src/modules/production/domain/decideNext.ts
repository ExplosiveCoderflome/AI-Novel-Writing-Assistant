import { isStageEnabled } from "./profile";
import { collectQualityDebts, hasBlockingRisk, hasRepairableRisk } from "./rules/quality";
import type { AcceptanceVerdict, IssuePolicySnapshot, ProductionProfile, UnitAction, UnitProgress } from "./types";

export function decideNext(input: {profile: ProductionProfile; policy: IssuePolicySnapshot; unit: UnitProgress;
  lastVerdict?: AcceptanceVerdict}): UnitAction {
  const {profile,policy,unit} = input;
  const has = (stage: UnitProgress["completed"][number]) => unit.completed.includes(stage);
  if (unit.userEditedSinceStart) return {kind:"pause_for_manual",reason:"user_edited"};
  if (!Number.isInteger(unit.repairAttemptsUsed) || unit.repairAttemptsUsed < 0 || unit.repairAttemptsUsed > 1) {
    return {kind:"fail",reason:"data_integrity"};
  }
  if (!has("prepare")) return {kind:"run_stage",stage:"prepare"};
  if (!unit.original?.contentHash) return has("draft") ? {kind:"fail",reason:"no_usable_content"} : {kind:"run_stage",stage:"draft"};
  if (isStageEnabled(profile,"accept") && !has("accept")) return {kind:"run_stage",stage:"accept"};
  const original = unit.original.verdict;
  if ((has("accept") && !original) || (original && original.contentHash !== unit.original.contentHash)) {
    return {kind:"fail",reason:"data_integrity"};
  }
  if (original?.replan === "global_book") return {kind:"stop_for_replan",scope:"global_book"};
  // A real candidate must close verification/selection before considering remaining repair allowance.
  if (unit.candidate) {
    if (!has("repair") || unit.candidate.contentHash === unit.original.contentHash) return {kind:"fail",reason:"data_integrity"};
    if (!has("verify")) return {kind:"run_stage",stage:"verify"};
    if (!unit.candidate.verdict || unit.candidate.verdict.contentHash !== unit.candidate.contentHash) return {kind:"fail",reason:"data_integrity"};
    if (!has("select")) return {kind:"run_stage",stage:"select"};
    if (!unit.selected) return {kind:"fail",reason:"data_integrity"};
  }
  const verdict = unit.selected === "candidate" ? unit.candidate?.verdict : original;
  if (!unit.selected) {
    const canRepair = !has("repair") && unit.repairAttemptsUsed < profile.repair.maxAttempts
      && profile.repair.mode !== "detect_only" && isStageEnabled(profile,"repair")
      && original?.gateAvailable && original.replan === "none" && hasRepairableRisk(original);
    if (canRepair) return {kind:"run_stage",stage:"repair"};
    return {kind:"select_final",selected:"original",contentHash:unit.original.contentHash,
      reasonCode:original?.gateAvailable && !hasBlockingRisk(original) && !original.issues.length
        && !original.missingObligations.length && original.replan === "none" ? "original_accepted" : "original_retained"};
  }
  if (unit[unit.selected]?.contentHash !== unit.selectedContentHash) return {kind:"fail",reason:"data_integrity"};
  const debts = collectQualityDebts(unit,verdict);
  if (debts.length && !unit.debtRecorded && !has("commit")) return {kind:"record_debt",debts,then:"commit"};
  if (!has("commit")) return {kind:"run_stage",stage:"commit"};
  if (unit.committedContentHash !== unit.selectedContentHash || unit.reconcileStatus === "failed") return {kind:"fail",reason:"data_integrity"};
  if (policy.blockingAction === "pause_for_manual" && verdict
    && (hasBlockingRisk(verdict) || !verdict.gateAvailable || verdict.reviewIncomplete) && !unit.qualityPause?.acknowledged) {
    if (!unit.qualityPause) return {kind:"record_quality_pause",contentHash:unit.committedContentHash!,reason:"blocking_quality_policy"};
    return {kind:"pause_for_manual",reason:"blocking_quality_policy"};
  }
  if (isStageEnabled(profile,"reconcile") && !has("reconcile")) return {kind:"run_stage",stage:"reconcile"};
  return {kind:"done"};
}
