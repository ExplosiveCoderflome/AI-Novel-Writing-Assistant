import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { StyleDetectionReport } from "@ai-novel/shared/types/styleEngine";
import { invokeStructuredLlm } from "../../llm/structuredInvoke";
import { StyleRuntimeResolver } from "./StyleRuntimeResolver";
import { styleDetectionPayloadSchema } from "./styleDetectionSchema";

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

    const systemPrompt = `你是小说写法检测器。请根据给定写法规则和反 AI 规则检查文本。
只输出 JSON 对象，字段包括：
riskScore, summary, canAutoRewrite, violations。
violations 每项字段包括：
ruleName, ruleType, severity, excerpt, reason, suggestion, canAutoRewrite。
如果没有违规，violations 返回空数组。`;

    const userPrompt = `当前写法规则：
${resolved.context.compiledBlocks?.style ?? "无"}

角色表达规则：
${resolved.context.compiledBlocks?.character ?? "无"}

反AI规则：
${antiRules.map((rule) => `- [${rule.id}] ${rule.name} (${rule.type}/${rule.severity})：${rule.promptInstruction ?? rule.description}`).join("\n")}

待检测文本：
${input.content}`;

    const parsed = await invokeStructuredLlm({
      label: `style-detection:${input.chapterId ?? input.novelId ?? input.content.slice(0, 8)}`,
      provider: input.provider,
      model: input.model,
      temperature: input.temperature ?? 0.2,
      taskType: "planner",
      systemPrompt,
      userPrompt,
      schema: styleDetectionPayloadSchema,
      maxRepairAttempts: 1,
    });
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
