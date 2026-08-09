import i18next from "i18next";
import type {
  CharacterRules,
  LanguageRules,
  NarrativeRules,
  RhythmRules,
} from "@ai-novel/shared/types/styleEngine";

export type RuleSection = "narrativeRules" | "characterRules" | "languageRules" | "rhythmRules";
type RuleObject = NarrativeRules | CharacterRules | LanguageRules | RhythmRules;

export interface RuleEntry {
  key: string;
  label: string;
  value: string;
}

const FIELD_ORDER: Record<RuleSection, string[]> = {
  narrativeRules: [
    "summary",
    "progressionMode",
    "sceneUnitPattern",
    "multiPov",
    "looping",
    "endingStyle",
    "povSwitchStyle",
  ],
  characterRules: [
    "summary",
    "dialogueStyle",
    "emotionExpression",
    "defenseMechanisms",
    "allowSelfReflection",
    "facePriority",
  ],
  languageRules: [
    "summary",
    "register",
    "roughness",
    "sentenceVariation",
    "allowIncompleteSentences",
    "allowSwearing",
    "allowUselessDetails",
  ],
  rhythmRules: [
    "summary",
    "pace",
    "paragraphDensity",
    "allowFragmentedFlow",
    "actionOverExplanation",
  ],
};

const FIELD_LABELS: Record<RuleSection, Record<string, string>> = {
  narrativeRules: {
    summary: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_a6038390"),
    progressionMode: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_8cc5c30b"),
    sceneUnitPattern: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_83852e0c"),
    multiPov: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_2b549e51"),
    looping: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_6ec71ea3"),
    endingStyle: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_fdf19b38"),
    povSwitchStyle: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_99a2c1fa"),
  },
  characterRules: {
    summary: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.characterExpressionOverview"),
    dialogueStyle: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_7a6aa444"),
    emotionExpression: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_f3ddc827"),
    defenseMechanisms: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_f05fdc83"),
    allowSelfReflection: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_d0cd1588"),
    facePriority: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.respectabilityPriority"),
  },
  languageRules: {
    summary: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_d45babd2"),
    register: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_56b7ce61"),
    roughness: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_855bd8b6"),
    sentenceVariation: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_160024cc"),
    allowIncompleteSentences: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.incompleteSentence"),
    allowSwearing: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_a2f388b0"),
    allowUselessDetails: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_eca7fdbd"),
  },
  rhythmRules: {
    summary: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_99149cad"),
    pace: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_7efc0b30"),
    paragraphDensity: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_7d907d5b"),
    allowFragmentedFlow: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_240ddda2"),
    actionOverExplanation: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_d568372b"),
  },
};

const FIELD_VALUE_MAPS: Record<string, Record<string, string>> = {
  progressionMode: {
    time_sequence: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_2ea326b2"),
    goal_driven: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_e39b54d9"),
    mystery_escalation: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_6e1adf8f"),
    relationship_push_pull: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_4b591878"),
    multi_thread: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_bd5c5c49"),
    scene_immersion: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_ad222c66"),
    fact_driven: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.factDrivenProgression"),
    contrast_driven: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_b7cf6429"),
  },
  endingStyle: {
    unresolved: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.notBoundCoreIssue"),
    hook: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_ec11644c"),
    suspense: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_2ef7e8d7"),
    emotional_hook: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_ad7a207b"),
    cross_hook: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.crossLineHookFinale"),
    soft_open: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_76bb21eb"),
    pressure_continue: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_604e53ce"),
    bitter_aftertaste: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_52ab5978"),
  },
  povSwitchStyle: {
    controlled: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_7a2ca4f1"),
  },
  emotionExpression: {
    behavior_only: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_1337da15"),
    dialogue_and_action: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_fd7fda76"),
    reaction_only: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.mainExposeReaction"),
    subtext: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_d60eb314"),
    mixed: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_5e2c41fc"),
    light_behavior: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.lightActionLightReactionExposure"),
    suppressed: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_43dc0241"),
    deadpan: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_fe6fd891"),
  },
  dialogueStyle: {
    short_colloquial: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_4eebc7a2"),
    direct: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_550b5da2"),
    restrained: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_2a7085c7"),
    subtext_heavy: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_adb7f8ea"),
    distinct_by_role: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_9792a58e"),
    daily_natural: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_f024386b"),
    informational: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_352fdcd4"),
    deadpan_colloquial: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_65c5038c"),
  },
  register: {
    colloquial: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_506aec91"),
    direct: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_f7fbbcb1"),
    restrained: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_71961ca1"),
    natural: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_4173796b"),
    flexible: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_266cc8e3"),
    professional: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.professionalDiscipline"),
  },
  sentenceVariation: {
    high: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_7c46514f"),
    medium: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_42d924bd"),
    medium_high: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_928111c1"),
  },
  pace: {
    medium_fast: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.mediumFast"),
    fast: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_8fcedbfd"),
    medium: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.midSpeed"),
    medium_slow: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.mediumSlow"),
    balanced: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_f07d8f75"),
    slow: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_e0b665f2"),
  },
  paragraphDensity: {
    high: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_f7dcc0ac"),
    medium: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.mediumDensity"),
    medium_high: i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.highDensityMid"),
  },
};

function compactText(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/\s+/g, " ").trim();
}

function humanizeUnknownToken(value: string): string {
  return value.replace(/_/g, " ").trim();
}

function formatBooleanValue(key: string, value: boolean): string {
  if (key === "multiPov") {
    return value ? i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_c5fdfd46") : i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_54942727");
  }
  if (key === "looping") {
    return value ? i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_8d11cd0f") : i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_6a5b8a9b");
  }
  if (key === "allowSelfReflection") {
    return value ? i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_6703b195") : i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_ad410529");
  }
  if (key === "facePriority") {
    return value ? i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.prioritizeRespectability") : i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.notCompulsory");
  }
  if (key === "allowIncompleteSentences") {
    return value ? i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_d8381bfb") : i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_9778b01c");
  }
  if (key === "allowSwearing") {
    return value ? i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_c738b034") : i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_036a10cf");
  }
  if (key === "allowUselessDetails") {
    return value ? i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_8e056673") : i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_5ee150e8");
  }
  if (key === "allowFragmentedFlow") {
    return value ? i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_e5b85f5c") : i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_6834c05e");
  }
  if (key === "actionOverExplanation") {
    return value ? i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_0ae9a17b") : i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_b5fc857a");
  }
  return value ? i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_0a60ac8f") : i18next.t("gen.pages.writingFormula.writingFormulaRulePresentation.gen_c9744f45");
}

function formatArrayValue(value: unknown[]): string {
  return value
    .map((item) => {
      if (typeof item === "string") {
        return humanizeUnknownToken(item);
      }
      return String(item);
    })
    .filter(Boolean)
    .join(" / ");
}

export function formatRuleFieldLabel(section: RuleSection, key: string): string {
  return FIELD_LABELS[section][key] ?? humanizeUnknownToken(key);
}

export function formatRuleFieldValue(section: RuleSection, key: string, value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "boolean") {
    return formatBooleanValue(key, value);
  }

  if (typeof value === "number") {
    if (key === "roughness") {
      return `${Math.round(value * 100)} / 100`;
    }
    return String(value);
  }

  if (Array.isArray(value)) {
    return formatArrayValue(value);
  }

  if (typeof value === "string") {
    const normalized = compactText(value);
    if (!normalized) {
      return "";
    }
    return FIELD_VALUE_MAPS[key]?.[normalized] ?? normalized;
  }

  return "";
}

export function buildReadableRuleEntries(section: RuleSection, rules: RuleObject | Record<string, unknown>): RuleEntry[] {
  const record = rules as Record<string, unknown>;
  const keySet = new Set<string>([
    ...FIELD_ORDER[section],
    ...Object.keys(record),
  ]);

  return Array.from(keySet)
    .map((key) => ({
      key,
      label: formatRuleFieldLabel(section, key),
      value: formatRuleFieldValue(section, key, record[key]),
    }))
    .filter((entry) => Boolean(entry.value))
    .sort((left, right) => {
      const leftIndex = FIELD_ORDER[section].indexOf(left.key);
      const rightIndex = FIELD_ORDER[section].indexOf(right.key);
      const normalizedLeft = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
      const normalizedRight = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;
      return normalizedLeft - normalizedRight;
    });
}

export function buildReadableRuleSummary(
  section: RuleSection,
  rules: RuleObject | Record<string, unknown>,
  fallback: string,
): string {
  const entries = buildReadableRuleEntries(section, rules);
  if (entries.length === 0) {
    return fallback;
  }

  return entries
    .slice(0, 3)
    .map((entry) => (entry.key === "summary" ? entry.value : `${entry.label}：${entry.value}`))
    .join("；");
}
