import { createHash } from "node:crypto";
import { applyChapterPatchRepairPlan, type ChapterPatchRepairPlan } from "@ai-novel/shared/types/chapterPatchRepair";
import type { StyleRewriteBaseline, StyleRewriteGuard } from "@ai-novel/shared/types/styleEngine";

export const STYLE_REWRITE_POLICY_REVISION = "style-patch-v1";
const count = (text: string) => Array.from(text.replace(/\s/gu, "")).length;
export const styleContentHash = (text: string) => createHash("sha256").update(text).digest("hex");

/** Safety anchors only: this does not classify style or infer narrative facts. */
function numericTerms(text: string): string[] {
  return text.match(/\d+(?:[.,:/-]\d+)*(?:%|％)?/gu) ?? [];
}

function occurrences(text: string, term: string): number {
  return text.split(term).length - 1;
}

export function guardStylePatches(input: {
  original: string;
  plan: ChapterPatchRepairPlan;
  allowedIssueIds: string[];
  styleIssueIds: string[];
  protectedTerms?: string[];
}): { content: string; guard: StyleRewriteGuard; baseline: StyleRewriteBaseline } {
  const applied = applyChapterPatchRepairPlan(input.original, input.plan);
  const allowed = new Set(input.allowedIssueIds);
  const style = new Set(input.styleIssueIds);
  const scopeValid = applied.success && input.plan.patches.every(patch => patch.issueIds.length > 0
    && patch.issueIds.every(id => allowed.has(id)));
  const total = Math.max(1, count(input.original));
  const touchedRatio = input.plan.patches.reduce((sum, patch) => sum + count(patch.targetExcerpt), 0) / total;
  const addedCharacters = input.plan.patches.reduce((sum, patch) => sum
    + Math.max(0, count(patch.replacement) - count(patch.targetExcerpt)), 0);
  const lengthChangeRatio = (count(applied.content) - count(input.original)) / total;
  // Short pasted selections have a different denominator from full chapters.
  const budgetValid = touchedRatio <= (total < 500 ? 1 : 0.3)
    && addedCharacters / total <= (total < 500 ? 0.2 : 0.05)
    && Math.abs(lengthChangeRatio) <= 0.3;
  const protectedValid = input.plan.patches.every(patch => {
    // Explicit non-style repair may correct an erroneous draft fact. AI reacceptance
    // must separately verify the correction against its issue and canonical context.
    if (patch.issueIds.some(id => !style.has(id))) return true;
    const terms = new Set([...numericTerms(patch.targetExcerpt), ...numericTerms(patch.replacement),
      ...(input.protectedTerms ?? []).filter(Boolean)]);
    return [...terms].every(term => occurrences(patch.targetExcerpt, term) === occurrences(patch.replacement, term));
  });
  const guard: StyleRewriteGuard = {
    sourceContentHash: styleContentHash(input.original), candidateContentHash: styleContentHash(applied.content),
    policyRevision: STYLE_REWRITE_POLICY_REVISION, touchedRatio, addedCharacters, lengthChangeRatio,
    checks: [
      { code: "patch_scope", status: scopeValid ? "passed" : "blocked", reason: scopeValid ? "本次需要修改的片段已核对。" : "修订包含尚未确认的修改或无法可靠定位的片段，保留原稿。" },
      { code: "edit_budget", status: budgetValid ? "passed" : "blocked", reason: budgetValid ? "修改范围与篇幅在保护范围内。" : "修改范围或新增篇幅过大，保留原稿。" },
      { code: "protected_terms", status: protectedValid ? "passed" : "blocked", reason: protectedValid ? "表达补丁保留了明确保护的原文词项。" : "表达补丁改变了数字或受保护专名，保留原稿。" },
      { code: "semantic_facts", status: "not_checked", reason: "原文词项保护不代表人物行为与设定一致，语义由候选复验核对。" },
    ],
  };
  return {
    content: guard.checks.some(check => check.status === "blocked") ? input.original : applied.content,
    guard,
    baseline: {
      sourceContentHash: guard.sourceContentHash,
      changes: input.plan.patches.map(patch => ({ original: patch.targetExcerpt, replacement: patch.replacement })),
      allowedCorrectionIssueIds: [...new Set(input.plan.patches.flatMap(patch => patch.issueIds))]
        .filter(id => allowed.has(id) && !style.has(id)),
    },
  };
}

export function isStyleRewriteBlocked(guard?: StyleRewriteGuard): boolean {
  return Boolean(guard?.checks.some(check => check.status === "blocked"));
}
