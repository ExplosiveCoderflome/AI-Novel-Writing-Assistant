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

const FIELD_LABELS: Record<RuleSection, Record<string, string>> = { narrativeRules: { summary: "overall sense of progression", progressionMode: "progression method", sceneUnitPattern: "scene unit", multiPov: "multi-perspective", looping: "looping", endingStyle: "ending method", povSwitchStyle: "perspective switching", }, characterRules: { summary: "character expression overview", dialogueStyle: "dialogue style", emotionExpression: "emotional expression", defenseMechanisms: "defense mechanisms", allowSelfReflection: "self-reflection expression", facePriority: "face priority", }, languageRules: { summary: "language quality overview", register: "language tone", roughness: "roughness", sentenceVariation: "sentence variation", allowIncompleteSentences: "incomplete sentences", allowSwearing: "profanity", allowUselessDetails: "everyday noise", }, rhythmRules: { summary: "rhythm control overview", pace: "progression speed", paragraphDensity: "Paragraph Density", allowFragmentedFlow: "Fragmented Flow", actionOverExplanation: "Action Priority", }, }; const FIELD_VALUE_MAPS: Record<string, Record<string, string>> = {
  progressionMode: {
    time_sequence: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
    goal_driven: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
    mystery_escalation: "Suspense increases layer by layer",
    relationship_push_pull: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
    multi_thread: "Multi-line interweaving promotion",
    scene_immersion: "Scene immersion promotion",
    fact_driven: "Fact-driven advancement",
    contrast_driven: "Contrast driven advancement",
  },
  endingStyle: {
    unresolved: "Unresolved core dilemma",
    hook: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
    suspense: "suspense ending",
    emotional_hook: "Emotional hook ending",
    cross_hook: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
    soft_open: "Soft open finish",
    pressure_continue: "Pressure continuation ending",
    bitter_aftertaste: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
  },
  povSwitchStyle: {
    controlled: "controlled switching",
  },
  emotionExpression: {
    behavior_only: "Exposed only through movement",
    dialogue_and_action: "Dialogue and action are exposed together",
    reaction_only: "Mainly exposed through reactions",
    subtext: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
    mixed: "Dialogue, action and reactions are mixed and exposed",
    light_behavior: "Use light actions and light reactions to expose yourself",
    suppressed: "Don't say it directly",
    deadpan: "Cold reaction exposed",
  },
  dialogueStyle: {
    short_colloquial: "Short sentence spoken style",
    direct: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
    restrained: "Restrain it and say it",
    subtext_heavy: "The implication is heavy",
    distinct_by_role: "Significantly widen the differences in mouths by role",
    daily_natural: "Everyday natural tone",
    informational: "Informational restraint dialogue",
    deadpan_colloquial: "cold spoken style",
  },
  register: {
    colloquial: "colloquial",
    direct: "Direct and crisp",
    restrained: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
    natural: "natural everyday",
    flexible: "Flexible to suit the role",
    professional: "Professional restraint",
  },
  sentenceVariation: {
    high: "Big changes",
    medium: "Moderate change",
    medium_high: "Changes are relatively large",
  },
  pace: {
    medium_fast: "medium fast",
    fast: "quick",
    medium: "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.",
    medium_slow: "medium slow",
    balanced: "balanced",
    slow: "slow",
  },
  paragraphDensity: {
    high: "high density",
    medium: "medium density",
    medium_high: "medium to high density",
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
    return value ? "Allows multi-view switching" : "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.";
  }
  if (key === "looping") {
    return value ? "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know." : "Push in a straight line as much as possible";
  }
  if (key === "allowSelfReflection") {
    return value ? "allow for explicit introspection" : "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.";
  }
  if (key === "facePriority") {
    return value ? "Prioritize keeping your dignity" : "Don't insist on respectability";
  }
  if (key === "allowIncompleteSentences") {
    return value ? "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know." : "Sentences should be as complete as possible";
  }
  if (key === "allowSwearing") {
    return value ? "Swear words or dirty words are allowed" : "Try to avoid foul language";
  }
  if (key === "allowUselessDetails") {
    return value ? "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know." : "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.";
  }
  if (key === "allowFragmentedFlow") {
    return value ? "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know." : "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.";
  }
  if (key === "actionOverExplanation") {
    return value ? "Action precedes explanation" : "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know.";
  }
  return value ? "Error 500 (Server Error)!!1500.That’s an error.There was an error. Please try again later.That’s all we know." : "no";
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
