import { createHash } from "node:crypto";
import { z } from "zod";
import type {
  ChapterAcceptanceAssessmentOutput,
  ChapterAcceptancePromptInput,
} from "../chapterAcceptance.prompts";

export class ChapterRepairVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChapterRepairVerificationError";
  }
}

export const repairVerificationSchema = z.object({
  contentHash: z.string().trim().min(1),
  checks: z.array(z.object({
    kind: z.enum(["issue", "obligation"]),
    key: z.string().trim().min(1),
    status: z.enum(["resolved", "unresolved"]),
    currentEvidence: z.string().trim().min(1).max(350),
    reason: z.string().trim().min(1),
  })).max(20),
});

export function candidateContentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/** Retain requirements, but never present old evidence as candidate prose. */
export function buildRepairReviewChecklist(input: ChapterAcceptancePromptInput) {
  const baseline = input.repairReviewBaseline;
  if (!baseline) return null;
  return {
    contentHash: candidateContentHash(input.content),
    issues: [...new Map(baseline.blockingIssues.map(issue => [issue.code, {
      kind: "issue" as const, key: issue.code, category: issue.category,
      requirement: issue.fixSuggestion,
    }])).values()],
    obligations: [...new Map(baseline.missingObligations.map(item => [`${item.kind}:${item.summary}`, {
      kind: "obligation" as const, key: `${item.kind}:${item.summary}`, requirement: item.summary,
    }])).values()],
    repairDirectives: baseline.repairDirectives,
  };
}

function compactQuote(value: string): string {
  return value.replace(/\s+/gu, "");
}

/** Validate identities, coverage and literal evidence only; AI owns semantic judgments. */
export function validateRepairReview(
  output: ChapterAcceptanceAssessmentOutput,
  input: ChapterAcceptancePromptInput,
): ChapterAcceptanceAssessmentOutput {
  const checklist = buildRepairReviewChecklist(input);
  if (!checklist) return output;
  const verification = output.repairVerification;
  if (!verification || verification.contentHash !== checklist.contentHash) {
    throw new ChapterRepairVerificationError("修文复验未核对当前候选正文身份。");
  }
  const currentContent = compactQuote(input.content);
  const verifyQuote = (quote?: string) => {
    if (!quote || !compactQuote(quote) || !currentContent.includes(compactQuote(quote))) {
      throw new ChapterRepairVerificationError("修文复验证据不是当前候选正文的原句，不能使用历史证据。");
    }
  };
  const expected = new Set([...checklist.issues, ...checklist.obligations].map(item => `${item.kind}:${item.key}`));
  const seen = new Set<string>();
  const remaining = new Set([
    ...output.blockingIssues.map(issue => `issue:${issue.code}`),
    ...output.missingObligations.map(item => `obligation:${item.kind}:${item.summary}`),
  ]);
  for (const check of verification.checks) {
    const key = `${check.kind}:${check.key}`;
    if (!expected.has(key) || seen.has(key)) throw new ChapterRepairVerificationError("修文复验核对项不匹配或重复。");
    seen.add(key);
    verifyQuote(check.currentEvidence);
    if (check.status === "resolved" && remaining.has(key)) {
      throw new ChapterRepairVerificationError("修文复验把已解决项同时列为未解决问题。");
    }
    if (check.status === "unresolved" && output.status === "accepted") {
      throw new ChapterRepairVerificationError("修文复验存在未解决项，不能宣称全部验收通过。");
    }
  }
  if (seen.size !== expected.size) throw new ChapterRepairVerificationError("修文复验遗漏首次问题或义务核对项。");
  for (const issue of output.blockingIssues) verifyQuote(issue.currentEvidence);
  for (const item of output.missingObligations) verifyQuote(item.currentEvidence);
  return output;
}
