import type { AcceptanceVerdict, SelectionRecord } from "./types";

export function selectCandidate(original: AcceptanceVerdict, candidate: AcceptanceVerdict): SelectionRecord {
  const retain = (reasonCode: string): SelectionRecord => ({selected:"original",contentHash:original.contentHash,reasonCode});
  const select = (reasonCode: string): SelectionRecord => ({selected:"candidate",contentHash:candidate.contentHash,reasonCode});
  if (!candidate.gateAvailable || !["preserved","authorized_correction"].includes(candidate.factPreservation ?? "")) {
    return retain("original_retained_unverified_review");
  }
  if (candidate.proseRegression || candidate.replan === "global_book") return retain("original_retained_regression");
  const severe = (verdict: AcceptanceVerdict) => new Set(verdict.issues
    .filter(issue => issue.severity === "high" || issue.severity === "critical").map(issue => issue.code));
  const originalSevere = severe(original), candidateSevere = severe(candidate);
  if ([...candidateSevere].some(code => !originalSevere.has(code))) return retain("original_retained_new_severe_issue");
  // The structured kind names a category; summary identifies the actual obligation within it.
  const obligationKey = (item: AcceptanceVerdict["missingObligations"][number]) => JSON.stringify([item.kind,item.summary ?? null]);
  const originalMissing = new Set(original.missingObligations.map(obligationKey));
  const candidateMissing = new Set(candidate.missingObligations.map(obligationKey));
  if ([...candidateMissing].some(kind => !originalMissing.has(kind))
    || candidate.missingObligations.length > original.missingObligations.length) {
    return retain("original_retained_obligation_regression");
  }
  if (candidateSevere.size < originalSevere.size || candidateMissing.size < originalMissing.size
    || candidate.issues.length < original.issues.length) return select("candidate_improved");
  return retain("original_retained_no_clear_improvement");
}
