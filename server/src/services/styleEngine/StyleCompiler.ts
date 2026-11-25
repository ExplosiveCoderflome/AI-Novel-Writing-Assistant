import type {
  AntiAiRule,
  CompiledStylePromptBlocks,
  StyleBinding,
  StyleContrastPair,
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
  novel: "本书写法",
  chapter: "本章写法",
  task: "本次任务写法",
};

const SECTION_LABELS: Record<StyleContractSectionKey, string> = {
  narrative: "叙事推进",
  character: "人物表达",
  language: "语言质感",
  rhythm: "节奏控制",
  antiAi: "反 AI 表达约束",
  selfCheck: "输出前自检",
};

const FIELD_LABELS: Record<StyleSectionKey, Record<string, string>> = {
  narrativeRules: {
    summary: "整体推进",
    progressionMode: "推进方式",
    sceneUnitPattern: "场景节奏单元",
    multiPov: "多视角切换",
    looping: "循环回钩",
    endingStyle: "收尾方式",
    povSwitchStyle: "视角切换规则",
  },
  characterRules: {
    summary: "人物表达总述",
    allowSelfReflection: "人物内心自省",
    emotionExpression: "情绪外显方式",
    defenseMechanisms: "防御与回避机制",
    facePriority: "体面与嘴硬优先",
    dialogueStyle: "对白风格",
  },
  languageRules: {
    summary: "语言质感总述",
    register: "语域基调",
    roughness: "口语粗粝度",
    allowIncompleteSentences: "允许不完整短句",
    allowSwearing: "允许粗口口语",
    sentenceVariation: "句式长短起伏",
    allowUselessDetails: "允许生活化细节杂音",
  },
  rhythmRules: {
    summary: "节奏控制总述",
    pace: "推进速度",
    paragraphDensity: "段落信息密度",
    allowFragmentedFlow: "允许碎片化推进",
    actionOverExplanation: "动作优先于解释",
  },
};

const FIELD_VALUE_LABELS: Record<string, Record<string, string>> = {
  progressionMode: {
    time_sequence: "按时间顺推",
    goal_driven: "目标驱动推进",
    mystery_escalation: "悬疑逐层加压",
    relationship_push_pull: "关系错位拉扯推进",
    multi_thread: "多线交织推进",
    scene_immersion: "场景沉浸推进",
    fact_driven: "事实与专业程序推进",
    contrast_driven: "反差与冷感观察推进",
  },
  endingStyle: {
    unresolved: "保留核心困境不强行收束",
    hook: "章末留具体钩子",
    suspense: "悬念收尾",
    emotional_hook: "情绪余波钩子",
    cross_hook: "交叉线悬念钩子",
    soft_open: "轻开放生活化收尾",
    pressure_continue: "压力延续收尾",
    bitter_aftertaste: "带苦涩余味收尾",
  },
  povSwitchStyle: {
    controlled: "仅在明确场景边界受控切换",
  },
  emotionExpression: {
    behavior_only: "只通过动作与行为外露",
    dialogue_and_action: "通过对话交锋和动作外露",
    reaction_only: "主要通过克制反应外露",
    subtext: "通过停顿、回避和言外之意外露",
    mixed: "通过动作、对白和反应混合外露",
    light_behavior: "以轻动作和日常反应自然带出",
    suppressed: "压住情绪，靠专业行动与选择体现",
    deadpan: "冷反应与反差外露",
  },
  dialogueStyle: {
    short_colloquial: "短句口语化，少书面完整长句",
    direct: "直接硬朗、少绕弯",
    restrained: "克制收着说，留余地",
    subtext_heavy: "言外之意重，话留半句",
    distinct_by_role: "严格拉开不同角色口吻差异",
    daily_natural: "日常自然口吻，带生活停顿",
    informational: "事实导向、克制少废话",
    deadpan_colloquial: "冷面口语化，少情绪煽动",
  },
  register: {
    colloquial: "偏口语化、有市井烟火气",
    direct: "直白明快、不绕弯",
    restrained: "克制冷静、少虚词修饰",
    natural: "自然日常、不做作",
    flexible: "随不同角色身份与场合灵活切换",
    professional: "专业写实、克制少廉价金句",
  },
  sentenceVariation: {
    high: "长短句交替幅度大，刻意打破均等句长",
    medium_high: "句式起伏明显，长描写与短断句交替",
    medium: "保持自然句长变化",
  },
  pace: {
    fast: "紧凑快节奏",
    medium_fast: "中快节奏",
    medium: "中等节奏",
    balanced: "张弛有度",
    medium_slow: "中慢节奏，给反应留白",
    slow: "舒缓沉浸节奏",
  },
  paragraphDensity: {
    high: "高密度实写",
    medium_high: "中高密度，少空转",
    medium: "中等段落密度",
  },
};

const SPECIAL_LANGUAGE_KEYS = new Set(["voiceExemplars", "contrastPairs"]);

function formatRuleValue(key: string, value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).join("、");
  }
  if (typeof value === "boolean") {
    return value ? "允许/开启" : "禁止/关闭";
  }
  if (typeof value === "number" && key === "roughness") {
    return `${Math.round(value * 100)}%（越高越口语粗粝）`;
  }
  if (typeof value === "string") {
    return FIELD_VALUE_LABELS[key]?.[value] ?? value;
  }
  return String(value);
}

function resolveDirective(weight: number): string {
  if (weight >= 0.85) {
    return "严格保持";
  }
  if (weight >= 0.65) {
    return "优先保持";
  }
  return "自然保持";
}

function resolveAntiAiVerb(weight: number, type: AntiAiRule["type"]): string {
  if (type === "encourage") {
    if (weight >= 0.85) {
      return "优先采用";
    }
    if (weight >= 0.65) {
      return "鼓励使用";
    }
    return "自然可用";
  }

  if (type === "forbidden") {
    if (weight >= 0.85) {
      return "严禁";
    }
    if (weight >= 0.65) {
      return "尽量避免";
    }
    return "注意规避";
  }

  if (weight >= 0.85) {
    return "重点排查";
  }
  if (weight >= 0.65) {
    return "留意规避";
  }
  return "关注";
}

function renderBindingContext(summaries: BindingSummary[] | undefined): string {
  if (!summaries?.length) {
    return "";
  }

  const lines = summaries.map((binding, index) => {
    const targetLabel = TARGET_TYPE_LABELS[binding.targetType];
    const profileLabel = binding.styleProfileName?.trim() || binding.styleProfileId;
    const suffix = index === summaries.length - 1 ? " <- 当前最高优先级" : "";
    return `${index + 1}. ${targetLabel}：${profileLabel}（强度 ${Math.round(binding.weight * 100)}%）${suffix}`;
  });

  return [
    "写法生效层级（后项覆盖前项同类要求）：",
    ...lines,
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
  rules: Record<string, unknown>,
  defaultWeight: number,
  sectionWeightMap?: Record<string, number>,
): string[] {
  const entries = Object.entries(rules).filter(([key, value]) => (
    !(sectionKey === "languageRules" && SPECIAL_LANGUAGE_KEYS.has(key))
    && value !== undefined
    && value !== null
    && value !== ""
    && (!Array.isArray(value) || value.length > 0)
  ));
  if (entries.length === 0) {
    return [];
  }

  return entries.map(([key, value], index) => {
    const rawWeight = clamp(sectionWeightMap?.[key] ?? defaultWeight, 0.3, 1);
    const compatibilityField = isStyleCompatibilityField(sectionKey, key);
    const weight = compatibilityField ? clamp(rawWeight - 0.2, 0.3, 1) : rawWeight;
    const label = FIELD_LABELS[sectionKey][key] ?? key;
    const prefix = compatibilityField ? "[参考结构] " : "";
    return `${index + 1}. ${label}：${prefix}${resolveDirective(weight)}「${formatRuleValue(key, value)}」`;
  });
}

function normalizeVoiceExemplars(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, 2);
}

function normalizeContrastPairs(raw: unknown): StyleContrastPair[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .filter((item): item is StyleContrastPair => (
      Boolean(item)
      && typeof item === "object"
      && typeof (item as StyleContrastPair).aiPattern === "string"
      && typeof (item as StyleContrastPair).preferred === "string"
    ))
    .map((item) => ({
      aiPattern: item.aiPattern.trim(),
      preferred: item.preferred.trim(),
      note: typeof item.note === "string" && item.note.trim() ? item.note.trim() : null,
    }))
    .filter((item) => item.aiPattern.length > 0 && item.preferred.length > 0)
    .slice(0, 6);
}

function renderLanguageExtras(languageRules: Record<string, unknown>): string[] {
  const lines: string[] = [];
  const exemplars = normalizeVoiceExemplars(languageRules.voiceExemplars);
  if (exemplars.length > 0) {
    lines.push("语感示范样本（仅对齐句长起伏、停顿节奏与说话质感，严禁照抄其中人物、物件或剧情）：");
    for (const [index, sample] of exemplars.entries()) {
      lines.push(`示例${index + 1}：${sample}`);
    }
  }
  const pairs = normalizeContrastPairs(languageRules.contrastPairs);
  if (pairs.length > 0) {
    lines.push("去 AI 腔表达对比：");
    for (const pair of pairs) {
      const note = pair.note ? `（${pair.note}）` : "";
      lines.push(`- 避免：${pair.aiPattern} -> 改用：${pair.preferred}${note}`);
    }
  }
  return lines;
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
    grouped[rule.type].push(`- ${resolveAntiAiVerb(weight, rule.type)}：${instruction}`);
  }

  return [
    ...(grouped.forbidden.length > 0 ? ["严禁表达：", ...grouped.forbidden] : []),
    ...(grouped.risk.length > 0 ? ["风险关注：", ...grouped.risk] : []),
    ...(grouped.encourage.length > 0 ? ["鼓励手法：", ...grouped.encourage] : []),
  ];
}

function buildContractSection(input: {
  key: StyleContractSectionKey;
  summary?: string | null;
  lines: string[];
}): StyleContractSection {
  const title = SECTION_LABELS[input.key];
  const summary = compactText(input.summary);
  const text = input.lines.length > 0 ? [`【${title}】`, ...input.lines].join("\n") : "";
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
        input.styleProfile.characterRules,
        weight,
        input.sectionWeights?.characterRules,
      ),
    });
    const language = buildContractSection({
      key: "language",
      summary: input.styleProfile.languageRules.summary,
      lines: [
        ...renderObjectRules(
          "languageRules",
          input.styleProfile.languageRules,
          weight,
          input.sectionWeights?.languageRules,
        ),
        ...renderLanguageExtras(input.styleProfile.languageRules),
      ],
    });
    const rhythm = buildContractSection({
      key: "rhythm",
      summary: input.styleProfile.rhythmRules.summary,
      lines: renderObjectRules(
        "rhythmRules",
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
        "- 检查正文是否直接解释心理或替读者下结论，而不是通过动作、语气、停顿或局部细节表现。",
        "- 检查段尾是否出现总结意义、拔高主题或抒情感叹的模板收束句，若有则改回具体动作或悬而未决的处境。",
        "- 检查句式起句、比喻和身体反应是否反复雷同且没有带来新信息或新选择。",
        "- 删去不改变局势、信息或人物关系的原地打转动作，不靠重复铺垫凑字数。",
        "- 若仍感受到明显模型腔或总结感，落笔前先主动拆散句长并口语/写实化重写。",
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
        antiAiRulePolicies: input.antiAiRules.filter(rule => rule.enabled).map(rule => ({
          id: rule.id, name: rule.name, type: rule.type, severity: rule.severity, autoRewrite: rule.autoRewrite,
        })),
      },
    };

    const style = [
      "写法要求：",
      narrative.text,
      language.text,
      rhythm.text,
    ].filter(Boolean).join("\n\n");

    const output = input.outputInstruction
      ?? [
        "输出要求：",
        "只输出最终小说正文，不要解释规则、不要输出提纲或元评论。",
        weight >= 0.85
          ? "规则冲突时，在不违背人物事实与剧情义务的前提下，优先服从当前写法合同与反 AI 约束。"
          : "自然融入当前写法质感，不要写成生硬复述规则的样子。",
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
