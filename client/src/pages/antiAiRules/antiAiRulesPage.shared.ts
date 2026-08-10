import type { AntiAiRule } from "@ai-novel/shared/types/styleEngine";

export type RuleFilter = "all" | "global" | "style" | "disabled";

export interface RuleFormState {
  key: string;
  name: string;
  type: AntiAiRule["type"];
  severity: AntiAiRule["severity"];
  description: string;
  detectPatternsText: string;
  promptInstruction: string;
  rewriteSuggestion: string;
  enabled: boolean;
  globalBaselineEnabled: boolean;
  autoRewrite: boolean;
}

export const emptyForm: RuleFormState = {
  key: "",
  name: "",
  type: "risk",
  severity: "medium",
  description: "",
  detectPatternsText: "",
  promptInstruction: "",
  rewriteSuggestion: "",
  enabled: true,
  globalBaselineEnabled: false,
  autoRewrite: false,
};

export const typeLabels: Record<AntiAiRule["type"], string> = {
  forbidden: "禁用",
  risk: "风险",
  encourage: "鼓励",
};

export const severityLabels: Record<AntiAiRule["severity"], string> = {
  low: "低",
  medium: "中",
  high: "高",
};

export function ruleToForm(rule: AntiAiRule): RuleFormState {
  return {
    key: rule.key,
    name: rule.name,
    type: rule.type,
    severity: rule.severity,
    description: rule.description,
    detectPatternsText: rule.detectPatterns.join("\n"),
    promptInstruction: rule.promptInstruction ?? "",
    rewriteSuggestion: rule.rewriteSuggestion ?? "",
    enabled: rule.enabled,
    globalBaselineEnabled: rule.globalBaselineEnabled,
    autoRewrite: rule.autoRewrite,
  };
}

export function parsePatternText(value: string): string[] {
  return value
    .split(/[\n,，;；]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function buildPayload(form: RuleFormState) {
  return {
    key: form.key.trim(),
    name: form.name.trim(),
    type: form.type,
    severity: form.severity,
    description: form.description.trim(),
    detectPatterns: parsePatternText(form.detectPatternsText),
    promptInstruction: form.promptInstruction.trim() || undefined,
    rewriteSuggestion: form.rewriteSuggestion.trim() || undefined,
    enabled: form.enabled,
    globalBaselineEnabled: form.globalBaselineEnabled,
    autoRewrite: form.autoRewrite,
  };
}

export function buildEffectiveParamsKey(styleProfileId: string) {
  return new URLSearchParams(styleProfileId ? { styleProfileId } : {}).toString() || "global";
}
