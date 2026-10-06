import { z } from "zod";
import type { ChapterAcceptanceAssessmentOutput, ChapterAcceptancePromptInput } from "../chapterAcceptance.prompts";

// Reference existing voice evidence instead of asking the model to repeat the same findings.
export const acceptanceStyleReviewSchema = z.object({
  riskScore: z.number().int().min(0).max(100),
  summary: z.string().trim().min(1),
  issueCodes: z.array(z.string().trim().min(1)).max(5),
});

export function validateAcceptanceStyleReview(
  output: ChapterAcceptanceAssessmentOutput,
  input: ChapterAcceptancePromptInput,
): ChapterAcceptanceAssessmentOutput {
  if (!input.styleReviewEnabled) return { ...output, styleReview: null };
  const review = output.styleReview;
  if (!review) throw new Error("写法与反 AI 检测必须返回 styleReview，不能将缺失报告作为通过。");
  const codes = new Set(review.issueCodes);
  if (codes.size !== review.issueCodes.length || review.issueCodes.some(code => (
    !output.blockingIssues.some(issue => issue.code === code && issue.category === "voice")
  ))) throw new Error("styleReview 的写法问题必须引用同次验收中真实的 voice 问题 code。");
  for (const issue of output.blockingIssues.filter(item => codes.has(item.code))) {
    if ((input.styleRuleIds?.length && issue.styleRuleId === undefined)
      || (issue.styleRuleId && input.styleRuleIds && !input.styleRuleIds.includes(issue.styleRuleId))) {
      throw new Error("写法检测必须明确引用有效 styleRuleId，普通写法问题使用 null。");
    }
  }
  return output;
}
