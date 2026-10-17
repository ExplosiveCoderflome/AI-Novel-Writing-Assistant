import { z } from "zod";
import { styleRiskLayerSchema } from "@ai-novel/shared/types/styleEngine";
import type { ChapterAcceptanceAssessmentOutput, ChapterAcceptancePromptInput } from "../chapterAcceptance.prompts";
import { validateRepairReview } from "./repairVerification";
import { validateContinuityReview } from "./continuityReview";

export class ChapterStyleReviewValidationError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "ChapterStyleReviewValidationError";
  }
}

// Reference existing voice evidence instead of asking the model to repeat the same findings.
export const acceptanceStyleReviewSchema = z.object({
  riskScore: z.number().int().min(0).max(100),
  summary: z.string().trim().min(1),
  issueCodes: z.array(z.string().trim().min(1)).max(5),
  perspectiveCheck: z.object({
    observed: z.enum(["first_person", "third_person", "mixed", "uncertain"]),
    evidence: z.string().trim().min(1).max(350).describe("连续引用叙述正文，人称以叙述者为准，不用角色对话中的我判断。"),
  }).optional(),
  observations: z.array(z.object({
    code: z.string().trim().min(1),
    styleRuleId: z.string().trim().min(1).nullable().describe("规则目录原始 ID；普通写法合同问题为 null，不能使用统计标签。"),
    layer: styleRiskLayerSchema,
    severity: z.enum(["low", "medium", "high"]),
    evidence: z.string().trim().min(1).max(350).describe("连续复制当前正文的原句，禁止概括、改写、拼接或添加省略号。"),
    reason: z.string().trim().min(1),
    fixSuggestion: z.string().trim().min(1),
  // Three model observations plus up to five permission-deferred voice issues.
  })).max(8).default([]),
});

// The model supplies semantic issues once; runtime owns their redundant references.
export const acceptanceStyleReviewModelSchema = acceptanceStyleReviewSchema.omit({ issueCodes: true });

export function validateAcceptanceStyleReview(
  output: ChapterAcceptanceAssessmentOutput,
  input: ChapterAcceptancePromptInput,
): ChapterAcceptanceAssessmentOutput {
  if (!input.styleReviewEnabled) return { ...output, styleReview: null };
  const review = output.styleReview;
  if (!review) throw new ChapterStyleReviewValidationError("report_missing", "写法与反 AI 检测必须返回 styleReview，不能将缺失报告作为通过。");
  if (input.expectedNarrativePov) {
    const check = review.perspectiveCheck;
    if (!check) throw new ChapterStyleReviewValidationError("perspective_missing", "风格检查缺少实际叙述人称核对，不能只复述参考写法。");
    if (!input.content.replace(/\s/gu, "").includes(check.evidence.replace(/\s/gu, ""))) {
      throw new ChapterStyleReviewValidationError("perspective_evidence_invalid", "叙述人称核对必须连续引用当前正文。");
    }
    const mismatch = input.expectedNarrativePov !== "mixed" && check.observed !== input.expectedNarrativePov;
    if ((mismatch || check.observed === "uncertain") && !(review.observations ?? []).some(item => (
      item.code === (check.observed === "uncertain" ? "narrative_pov_uncertain" : "narrative_pov_mismatch")
      && item.layer === "narrative"
    ))) throw new ChapterStyleReviewValidationError("perspective_conflict_unreported", "叙述人称不符或无法确认时须记录叙事建议，不能宣布写法通过。");
  }
  const codes = new Set(review.issueCodes);
  if (codes.size !== review.issueCodes.length || review.issueCodes.some(code => (
    !output.blockingIssues.some(issue => issue.code === code && issue.category === "voice")
  ))) throw new ChapterStyleReviewValidationError("issue_reference_invalid", "styleReview 的写法问题必须引用同次验收中真实的 voice 问题 code。");
  for (const issue of output.blockingIssues.filter(item => codes.has(item.code))) {
    if (!issue.layer || issue.canAutoRewrite === undefined) {
      throw new ChapterStyleReviewValidationError("permission_missing", "写法问题必须明确诊断层次与本次自动修文许可。");
    }
    if (!input.content.replace(/\s/gu, "").includes((issue.currentEvidence ?? issue.evidence).replace(/\s/gu, ""))) {
      throw new ChapterStyleReviewValidationError("evidence_invalid", "写法问题证据必须引用当前正文原句。");
    }
    if ((input.styleRuleIds?.length && issue.styleRuleId === undefined)
      || (issue.styleRuleId && input.styleRuleIds && !input.styleRuleIds.includes(issue.styleRuleId))) {
      throw new ChapterStyleReviewValidationError("rule_reference_invalid", "写法检测必须明确引用有效 styleRuleId，普通写法问题使用 null。");
    }
  }
  const observed = new Set<string>();
  for (const item of review.observations ?? []) {
    if (codes.has(item.code) || observed.has(item.code)) throw new ChapterStyleReviewValidationError("issue_reference_invalid", "写法提醒不能重复修文问题或提醒 code。");
    observed.add(item.code);
    if ((item.styleRuleId && !input.styleRuleIds?.includes(item.styleRuleId))
      || !input.content.replace(/\s/gu, "").includes(item.evidence.replace(/\s/gu, ""))) {
      throw new ChapterStyleReviewValidationError("observation_invalid", "写法提醒必须引用有效规则与当前正文原句。");
    }
  }
  return output;
}

/** A failed style citation cannot authorize a rewrite or erase the independent story review. */
export function recoverAcceptanceStyleReview(output: ChapterAcceptanceAssessmentOutput, input: ChapterAcceptancePromptInput) {
  validateRepairReview(output, input);
  validateContinuityReview(output, input);
  try {
    return validateAcceptanceStyleReview(output, input);
  } catch (error) {
    if (!(error instanceof ChapterStyleReviewValidationError)) throw error;
    return {
      ...output,
      styleReview: null,
      styleReviewFailure: {code: error.code, message: error.message},
      blockingIssues: [...output.blockingIssues.filter(issue => issue.category !== "voice"), {
        category: "mode_fit" as const, severity: "medium" as const, code: "style_review_unavailable",
        evidence: error.message, fixSuggestion: "正文已保留，请从章节页面重新检查写法。",
      }],
      repairDirectives: output.repairDirectives.filter(directive => directive.target !== "voice"),
      status: output.status === "accepted" ? "continue_with_risk" as const : output.status,
      riskTags: [...new Set([...output.riskTags, "style_review_unavailable", `style_review_${error.code}`])],
    };
  }
}
