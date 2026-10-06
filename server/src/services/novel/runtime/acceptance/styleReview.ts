import type { GenerationContextPackage, RuntimeStyleDetectionReport } from "@ai-novel/shared/types/chapterRuntime";
import type { PromptContextBlock } from "../../../../prompting/core/promptTypes";
import { createContextBlock } from "../../../../prompting/core/contextBudget";
import { buildWriterStyleContractText } from "../../../styleEngine/styleContractText";
import type { ChapterAcceptanceAssessmentOutput } from "../../../../prompting/prompts/novel/chapterAcceptance.prompts";

function contractFor(context: GenerationContextPackage) {
  return context.chapterReviewContext?.styleContract
    ?? context.chapterWriteContext?.styleContract
    ?? context.styleContext?.compiledBlocks?.contract;
}

export function isAcceptanceStyleReviewEnabled(context: GenerationContextPackage): boolean {
  return context.postGenerationStyleReviewEnabled !== false
    && Boolean(buildWriterStyleContractText(contractFor(context)).trim());
}

export function getAcceptanceStyleRuleIds(context: GenerationContextPackage): string[] {
  const meta = contractFor(context)?.meta;
  return Array.from(new Set([...(meta?.globalAntiAiRuleIds ?? []), ...(meta?.styleAntiAiRuleIds ?? []),
    ...(meta?.antiAiRulePolicies ?? []).map(rule => rule.id)]));
}

/** Apply the same authoritative style context to invocation and cache identity. */
export function applyAcceptanceStyleContext(
  context: GenerationContextPackage,
  blocks: PromptContextBlock[],
): PromptContextBlock[] {
  const result = blocks.filter(block => block.group !== "style_contract");
  if (isAcceptanceStyleReviewEnabled(context)) result.push(createContextBlock({
    id: "style_contract", group: "style_contract", reuseScope: "book", priority: 74,
    required: true, allowSummary: false,
    content: [buildWriterStyleContractText(contractFor(context)),
      ...(contractFor(context)?.meta.antiAiRulePolicies?.length ? [
        "反 AI 规则目录（对应上面的规则；autoRewrite 表示是否允许自动修文）：",
        ...contractFor(context)!.meta.antiAiRulePolicies!.map(rule => JSON.stringify(rule)),
      ] : []),
    ].join("\n"),
  }));
  return result;
}

export function buildAcceptanceStyleReport(
  context: GenerationContextPackage,
  assessment: ChapterAcceptanceAssessmentOutput,
): RuntimeStyleDetectionReport | null {
  if (!isAcceptanceStyleReviewEnabled(context) || !assessment.styleReview) return null;
  const codes = new Set(assessment.styleReview.issueCodes);
  const meta = contractFor(context)?.meta;
  const violations = assessment.blockingIssues.filter(issue => codes.has(issue.code) && issue.category === "voice")
    .map(issue => {
      const rule = meta?.antiAiRulePolicies?.find(item => item.id === issue.styleRuleId);
      const ruleId = issue.styleRuleId ?? issue.code;
      return {
      ruleId, ruleName: rule?.name ?? "写法与反 AI 表达", ruleType: rule?.type ?? "style" as const,
      severity: issue.severity === "critical" ? "high" as const : issue.severity,
      source: meta?.globalAntiAiRuleIds?.includes(ruleId) ? "global_anti_ai" as const
        : meta?.styleAntiAiRuleIds?.includes(ruleId) ? "style_anti_ai" as const : "style_contract" as const,
      issueCategory: "style_expression" as const,
      excerpt: issue.currentEvidence ?? issue.evidence,
      reason: issue.evidence, suggestion: issue.fixSuggestion,
      canAutoRewrite: rule?.autoRewrite !== false
        && assessment.repairDirectives.some(directive => directive.target === "voice" && directive.mode === "patch"),
    }; });
  return {
    riskScore: assessment.styleReview.riskScore, summary: assessment.styleReview.summary,
    violations, canAutoRewrite: violations.some(item => item.canAutoRewrite),
    appliedRuleIds: getAcceptanceStyleRuleIds(context),
  };
}

/** Respect explicit per-rule permissions after AI has identified the violated rule. */
export function applyAcceptanceStyleRepairPolicy(
  context: GenerationContextPackage,
  assessment: ChapterAcceptanceAssessmentOutput,
): ChapterAcceptanceAssessmentOutput {
  if (!isAcceptanceStyleReviewEnabled(context)) return assessment;
  const policies = contractFor(context)?.meta.antiAiRulePolicies ?? [];
  const codes = new Set(assessment.styleReview?.issueCodes ?? []);
  const deferred = assessment.blockingIssues.filter(issue => codes.has(issue.code)
    && policies.some(rule => rule.id === issue.styleRuleId && !rule.autoRewrite));
  if (!deferred.length) return assessment;
  const deferredCodes = new Set(deferred.map(issue => issue.code));
  const blockingIssues = assessment.blockingIssues.filter(issue => !deferredCodes.has(issue.code));
  const stillNeedsVoiceRepair = blockingIssues.some(issue => issue.category === "voice");
  const repairDirectives = assessment.repairDirectives.filter(directive => directive.target !== "voice" || stillNeedsVoiceRepair);
  const hasRepairWork = blockingIssues.length > 0 || repairDirectives.length > 0 || (assessment.missingObligations?.length ?? 0) > 0;
  const requiresExplicitRecovery = assessment.status === "needs_manual_review" || assessment.repairability === "plan_misalignment";
  return { ...assessment, blockingIssues, repairDirectives,
    ...(!hasRepairWork && !requiresExplicitRecovery ? { status: "continue_with_risk" as const, continuePolicy: "continue" as const, repairability: "none" as const } : {}),
    riskTags: [...assessment.riskTags, ...deferred.map(issue => `写法提醒：${issue.fixSuggestion}`)],
    styleReview: assessment.styleReview ? { ...assessment.styleReview,
      issueCodes: assessment.styleReview.issueCodes.filter(code => !deferredCodes.has(code)) } : null,
  };
}
