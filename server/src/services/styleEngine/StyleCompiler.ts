import type {
  AntiAiRule,
  CompiledStylePromptBlocks,
  StyleBinding,
  StyleProfile,
  StyleRuleSet,
} from "@ai-novel/shared/types/styleEngine";
import { isStyleCompatibilityField } from "@ai-novel/shared/types/styleEngine";
import { clamp } from "./helpers";

type StyleSectionKey = keyof StyleRuleSet;

interface BindingSummary {
  styleProfileId: string;
  styleProfileName?: string | null;
  targetType: StyleBinding["targetType"];
  priority: number;
  weight: number;
}

interface CompileStyleInput {
  styleProfile: Pick<StyleProfile, "narrativeRules" | "characterRules" | "languageRules" | "rhythmRules">;
  antiAiRules: AntiAiRule[];
  weight?: number;
  appliedRuleIds?: string[];
  outputInstruction?: string;
  bindingSummaries?: BindingSummary[];
  sectionWeights?: Partial<Record<StyleSectionKey, Record<string, number>>>;
  antiAiRuleWeights?: Record<string, number>;
}

const TARGET_TYPE_LABELS: Record<StyleBinding["targetType"], string> = {
  novel: "整本书",
  chapter: "章节",
  task: "本次生成",
};

function formatRuleValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).join("、");
  }
  if (typeof value === "boolean") {
    return value ? "是" : "否";
  }
  return String(value);
}

function resolveDirective(weight: number): string {
  if (weight >= 0.85) {
    return "必须保持";
  }
  if (weight >= 0.65) {
    return "优先保持";
  }
  return "可适度保留";
}

function resolveAntiAiVerb(weight: number, type: AntiAiRule["type"]): string {
  if (type === "encourage") {
    if (weight >= 0.85) {
      return "优先体现";
    }
    if (weight >= 0.65) {
      return "可以适当体现";
    }
    return "仅在自然时体现";
  }

  if (type === "forbidden") {
    if (weight >= 0.85) {
      return "禁止";
    }
    if (weight >= 0.65) {
      return "尽量避免";
    }
    return "谨慎避免";
  }

  if (weight >= 0.85) {
    return "重点规避";
  }
  if (weight >= 0.65) {
    return "注意规避";
  }
  return "留意控制";
}

function renderBindingContext(summaries: BindingSummary[] | undefined): string {
  if (!summaries?.length) {
    return "";
  }

  const lines = summaries.map((binding, index) => {
    const targetLabel = TARGET_TYPE_LABELS[binding.targetType];
    const profileLabel = binding.styleProfileName?.trim() || binding.styleProfileId;
    const suffix = index === summaries.length - 1 ? "，当前优先级最高" : "";
    return `${index + 1}. ${targetLabel} -> ${profileLabel} (priority ${binding.priority}, weight ${binding.weight.toFixed(2)})${suffix}`;
  });

  return [
    "写法生效层级：",
    ...lines,
    "合并原则：后层级覆盖前层级的同名规则，未被覆盖的规则继续保留。",
  ].join("\n");
}

function renderObjectRules(
  sectionKey: StyleSectionKey,
  sectionLabel: string,
  rules: Record<string, unknown>,
  defaultWeight: number,
  sectionWeightMap?: Record<string, number>,
): string {
  const entries = Object.entries(rules).filter(([, value]) => value !== undefined && value !== null && value !== "");
  if (entries.length === 0) {
    return "";
  }

  return entries
    .map(([key, value], index) => {
      const rawWeight = clamp(sectionWeightMap?.[key] ?? defaultWeight, 0.3, 1);
      const compatibilityField = isStyleCompatibilityField(sectionKey, key);
      const weight = compatibilityField ? clamp(rawWeight - 0.2, 0.3, 1) : rawWeight;
      const prefix = compatibilityField ? "[兼容字段] " : "";
      return `${index + 1}. ${sectionLabel}.${key}：${prefix}${resolveDirective(weight)} ${formatRuleValue(value)}`;
    })
    .join("\n");
}

function compileAntiAiRules(
  rules: AntiAiRule[],
  defaultWeight: number,
  ruleWeightMap?: Record<string, number>,
): string {
  if (rules.length === 0) {
    return "";
  }

  const grouped: Record<AntiAiRule["type"], string[]> = {
    forbidden: [],
    risk: [],
    encourage: [],
  };

  for (const rule of rules) {
    const weight = clamp(ruleWeightMap?.[rule.id] ?? defaultWeight, 0.3, 1);
    const instruction = rule.promptInstruction?.trim() || rule.description;
    grouped[rule.type].push(`- ${resolveAntiAiVerb(weight, rule.type)}：${instruction}`);
  }

  const parts = [
    grouped.forbidden.length > 0 ? ["禁止项：", ...grouped.forbidden].join("\n") : "",
    grouped.risk.length > 0 ? ["风险提醒：", ...grouped.risk].join("\n") : "",
    grouped.encourage.length > 0 ? ["鼓励项：", ...grouped.encourage].join("\n") : "",
  ].filter(Boolean);

  return parts.join("\n\n");
}

export class StyleCompiler {
  compile(input: CompileStyleInput): CompiledStylePromptBlocks {
    const weight = clamp(input.weight ?? 1, 0.3, 1);
    const bindingContext = renderBindingContext(input.bindingSummaries);
    const style = [
      "写作执行要求：",
      renderObjectRules("narrativeRules", "叙事", input.styleProfile.narrativeRules, weight, input.sectionWeights?.narrativeRules),
      renderObjectRules("languageRules", "语言", input.styleProfile.languageRules, weight, input.sectionWeights?.languageRules),
      renderObjectRules("rhythmRules", "节奏", input.styleProfile.rhythmRules, weight, input.sectionWeights?.rhythmRules),
    ].filter(Boolean).join("\n");

    const character = [
      "角色表达要求：",
      renderObjectRules("characterRules", "角色", input.styleProfile.characterRules, weight, input.sectionWeights?.characterRules),
    ].filter(Boolean).join("\n");

    const antiAi = compileAntiAiRules(input.antiAiRules, weight, input.antiAiRuleWeights);
    const output = input.outputInstruction
      ?? [
        "输出要求：",
        "直接输出小说正文，不解释写法，不列提纲，不补充创作说明。",
        weight >= 0.85 ? "如遇冲突，优先服从当前写法层级与反 AI 约束。" : "尽量让写法要求自然落地，不要显得像在背规则。",
      ].join("\n");
    const selfCheck = [
      "写完后自检：",
      "- 是否出现直接解释人物心理或主题总结。",
      "- 是否出现段尾拔高、机械整齐、模板化转折。",
      "- 是否已经按更高层级的写法覆盖低层级同名规则。",
      "- 若仍有 AI 味，先自修再输出最终版本。",
    ].join("\n");

    return {
      context: bindingContext,
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
