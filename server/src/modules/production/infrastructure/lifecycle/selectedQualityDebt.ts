import {chapterAcceptanceAssessmentSchema} from "../../../../prompting/prompts/novel/chapterAcceptance.prompts";
import {InvalidProductionRequestError, type UnitRun} from "../../application";

/** Compatibility view of this retained manuscript, consumed by every existing chapter debt reader. */
export function projectSelectedQualityLoop(run: UnitRun, evaluatedAt: string): Record<string, unknown> | undefined {
  const selected = run.progress.selected === "candidate" ? "verify" : "accept";
  const saved = run.artifacts.stageData?.[selected] as {assessment?: unknown} | undefined;
  if (!saved?.assessment && !run.snapshots.profile.stages.includes("accept")) return undefined;
  const parsed = chapterAcceptanceAssessmentSchema.safeParse(saved?.assessment);
  if (!parsed.success) throw new InvalidProductionRequestError("Selected assessment is invalid");
  const assessment = parsed.data, debts = run.progress.debts ?? [];
  const codes = [...new Set([...debts.map(debt => debt.code), ...assessment.blockingIssues.map(issue => issue.code),
    ...assessment.missingObligations.map(item => `obligation:${item.kind}`),
    ...assessment.riskTags.filter(code => ["acceptance_gate_unavailable", "style_review_unavailable"].includes(code))])];
  const hasDebt = debts.length > 0 || codes.length > 0;
  const rootCauseCode = !hasDebt || assessment.riskTags.includes("acceptance_gate_unavailable") ? "none"
    : run.progress.repairAttemptsUsed > 0 ? "draft_repair_exhausted"
      : assessment.missingObligations.length ? "draft_obligation_unmet" : "none";
  return {source: selected === "verify" ? "repair_recheck" : "pipeline_review", evaluatedAt,
    contentHash: run.progress.selectedContentHash, productionUnitRunId: run.id,
    overallStatus: hasDebt ? "risk" : "valid", recommendedAction: "continue",
    terminalAction: hasDebt ? "defer_and_continue" : "continue", rootCauseCode,
    signals: [], pauseReason: assessment.summary,
    qualityDebtAttribution: {repairAttemptsUsed: run.progress.repairAttemptsUsed,
      repairAttemptsAllowed: run.snapshots.profile.repair.maxAttempts, firstFailureIssueCodes: codes},
    productionDebts: debts};
}
