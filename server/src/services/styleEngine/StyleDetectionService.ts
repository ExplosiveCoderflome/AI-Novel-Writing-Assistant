import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { StyleDetectionReport } from "@ai-novel/shared/types/styleEngine";
import { isStyleIssueRewritable, createStyleSignalPolicy } from "@ai-novel/shared/types/styleEngine";
import { scanStyleSignals } from "./signals";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import { styleDetectionPrompt } from "../../prompting/prompts/style/style.prompts";
import {
  buildFullStyleContractText,
  buildStyleContractMetaText,
  inferStyleIssueCategory,
  inferStyleViolationSource,
} from "./styleContractText";
import { StyleRuntimeResolver } from "./StyleRuntimeResolver";
import {
  buildAntiAiRuleCatalogText,
  buildAntiAiRuleDirectiveText,
  listPreviewAntiAiRules,
  mergeAntiAiRules,
} from "./antiAiPreviewRules";

interface DetectionInput {
  content: string;
  styleProfileId?: string;
  novelId?: string;
  chapterId?: string;
  taskStyleProfileId?: string;
  previewAntiAiRuleIds?: string[];
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
}

export class StyleDetectionService {
  private readonly resolver = new StyleRuntimeResolver();

  async check(input: DetectionInput): Promise<StyleDetectionReport> {
    const resolved = await this.resolver.resolve({
      styleProfileId: input.styleProfileId,
      novelId: input.novelId,
      chapterId: input.chapterId,
      taskStyleProfileId: input.taskStyleProfileId,
    });
    const previewRules = await listPreviewAntiAiRules(input.previewAntiAiRuleIds);
    const existingRuleIds = new Set(resolved.antiAiRules.map((rule) => rule.id));
    const extraPreviewRules = previewRules.filter((rule) => !existingRuleIds.has(rule.id));
    const antiRules = mergeAntiAiRules(resolved.antiAiRules, previewRules);
    const appliedRuleIds = antiRules.map((rule) => rule.id);
    const contract = resolved.context.compiledBlocks?.contract ?? null;
    const styleContractText = [
      buildFullStyleContractText(contract),
      buildAntiAiRuleDirectiveText(extraPreviewRules),
    ].filter(Boolean).join("\n\n");
    const styleContractMetaText = buildStyleContractMetaText(contract);
    const antiRuleCatalogText = buildAntiAiRuleCatalogText(antiRules);

    if (!styleContractText && antiRules.length === 0) {
      return {
        riskScore: 0,
        summary: "当前没有可执行的写法检测约束，未执行写法违规检测。",
        violations: [],
        canAutoRewrite: false,
        appliedRuleIds,
      };
    }

    const signalScan = scanStyleSignals(input.content, createStyleSignalPolicy());
    const result = await runStructuredPrompt({
      asset: styleDetectionPrompt,
      promptInput: {
        styleContractText: styleContractText || "none",
        styleContractMetaText: styleContractMetaText || "none",
        antiRuleCatalogText: antiRuleCatalogText || "none",
        content: input.content,
        allowedRuleIds: appliedRuleIds,
        styleSignals: signalScan,
      },
      options: {
        provider: input.provider,
        model: input.model,
        temperature: input.temperature ?? 0.2,
      },
    });
    const parsed = result.output;
    const violations = (parsed.violations ?? []).map((item) => {
      const matchedRule = antiRules.find((rule) => rule.id === item.ruleId || rule.name === item.ruleName);
      const ruleId = matchedRule?.id ?? item.ruleId ?? item.ruleName;
      const ruleType = matchedRule?.type ?? item.ruleType;
      const source = inferStyleViolationSource(ruleId, contract);
      return {
        ruleId, ruleName: matchedRule?.name ?? item.ruleName, ruleType,
        severity: matchedRule?.severity ?? item.severity, source, layer: item.layer,
        issueCategory: inferStyleIssueCategory({ issueCategory: item.issueCategory, source, ruleType }),
        excerpt: item.excerpt, reason: item.reason, suggestion: item.suggestion,
        canAutoRewrite: isStyleIssueRewritable(item, matchedRule?.autoRewrite ?? true),
      };
    });
    return {
      riskScore: Math.max(0, Math.min(100, Math.round(parsed.riskScore ?? 0))),
      summary: parsed.summary ?? "",
      violations,
      canAutoRewrite: violations.some(item => item.canAutoRewrite),
      appliedRuleIds,
      signalScan,
    };
  }
}
