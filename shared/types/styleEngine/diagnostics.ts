import { z } from "zod";

export const styleRiskLayerSchema = z.enum(["surface", "discourse", "narrative"]);
export type StyleRiskLayer = z.infer<typeof styleRiskLayerSchema>;

export const styleRewriteGuardSchema = z.object({
  sourceContentHash: z.string(),
  candidateContentHash: z.string(),
  policyRevision: z.string(),
  touchedRatio: z.number().nonnegative(),
  addedCharacters: z.number().int().nonnegative(),
  lengthChangeRatio: z.number(),
  checks: z.array(z.object({
    code: z.enum(["patch_scope", "edit_budget", "protected_terms", "semantic_facts"]),
    status: z.enum(["passed", "blocked", "not_checked"]),
    reason: z.string(),
  })),
});
export type StyleRewriteGuard = z.infer<typeof styleRewriteGuardSchema>;

export interface StyleRewriteBaseline {
  sourceContentHash: string;
  changes: Array<{ original: string; replacement: string }>;
  allowedCorrectionIssueIds: string[];
}

/** An enabled rule never overrides the AI's decision about this particular passage. */
export function isStyleIssueRewritable(issue: {
  layer?: StyleRiskLayer;
  canAutoRewrite?: boolean;
  issueCategory?: string;
}, rulePermission = true): boolean {
  return rulePermission && issue.canAutoRewrite === true
    && (issue.layer === "surface" || issue.layer === "discourse")
    && issue.issueCategory !== "story_structure";
}
