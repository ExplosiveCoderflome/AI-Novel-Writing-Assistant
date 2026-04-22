import type {
  AntiAiRule,
  CompiledStylePromptBlocks,
  StyleBinding,
  StyleContract,
  StyleContractMaturity,
  StyleContractSection,
  StyleContractSectionKey,
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
  effectiveStyleProfileId?: string | null;
  taskStyleProfileId?: string | null;
  activeSourceTargets?: StyleBinding["targetType"][];
  activeSourceLabels?: string[];
  writerIncludedSections?: StyleContractSectionKey[];
  plannerIncludedSections?: StyleContractSectionKey[];
  droppedSections?: StyleContractSectionKey[];
  usesGlobalAntiAiBaseline?: boolean;
  globalAntiAiRuleIds?: string[];
  styleAntiAiRuleIds?: string[];
}

const TARGET_TYPE_LABELS: Record<StyleBinding["targetType"], string> = {
  novel: "Novel",
  chapter: "Chapter",
  task: "Task",
};

const SECTION_LABELS: Record<StyleContractSectionKey, string> = {
  narrative: "Narrative contract",
  character: "Character contract",
  language: "Language contract",
  rhythm: "Rhythm contract",
  antiAi: "Anti-AI contract",
  selfCheck: "Self-check",
};

function formatRuleValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).join(", ");
  }
  if (typeof value === "boolean") {
    return value ? "yes" : "no";
  }
  return String(value);
}

function resolveDirective(weight: number): string {
  if (weight >= 0.85) {
    return "must keep";
  }
  if (weight >= 0.65) {
    return "keep preferred";
  }
  return "keep when natural";
}

function resolveAntiAiVerb(weight: number, type: AntiAiRule["type"]): string {
  if (type === "encourage") {
    if (weight >= 0.85) {
      return "prefer";
    }
    if (weight >= 0.65) {
      return "encourage";
    }
    return "use when natural";
  }

  if (type === "forbidden") {
    if (weight >= 0.85) {
      return "forbid";
    }
    if (weight >= 0.65) {
      return "avoid strongly";
    }
    return "avoid";
  }

  if (weight >= 0.85) {
    return "watch closely";
  }
  if (weight >= 0.65) {
    return "watch";
  }
  return "note";
}

function renderBindingContext(summaries: BindingSummary[] | undefined): string {
  if (!summaries?.length) {
    return "";
  }

  const lines = summaries.map((binding, index) => {
    const targetLabel = TARGET_TYPE_LABELS[binding.targetType];
    const profileLabel = binding.styleProfileName?.trim() || binding.styleProfileId;
    const suffix = index === summaries.length - 1 ? " <- highest priority" : "";
    return `${index + 1}. ${targetLabel} -> ${profileLabel} (priority=${binding.priority}, weight=${binding.weight.toFixed(2)})${suffix}`;
  });

  return [
    "Style source stack:",
    ...lines,
    "Merge rule: more specific sources override same-name rules from broader sources.",
  ].join("\n");
}

function compactText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
}

function hasStructuredRuleContent(rules: Record<string, unknown>): boolean {
  return Object.entries(rules).some(([key, value]) => {
    if (key === "summary") {
      return false;
    }
    if (value == null || value === "") {
      return false;
    }
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    if (typeof value === "object") {
      return Object.keys(value as Record<string, unknown>).length > 0;
    }
    return true;
  });
}

function renderObjectRules(
  sectionKey: StyleSectionKey,
  sectionLabel: string,
  rules: Record<string, unknown>,
  defaultWeight: number,
  sectionWeightMap?: Record<string, number>,
): string[] {
  const entries = Object.entries(rules).filter(([, value]) => value !== undefined && value !== null && value !== "");
  if (entries.length === 0) {
    return [];
  }

  return entries.map(([key, value], index) => {
    const rawWeight = clamp(sectionWeightMap?.[key] ?? defaultWeight, 0.3, 1);
    const compatibilityField = isStyleCompatibilityField(sectionKey, key);
    const weight = compatibilityField ? clamp(rawWeight - 0.2, 0.3, 1) : rawWeight;
    const prefix = compatibilityField ? "[compat] " : "";
    return `${index + 1}. ${sectionLabel}.${key}: ${prefix}${resolveDirective(weight)} ${formatRuleValue(value)}`;
  });
}

function compileAntiAiRuleLines(
  rules: AntiAiRule[],
  defaultWeight: number,
  ruleWeightMap?: Record<string, number>,
): string[] {
  if (rules.length === 0) {
    return [];
  }

  const grouped: Record<AntiAiRule["type"], string[]> = {
    forbidden: [],
    risk: [],
    encourage: [],
  };

  for (const rule of rules) {
    const weight = clamp(ruleWeightMap?.[rule.id] ?? defaultWeight, 0.3, 1);
    const instruction = rule.promptInstruction?.trim() || rule.description;
    grouped[rule.type].push(`- ${resolveAntiAiVerb(weight, rule.type)}: ${instruction}`);
  }

  return [
    ...(grouped.forbidden.length > 0 ? ["Forbidden:", ...grouped.forbidden] : []),
    ...(grouped.risk.length > 0 ? ["Risk watch:", ...grouped.risk] : []),
    ...(grouped.encourage.length > 0 ? ["Encourage:", ...grouped.encourage] : []),
  ];
}

function buildContractSection(input: {
  key: StyleContractSectionKey;
  summary?: string | null;
  lines: string[];
}): StyleContractSection {
  const title = SECTION_LABELS[input.key];
  const summary = compactText(input.summary);
  const text = [title, ...input.lines].filter(Boolean).join("\n");
  return {
    key: input.key,
    title,
    summary,
    lines: input.lines,
    text,
    hasContent: Boolean(summary || input.lines.length > 0),
  };
}

function resolveContractMaturity(styleProfile: CompileStyleInput["styleProfile"]): StyleContractMaturity {
  return [
    styleProfile.narrativeRules,
    styleProfile.characterRules,
    styleProfile.languageRules,
    styleProfile.rhythmRules,
  ].some((section) => hasStructuredRuleContent(section))
    ? "structured"
    : "summary_only";
}

export class StyleCompiler {
  compile(input: CompileStyleInput): CompiledStylePromptBlocks {
    const weight = clamp(input.weight ?? 1, 0.3, 1);
    const bindingContext = renderBindingContext(input.bindingSummaries);

    const narrative = buildContractSection({
      key: "narrative",
      summary: input.styleProfile.narrativeRules.summary,
      lines: renderObjectRules(
        "narrativeRules",
        "narrative",
        input.styleProfile.narrativeRules,
        weight,
        input.sectionWeights?.narrativeRules,
      ),
    });
    const character = buildContractSection({
      key: "character",
      summary: input.styleProfile.characterRules.summary,
      lines: renderObjectRules(
        "characterRules",
        "character",
        input.styleProfile.characterRules,
        weight,
        input.sectionWeights?.characterRules,
      ),
    });
    const language = buildContractSection({
      key: "language",
      summary: input.styleProfile.languageRules.summary,
      lines: renderObjectRules(
        "languageRules",
        "language",
        input.styleProfile.languageRules,
        weight,
        input.sectionWeights?.languageRules,
      ),
    });
    const rhythm = buildContractSection({
      key: "rhythm",
      summary: input.styleProfile.rhythmRules.summary,
      lines: renderObjectRules(
        "rhythmRules",
        "rhythm",
        input.styleProfile.rhythmRules,
        weight,
        input.sectionWeights?.rhythmRules,
      ),
    });
    const antiAi = buildContractSection({
      key: "antiAi",
      lines: compileAntiAiRuleLines(input.antiAiRules, weight, input.antiAiRuleWeights),
    });
    const selfCheck = buildContractSection({
      key: "selfCheck",
      lines: [
        "- Check whether the draft explains psychology instead of showing it through action or tone.",
        "- Check whether paragraph endings summarize, elevate, or moralize.",
        "- Check whether sentence rhythm becomes too even or template-like.",
        "- If AI flavor remains, revise before returning the final draft.",
      ],
    });

    const contract: StyleContract = {
      narrative,
      character,
      language,
      rhythm,
      antiAi,
      selfCheck,
      meta: {
        effectiveStyleProfileId: input.effectiveStyleProfileId ?? null,
        taskStyleProfileId: input.taskStyleProfileId ?? null,
        activeSourceTargets: input.activeSourceTargets ?? [],
        activeSourceLabels: input.activeSourceLabels ?? [],
        writerIncludedSections: input.writerIncludedSections ?? ["narrative", "character", "language", "rhythm", "antiAi", "selfCheck"],
        plannerIncludedSections: input.plannerIncludedSections ?? ["narrative", "character", "language", "antiAi"],
        droppedSections: input.droppedSections ?? [],
        maturity: resolveContractMaturity(input.styleProfile),
        usesGlobalAntiAiBaseline: input.usesGlobalAntiAiBaseline ?? false,
        globalAntiAiRuleIds: input.globalAntiAiRuleIds ?? [],
        styleAntiAiRuleIds: input.styleAntiAiRuleIds ?? [],
      },
    };

    const style = [
      "Writing style requirements:",
      narrative.text,
      language.text,
      rhythm.text,
    ].filter(Boolean).join("\n\n");

    const output = input.outputInstruction
      ?? [
        "Output requirements:",
        "Return only the final novel prose.",
        "Do not explain the rules, do not output outlines, and do not add meta commentary.",
        weight >= 0.85
          ? "When constraints compete, obey the active style contract and anti-AI rules first."
          : "Apply the style contract naturally without sounding like you are reciting rules.",
      ].join("\n");

    return {
      context: bindingContext,
      style,
      character: character.text,
      antiAi: antiAi.text,
      output,
      selfCheck: selfCheck.text,
      contract,
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
