import type {
  AntiAiRule,
  CompiledStylePromptBlocks,
  StyleProfile,
  StyleRuleSet,
} from "@ai-novel/shared/types/styleEngine";
import { clamp } from "./helpers";

interface CompileStyleInput {
  styleProfile: Pick<StyleProfile, "narrativeRules" | "characterRules" | "languageRules" | "rhythmRules">;
  antiAiRules: AntiAiRule[];
  weight?: number;
  appliedRuleIds?: string[];
  outputInstruction?: string;
}

function renderObjectRules(
  title: string,
  rules: Record<string, unknown>,
  weight: number,
  prefixMap: Partial<Record<string, string>>,
): string {
  const entries = Object.entries(rules).filter(([, value]) => value !== undefined && value !== null && value !== "");
  if (entries.length === 0) {
    return "";
  }

  const hard = weight >= 0.8;
  const lines = entries.map(([key, value], index) => {
    const prefix = prefixMap[key] ?? (hard ? "必须" : "优先");
    const normalizedValue = Array.isArray(value) ? value.join("、") : String(value);
    return `${index + 1}. ${prefix}${title ? `${title}：` : ""}${key} = ${normalizedValue}`;
  });
  return lines.join("\n");
}

function compileAntiAiRules(rules: AntiAiRule[], weight: number): string {
  if (rules.length === 0) {
    return "";
  }
  const hardVerb = weight >= 0.8 ? "禁止" : "尽量不要";
  const encourageVerb = weight >= 0.8 ? "优先" : "可以适当";

  const forbidden = rules.filter((rule) => rule.type === "forbidden");
  const risk = rules.filter((rule) => rule.type === "risk");
  const encourage = rules.filter((rule) => rule.type === "encourage");
  const parts: string[] = [];

  if (forbidden.length > 0) {
    parts.push([
      "禁止项：",
      ...forbidden.map((rule) => `- ${hardVerb}${rule.promptInstruction ?? rule.description}`),
    ].join("\n"));
  }
  if (risk.length > 0) {
    parts.push([
      "风险提醒：",
      ...risk.map((rule) => `- 注意避免${rule.promptInstruction ?? rule.description}`),
    ].join("\n"));
  }
  if (encourage.length > 0) {
    parts.push([
      "鼓励项：",
      ...encourage.map((rule) => `- ${encourageVerb}${rule.promptInstruction ?? rule.description}`),
    ].join("\n"));
  }

  return parts.join("\n\n");
}

export class StyleCompiler {
  compile(input: CompileStyleInput): CompiledStylePromptBlocks {
    const weight = clamp(input.weight ?? 1, 0.3, 1);
    const style = [
      "写法要求：",
      renderObjectRules("叙事", input.styleProfile.narrativeRules, weight, {
        summary: weight >= 0.8 ? "必须" : "优先",
      }),
      renderObjectRules("语言", input.styleProfile.languageRules, weight, {
        summary: weight >= 0.8 ? "必须" : "倾向",
      }),
      renderObjectRules("节奏", input.styleProfile.rhythmRules, weight, {
        summary: weight >= 0.8 ? "必须" : "优先",
      }),
    ].filter(Boolean).join("\n");

    const character = [
      "角色表达要求：",
      renderObjectRules("", input.styleProfile.characterRules, weight, {
        summary: weight >= 0.8 ? "必须" : "优先",
      }),
    ].filter(Boolean).join("\n");

    const antiAi = compileAntiAiRules(input.antiAiRules, weight);
    const output = input.outputInstruction
      ?? "输出要求：直接输出小说正文，不解释写法，不分条。";
    const selfCheck = [
      "写完后自行检查：",
      "- 是否出现直接心理解释",
      "- 是否有总结主题或段尾升华",
      "- 是否存在过于工整、机械的段落",
      "若存在，先修正再输出最终结果。",
    ].join("\n");

    return {
      context: "",
      style,
      character,
      antiAi,
      output,
      selfCheck,
      mergedRules: {
        narrativeRules: input.styleProfile.narrativeRules,
        characterRules: input.styleProfile.characterRules,
        languageRules: input.styleProfile.languageRules,
        rhythmRules: input.styleProfile.rhythmRules,
      } satisfies StyleRuleSet,
      appliedRuleIds: input.appliedRuleIds ?? input.antiAiRules.map((rule) => rule.id),
    };
  }
}
