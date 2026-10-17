import { StructuredOutputError } from "../../../../llm/structuredOutput";
import { ChapterRepairVerificationError, ChapterStyleReviewValidationError, ChapterContinuityReviewValidationError } from "../../../../prompting/prompts/novel/acceptance";

/** Persist safe, actionable diagnostics; provider responses and credentials stay out of reports. */
export function describeAcceptanceFailure(error: unknown): { code: string; message: string } {
  if (error instanceof ChapterContinuityReviewValidationError) {
    return {code:"continuity_review_evidence_invalid", message:error.message};
  }
  if (error instanceof ChapterStyleReviewValidationError) {
    return { code: `style_review_${error.code}`, message: error.message };
  }
  if (error instanceof ChapterRepairVerificationError) {
    return { code: "repair_review_evidence_invalid", message: "修文复验的正文身份、证据或逐项核对未通过，保留原稿供复查。" };
  }
  if (error instanceof StructuredOutputError) {
    return { code: `acceptance_${error.category}`, message: error.category === "transport_error"
      ? "模型连接未完成，章节检查没有可用结果。"
      : "模型返回的检查结果格式不符合要求，章节检查未完成。" };
  }
  if (error && typeof error === "object" && "promptQualityFailureKind" in error
    && error.promptQualityFailureKind === "post_validate_failed") {
    return { code: "acceptance_result_invalid", message: "模型检查结果未通过正文与合同核对，不能作为通过结论。" };
  }
  return { code: "acceptance_invocation_failed", message: "章节检查调用未完成，请保留正文并从章节页面重新审校。" };
}
