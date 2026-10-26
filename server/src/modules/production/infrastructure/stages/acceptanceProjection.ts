import { isStyleIssueRewritable } from "@ai-novel/shared/types/styleEngine";
import type { ChapterAcceptanceAssessmentOutput } from "../../../../prompting/prompts/novel/chapterAcceptance.prompts";
import type { AcceptanceVerdict } from "../../domain";
import { hashProductionContent } from "../../application";

/** Consumes the existing post-validated AI assessment. No textual classification or score-based decisions. */
export function projectAcceptance(input: {
  content: string;
  stage: "accept" | "verify";
  assessment: ChapterAcceptanceAssessmentOutput;
  originalContentHash?: string;
  allowedCorrectionIssueIds?: readonly string[];
  replan?: AcceptanceVerdict["replan"];
  proseRegression?: boolean;
}): AcceptanceVerdict {
  const assessment = input.assessment;
  const unavailable = assessment.riskTags.includes("acceptance_gate_unavailable");
  const partial = assessment.riskTags.includes("style_review_unavailable");
  const patch = assessment.repairDirectives.some(directive => directive.mode === "patch");
  const issues: AcceptanceVerdict["issues"][number][] = assessment.blockingIssues.map(issue => ({
    code: issue.code, severity: issue.severity, patchable: patch && (issue.category !== "voice" || isStyleIssueRewritable(issue)),
  }));
  for (const code of ["acceptance_gate_unavailable", "style_review_unavailable"]) {
    if (assessment.riskTags.includes(code) && !issues.some(issue => issue.code === code)) issues.push({ code, severity: "medium", patchable: false });
  }
  const verdict: AcceptanceVerdict = { contentHash: hashProductionContent(input.content),
    gateAvailable: !unavailable && (input.stage !== "verify" || !partial), issues,
    ...(partial || unavailable ? { reviewIncomplete: true } : {}),
    missingObligations: assessment.missingObligations.map(item => ({ kind: item.kind, summary: item.summary, repairability: assessment.repairability })),
    replan: input.replan ?? (assessment.repairability === "plan_misalignment" ? "local_window" : "none"),
    ...(input.proseRegression === undefined ? {} : { proseRegression: input.proseRegression }) };
  if (input.stage === "verify") {
    const verification = assessment.repairVerification;
    const facts = verification?.factPreservation;
    const valid = verification?.contentHash === verdict.contentHash && facts?.sourceContentHash === input.originalContentHash;
    const authorized = input.allowedCorrectionIssueIds ?? [];
    verdict.factPreservation = !valid || !facts ? "unknown" : facts.status === "changed" ? "violated"
      : facts.status === "preserved" && facts.correctionIssueIds.length === 0 ? "preserved"
      : facts.status === "authorized_correction" && facts.correctionIssueIds.length > 0
        && facts.correctionIssueIds.every(id => authorized.includes(id)) ? "authorized_correction" : "unknown";
  }
  return verdict;
}
