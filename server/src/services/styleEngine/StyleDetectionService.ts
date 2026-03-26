import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { StyleDetectionReport } from "@ai-novel/shared/types/styleEngine";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import { styleDetectionPrompt } from "../../prompting/prompts/style/style.prompts";
import { StyleRuntimeResolver } from "./StyleRuntimeResolver";

interface DetectionInput {
  content: string;
  styleProfileId?: string;
  novelId?: string;
  chapterId?: string;
  taskStyleProfileId?: string;
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
    const antiRules = resolved.antiAiRules;
    const appliedRuleIds = antiRules.map((rule) => rule.id);
    if (antiRules.length === 0) {
      return {
        riskScore: 0,
        summary: "当前没有绑定反 AI 规则，未执行写法违规检测。",
        violations: [],
        canAutoRewrite: false,
        appliedRuleIds,
      };
    }

    const result = await runStructuredPrompt({
      asset: styleDetectionPrompt,
      promptInput: {
        styleRulesBlock: resolved.context.compiledBlocks?.style ?? "无",
        characterRulesBlock: resolved.context.compiledBlocks?.character ?? "无",
        antiRulesText: antiRules.map((rule) => `- [${rule.id}] ${rule.name} (${rule.type}/${rule.severity})：${rule.promptInstruction ?? rule.description}`).join("\n"),
        content: input.content,
      },
      options: {
        provider: input.provider,
        model: input.model,
        temperature: input.temperature ?? 0.2,
      },
    });
    const parsed = result.output;
    return {
      riskScore: Math.max(0, Math.min(100, Math.round(parsed.riskScore ?? 0))),
      summary: parsed.summary ?? "",
      violations: (parsed.violations ?? []).map((item) => {
        const matchedRule = antiRules.find((rule) => rule.id === item.ruleId || rule.name === item.ruleName);
        return {
          ruleId: matchedRule?.id ?? item.ruleId ?? item.ruleName,
          ruleName: matchedRule?.name ?? item.ruleName,
          ruleType: matchedRule?.type ?? item.ruleType,
          severity: matchedRule?.severity ?? item.severity,
          excerpt: item.excerpt,
          reason: item.reason,
          suggestion: item.suggestion,
          canAutoRewrite: matchedRule?.autoRewrite ?? item.canAutoRewrite,
        };
      }),
      canAutoRewrite: Boolean(parsed.canAutoRewrite ?? (parsed.violations ?? []).some((item) => item.canAutoRewrite)),
      appliedRuleIds,
    };
  }
}
