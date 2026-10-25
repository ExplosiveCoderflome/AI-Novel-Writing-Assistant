import type { AntiAiRule } from "@ai-novel/shared/types/styleEngine";
import type { CreativeProfileReadResult } from "./creativeProfileCodec";

// Stable identities of shipped defaults, not a detector of literary prose.
const NARRATION_DEFAULTS = new Set(["forbid-explicit-psychology", "forbid-ending-elevation", "forbid-theme-summary"]);
export function usesNonWebCreativePolicy(read: CreativeProfileReadResult): boolean {
  return read.status === "invalid" || (read.status === "valid" && read.profile.orientation !== "web_serial");
}
/** Only global shipped defaults are relaxed; an explicitly bound style rule remains authoritative. */
export function applyCreativeBaselinePolicy(rules: AntiAiRule[], read: CreativeProfileReadResult): AntiAiRule[] {
  if (!usesNonWebCreativePolicy(read)) return rules;
  return rules.map((rule) => NARRATION_DEFAULTS.has(rule.key) ? {
    ...rule, type: "risk" as const, severity: "low" as const, autoRewrite: false,
    promptInstruction: "检查心理、议论与收尾的叙事功能；本书允许的表达方式不是禁区，不因固定词句命中而自动改写。",
  } : rule);
}
