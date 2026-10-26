import type { AcceptanceVerdict, QualityDebt, UnitProgress } from "../types";

export function hasBlockingRisk(verdict: AcceptanceVerdict): boolean {
  return verdict.issues.some(issue => issue.severity === "high" || issue.severity === "critical")
    || verdict.missingObligations.some(item => item.repairability !== "none");
}
export function hasRepairableRisk(verdict: AcceptanceVerdict): boolean {
  return verdict.issues.some(issue => issue.patchable && (issue.severity === "high" || issue.severity === "critical"))
    || verdict.missingObligations.some(item => item.repairability === "patchable_obligation_gap");
}
export function collectQualityDebts(progress: UnitProgress, verdict?: AcceptanceVerdict): QualityDebt[] {
  const debts: QualityDebt[] = [];
  const source = progress.selected === "candidate" ? "verify" as const : "accept" as const;
  if (verdict) {
    if (!verdict.gateAvailable) debts.push({code:"review_unavailable",severity:"medium",source});
    for (const issue of verdict.issues) debts.push({code:issue.code,severity:issue.severity,source,issue});
    for (const obligation of verdict.missingObligations) {
      debts.push({code:`obligation:${obligation.kind}`,severity:"medium",source,obligation});
    }
    if (verdict.replan === "local_window") debts.push({code:"local_window_replan",severity:"medium",source});
  }
  if (progress.repairOutcome === "failed") {
    debts.push({code:`repair_failure:${progress.repairFailureCode ?? "unknown"}`,severity:"medium",source:"repair"});
  }
  return debts;
}
