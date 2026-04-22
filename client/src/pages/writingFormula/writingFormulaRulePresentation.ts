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
    summary: "整体推进感",
    progressionMode: "推进方式",
    sceneUnitPattern: "场景单位",
    multiPov: "多视角",
    looping: "循环回钩",
    endingStyle: "收尾方式",
    povSwitchStyle: "视角切换",
  },
  characterRules: {
    summary: "人物表达总述",
    dialogueStyle: "对白风格",
    emotionExpression: "情绪外显",
    defenseMechanisms: "防御机制",
    allowSelfReflection: "自省表达",
    facePriority: "体面优先",
  },
  languageRules: {
    summary: "语言质感总述",
    register: "语言基调",
    roughness: "粗粝度",
    sentenceVariation: "句式变化",
    allowIncompleteSentences: "不完整句",
    allowSwearing: "粗口口语",
    allowUselessDetails: "生活杂音",
  },
  rhythmRules: {
    summary: "节奏控制总述",
    pace: "推进速度",
    paragraphDensity: "段落密度",
    allowFragmentedFlow: "碎片化推进",
    actionOverExplanation: "动作优先",
  },
};

const FIELD_VALUE_MAPS: Record<string, Record<string, string>> = {
  progressionMode: {
    time_sequence: "按时间顺推",
    goal_driven: "目标驱动推进",
    mystery_escalation: "悬疑逐层加压",
    relationship_push_pull: "关系拉扯推进",
    multi_thread: "多线交织推进",
    scene_immersion: "场景沉浸推进",
    fact_driven: "事实驱动推进",
    contrast_driven: "反差驱动推进",
  },
  endingStyle: {
    unresolved: "不收束核心困境",
    hook: "结尾抛钩子",
    suspense: "悬念式收尾",
    emotional_hook: "情绪钩子收尾",
    cross_hook: "交叉线钩子收尾",
    soft_open: "柔开放收尾",
    pressure_continue: "压力延续式收尾",
    bitter_aftertaste: "苦涩余味收尾",
  },
  povSwitchStyle: {
    controlled: "受控切换",
  },
  emotionExpression: {
    behavior_only: "只通过动作外露",
    dialogue_and_action: "对白和动作共同外露",
    reaction_only: "主要通过反应外露",
    subtext: "通过言外之意外露",
    mixed: "对白、动作和反应混合外露",
    light_behavior: "以轻动作轻反应外露",
    suppressed: "压住不直说",
    deadpan: "冷反应式外露",
  },
  dialogueStyle: {
    short_colloquial: "短句口语式",
    direct: "直接硬朗",
    restrained: "克制收着说",
    subtext_heavy: "言外之意重",
    distinct_by_role: "按角色明显拉开口吻差异",
    daily_natural: "日常自然口吻",
    informational: "信息型克制对白",
    deadpan_colloquial: "冷面口语式",
  },
  register: {
    colloquial: "口语化",
    direct: "直接明快",
    restrained: "克制收束",
    natural: "自然日常",
    flexible: "随角色灵活变化",
    professional: "专业克制",
  },
  sentenceVariation: {
    high: "变化大",
    medium: "变化适中",
    medium_high: "变化偏大",
  },
  pace: {
    medium_fast: "中快",
    fast: "快",
    medium: "中速",
    medium_slow: "中慢",
    balanced: "均衡",
    slow: "慢",
  },
  paragraphDensity: {
    high: "高密度",
    medium: "中密度",
    medium_high: "中高密度",
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
    return value ? "允许多视角切换" : "尽量保持单视角";
  }
  if (key === "looping") {
    return value ? "允许循环回钩" : "尽量直线推进";
  }
  if (key === "allowSelfReflection") {
    return value ? "允许明确自省" : "尽量少做直白自省";
  }
  if (key === "facePriority") {
    return value ? "优先保住体面" : "不强求体面";
  }
  if (key === "allowIncompleteSentences") {
    return value ? "允许不完整句" : "句子尽量完整";
  }
  if (key === "allowSwearing") {
    return value ? "允许带一点粗口或脏字" : "尽量避免粗口";
  }
  if (key === "allowUselessDetails") {
    return value ? "允许保留生活杂音" : "尽量减少无关杂音";
  }
  if (key === "allowFragmentedFlow") {
    return value ? "允许碎片化推进" : "尽量保持完整推进";
  }
  if (key === "actionOverExplanation") {
    return value ? "动作先于解释" : "解释比动作更重要";
  }
  return value ? "是" : "否";
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
