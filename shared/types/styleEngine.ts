import type { LLMProvider } from "./llm";

export type StyleSourceType =
  | "manual"
  | "from_text"
  | "from_book_analysis"
  | "from_knowledge_document"
  | "from_current_work";
export type StyleExtractionSourceProcessingMode = "full_text" | "representative_sample";
export type StyleProfileStatus = "active" | "archived";
export type StyleBindingTargetType = "novel" | "chapter" | "task";
export type AntiAiRuleType = "forbidden" | "risk" | "encourage";
export type StyleDetectionRuleType = "style" | "character" | AntiAiRuleType;
export type AntiAiSeverity = "low" | "medium" | "high";

export interface NarrativeRules {
  progressionMode?: string | null;
  sceneUnitPattern?: string[];
  multiPov?: boolean | null;
  looping?: boolean | null;
  endingStyle?: string | null;
  povSwitchStyle?: string | null;
  summary?: string | null;
  [key: string]: unknown;
}

export interface CharacterRules {
  allowSelfReflection?: boolean | null;
  emotionExpression?: string | null;
  defenseMechanisms?: string[];
  facePriority?: boolean | null;
  dialogueStyle?: string | null;
  summary?: string | null;
  [key: string]: unknown;
}

export interface LanguageRules {
  register?: string | null;
  roughness?: number | null;
  allowIncompleteSentences?: boolean | null;
  allowSwearing?: boolean | null;
  sentenceVariation?: string | null;
  allowUselessDetails?: boolean | null;
  summary?: string | null;
  [key: string]: unknown;
}

export interface RhythmRules {
  pace?: string | null;
  paragraphDensity?: string | null;
  allowFragmentedFlow?: boolean | null;
  actionOverExplanation?: boolean | null;
  summary?: string | null;
  [key: string]: unknown;
}

export interface StyleRuleSet {
  narrativeRules: NarrativeRules;
  characterRules: CharacterRules;
  languageRules: LanguageRules;
  rhythmRules: RhythmRules;
}

export type StyleContractSectionKey =
  | "narrative"
  | "character"
  | "language"
  | "rhythm"
  | "antiAi"
  | "selfCheck";

export type StyleContractMaturity = "structured" | "summary_only";
export type StyleContractIssueCategory = "style_expression" | "story_structure";
export type StyleContractViolationSource = "global_anti_ai" | "style_anti_ai" | "style_contract";

export interface StyleContractSection {
  key: StyleContractSectionKey;
  title: string;
  summary?: string | null;
  lines: string[];
  text: string;
  hasContent: boolean;
}

export interface StyleContractMeta {
  effectiveStyleProfileId?: string | null;
  taskStyleProfileId?: string | null;
  activeSourceTargets: StyleBindingTargetType[];
  activeSourceLabels: string[];
  writerIncludedSections: StyleContractSectionKey[];
  plannerIncludedSections: StyleContractSectionKey[];
  droppedSections: StyleContractSectionKey[];
  maturity: StyleContractMaturity;
  usesGlobalAntiAiBaseline: boolean;
  globalAntiAiRuleIds: string[];
  styleAntiAiRuleIds: string[];
}

export interface StyleContract {
  narrative: StyleContractSection;
  character: StyleContractSection;
  language: StyleContractSection;
  rhythm: StyleContractSection;
  antiAi: StyleContractSection;
  selfCheck: StyleContractSection;
  meta: StyleContractMeta;
}

export interface StyleRulePatch {
  narrativeRules?: NarrativeRules;
  characterRules?: CharacterRules;
  languageRules?: LanguageRules;
  rhythmRules?: RhythmRules;
}

export const STYLE_ENGINE_COMPATIBILITY_FIELDS = {
  narrativeRules: [
    "progressionMode",
    "sceneUnitPattern",
    "multiPov",
    "looping",
    "endingStyle",
  ],
  characterRules: [],
  languageRules: [],
  rhythmRules: [],
} as const satisfies Record<keyof StyleRuleSet, readonly string[]>;

export type StyleRuleSectionKey = keyof StyleRuleSet;

export function isStyleCompatibilityField(
  section: StyleRuleSectionKey,
  key: string,
): boolean {
  return (STYLE_ENGINE_COMPATIBILITY_FIELDS[section] as readonly string[]).includes(key);
}

export type StyleExtractionFeatureGroup = "narrative" | "language" | "dialogue" | "rhythm" | "fingerprint";
export type StyleFeatureDecision = "keep" | "weaken" | "remove";

export interface StyleExtractionFeature {
  id: string;
  group: StyleExtractionFeatureGroup;
  label: string;
  description: string;
  evidence: string;
  importance: number;
  imitationValue: number;
  transferability: number;
  fingerprintRisk: number;
  keepRulePatch: StyleRulePatch;
  weakenRulePatch?: StyleRulePatch;
}

export interface StyleProfileFeature extends StyleExtractionFeature {
  enabled: boolean;
  selectedDecision?: StyleFeatureDecision;
}

export interface StyleExtractionPresetDecision {
  featureId: string;
  decision: StyleFeatureDecision;
}

export interface StyleExtractionPreset {
  key: "imitate" | "balanced" | "transfer";
  label: string;
  summary: string;
  decisions: StyleExtractionPresetDecision[];
}

export interface StyleExtractionDraft {
  name: string;
  description?: string | null;
  category?: string | null;
  tags: string[];
  applicableGenres: string[];
  analysisMarkdown?: string | null;
  summary: string;
  features: StyleExtractionFeature[];
  presets: StyleExtractionPreset[];
  antiAiRuleKeys: string[];
}

export interface AntiAiRule {
  id: string;
  key: string;
  name: string;
  type: AntiAiRuleType;
  severity: AntiAiSeverity;
  description: string;
  detectPatterns: string[];
  rewriteSuggestion?: string | null;
  promptInstruction?: string | null;
  autoRewrite: boolean;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StyleProfile {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  tags: string[];
  applicableGenres: string[];
  sourceType: StyleSourceType;
  sourceRefId?: string | null;
  sourceContent?: string | null;
  analysisMarkdown?: string | null;
  status: StyleProfileStatus;
  extractedFeatures: StyleProfileFeature[];
  extractionPresets: StyleExtractionPreset[];
  extractionAntiAiRuleKeys: string[];
  selectedExtractionPresetKey?: StyleExtractionPreset["key"] | null;
  narrativeRules: NarrativeRules;
  characterRules: CharacterRules;
  languageRules: LanguageRules;
  rhythmRules: RhythmRules;
  antiAiRules: AntiAiRule[];
  createdAt: string;
  updatedAt: string;
}

function isRuleRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergeRuleObjects<T extends Record<string, unknown>>(base: T, patch: T): T {
  const next: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      continue;
    }
    if (
      key === "summary"
      && typeof value === "string"
      && value.trim().length > 0
      && typeof next[key] === "string"
      && next[key].trim().length > 0
      && next[key] !== value
    ) {
      next[key] = `${next[key]}；${value}`;
      continue;
    }
    if (isRuleRecord(value) && isRuleRecord(next[key])) {
      next[key] = mergeRuleObjects(
        next[key] as Record<string, unknown>,
        value as Record<string, unknown>,
      );
      continue;
    }
    next[key] = value;
  }
  return next as T;
}

function ruleSectionHasContent(value: unknown): boolean {
  if (!isRuleRecord(value)) {
    return false;
  }
  return Object.values(value).some((item) => {
    if (item == null) {
      return false;
    }
    if (typeof item === "string") {
      return item.trim().length > 0;
    }
    if (typeof item === "number" || typeof item === "boolean") {
      return true;
    }
    if (Array.isArray(item)) {
      return item.length > 0;
    }
    if (isRuleRecord(item)) {
      return ruleSectionHasContent(item);
    }
    return false;
  });
}

export function hasStyleRulePatchContent(patch: StyleRulePatch | null | undefined): boolean {
  if (!patch) {
    return false;
  }
  return ruleSectionHasContent(patch.narrativeRules)
    || ruleSectionHasContent(patch.characterRules)
    || ruleSectionHasContent(patch.languageRules)
    || ruleSectionHasContent(patch.rhythmRules);
}

export function buildFallbackStyleRulePatch(
  feature: Pick<StyleExtractionFeature, "group" | "label" | "description">,
): StyleRulePatch {
  const summary = `${feature.label}：${feature.description}`.trim();
  if (!summary) {
    return {};
  }

  if (feature.group === "language") {
    return {
      languageRules: {
        summary,
      },
    };
  }

  if (feature.group === "dialogue") {
    return {
      characterRules: {
        summary,
      },
    };
  }

  if (feature.group === "rhythm") {
    return {
      rhythmRules: {
        summary,
      },
    };
  }

  return {
    narrativeRules: {
      summary,
    },
  };
}

export function resolveStyleFeatureRulePatch(
  feature: Pick<
    StyleExtractionFeature,
    "group" | "label" | "description" | "keepRulePatch" | "weakenRulePatch"
  >,
  decision?: StyleFeatureDecision,
): StyleRulePatch {
  const preferredPatch = decision === "weaken" && hasStyleRulePatchContent(feature.weakenRulePatch)
    ? feature.weakenRulePatch ?? {}
    : feature.keepRulePatch ?? {};
  if (hasStyleRulePatchContent(preferredPatch)) {
    return preferredPatch;
  }
  return buildFallbackStyleRulePatch(feature);
}

export function mergeStyleRuleSet(base: StyleRuleSet, patch: StyleRulePatch): StyleRuleSet {
  return {
    narrativeRules: patch.narrativeRules
      ? mergeRuleObjects(base.narrativeRules, patch.narrativeRules)
      : base.narrativeRules,
    characterRules: patch.characterRules
      ? mergeRuleObjects(base.characterRules, patch.characterRules)
      : base.characterRules,
    languageRules: patch.languageRules
      ? mergeRuleObjects(base.languageRules, patch.languageRules)
      : base.languageRules,
    rhythmRules: patch.rhythmRules
      ? mergeRuleObjects(base.rhythmRules, patch.rhythmRules)
      : base.rhythmRules,
  };
}

export function buildStyleRuleSetFromFeatures(
  features: Array<Pick<
    StyleProfileFeature,
    "enabled" | "selectedDecision" | "group" | "label" | "description" | "keepRulePatch" | "weakenRulePatch"
  >>,
): StyleRuleSet {
  let next: StyleRuleSet = {
    narrativeRules: {},
    characterRules: {},
    languageRules: {},
    rhythmRules: {},
  };

  for (const feature of features) {
    if (!feature.enabled) {
      continue;
    }
    next = mergeStyleRuleSet(next, resolveStyleFeatureRulePatch(feature, feature.selectedDecision));
  }

  return next;
}

export function decideStyleFeatureDecision(
  feature: Pick<StyleExtractionFeature, "importance" | "imitationValue" | "transferability" | "fingerprintRisk">,
  presetKey: StyleExtractionPreset["key"],
): StyleFeatureDecision {
  if (presetKey === "imitate") {
    if (feature.imitationValue >= 0.45 || feature.importance >= 0.7) {
      return "keep";
    }
    return feature.fingerprintRisk >= 0.8 ? "weaken" : "keep";
  }

  if (presetKey === "transfer") {
    if (feature.transferability >= 0.7 && feature.fingerprintRisk <= 0.55) {
      return "keep";
    }
    if (feature.transferability >= 0.45 && feature.fingerprintRisk <= 0.75) {
      return "weaken";
    }
    return "remove";
  }

  if (feature.fingerprintRisk >= 0.8 && feature.transferability < 0.5) {
    return "remove";
  }
  if (feature.fingerprintRisk >= 0.55 || feature.transferability < 0.55) {
    return "weaken";
  }
  return "keep";
}

export function buildStyleExtractionPreset(
  features: StyleExtractionFeature[],
  presetKey: StyleExtractionPreset["key"],
): StyleExtractionPreset {
  const labels: Record<StyleExtractionPreset["key"], { label: string; summary: string }> = {
    imitate: {
      label: "高保真仿写",
      summary: "尽量保留高相似度特征，适合临摹、仿写和风格贴近试写。",
    },
    balanced: {
      label: "平衡保留",
      summary: "保住写法骨架，同时弱化原文指纹，适合大多数写作场景。",
    },
    transfer: {
      label: "写法迁移",
      summary: "优先保留可迁移规则，主动剥离高指纹风险特征，适合整书绑定。",
    },
  };

  return {
    key: presetKey,
    label: labels[presetKey].label,
    summary: labels[presetKey].summary,
    decisions: features.map((feature) => ({
      featureId: feature.id,
      decision: decideStyleFeatureDecision(feature, presetKey),
    })),
  };
}

export function buildStyleExtractionPresets(features: StyleExtractionFeature[]): StyleExtractionPreset[] {
  return [
    buildStyleExtractionPreset(features, "imitate"),
    buildStyleExtractionPreset(features, "balanced"),
    buildStyleExtractionPreset(features, "transfer"),
  ];
}

export interface StyleTemplate {
  id: string;
  key: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  applicableGenres: string[];
  analysisMarkdown?: string | null;
  narrativeRules: NarrativeRules;
  characterRules: CharacterRules;
  languageRules: LanguageRules;
  rhythmRules: RhythmRules;
  defaultAntiAiRuleKeys: string[];
  createdAt: string;
  updatedAt: string;
}

export interface StyleBinding {
  id: string;
  styleProfileId: string;
  targetType: StyleBindingTargetType;
  targetId: string;
  priority: number;
  weight: number;
  enabled: boolean;
  styleProfile?: StyleProfile;
  createdAt: string;
  updatedAt: string;
}

export interface CompiledStylePromptBlocks {
  context: string;
  style: string;
  character: string;
  antiAi: string;
  output: string;
  selfCheck: string;
  contract: StyleContract;
  mergedRules: StyleRuleSet;
  appliedRuleIds: string[];
}

export interface StyleDetectionViolation {
  ruleId: string;
  ruleName: string;
  ruleType: StyleDetectionRuleType;
  severity: AntiAiSeverity;
  source: StyleContractViolationSource;
  issueCategory: StyleContractIssueCategory;
  excerpt: string;
  reason: string;
  suggestion: string;
  canAutoRewrite: boolean;
}

export interface StyleDetectionReport {
  riskScore: number;
  summary: string;
  violations: StyleDetectionViolation[];
  canAutoRewrite: boolean;
  appliedRuleIds: string[];
}

export interface StyleGenerationLlmConfig {
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
}

export interface StyleRecommendationCandidate {
  styleProfileId: string;
  styleProfileName: string;
  styleProfileDescription?: string | null;
  fitScore: number;
  recommendationReason: string;
  caution?: string | null;
}

export interface StyleRecommendationResult {
  novelId: string;
  summary: string;
  candidates: StyleRecommendationCandidate[];
  recommendedAt: string;
}

export interface ResolvedStyleContext {
  matchedBindings: StyleBinding[];
  compiledBlocks: CompiledStylePromptBlocks | null;
  effectiveStyleProfileId: string | null;
  taskStyleProfileId: string | null;
  activeSourceTargets: StyleBindingTargetType[];
  activeSourceLabels: string[];
  maturity: StyleContractMaturity;
  usesGlobalAntiAiBaseline: boolean;
  globalAntiAiRuleIds: string[];
  styleAntiAiRuleIds: string[];
}

export interface StyleIntentSummary {
  source: "style_profile" | "style_tone";
  styleProfileId?: string | null;
  styleProfileName?: string | null;
  headline: string;
  readingFeel?: string | null;
  languageFocus?: string | null;
  dialogueFocus?: string | null;
  emotionFocus?: string | null;
  antiAiFocus: string[];
  stageSummaryLines: string[];
}

function compactText(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.replace(/\s+/g, " ").trim();
}

function firstNonEmptyText(...values: unknown[]): string | null {
  for (const value of values) {
    const normalized = compactText(value);
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

function formatBooleanHint(value: boolean | null | undefined, positive: string, negative: string): string | null {
  if (value === true) {
    return positive;
  }
  if (value === false) {
    return negative;
  }
  return null;
}

function buildLanguageFocus(languageRules: LanguageRules): string | null {
  return firstNonEmptyText(
    languageRules.summary,
    [
      compactText(languageRules.register),
      typeof languageRules.roughness === "number" ? `粗粝度 ${Math.round(languageRules.roughness)}` : "",
      compactText(languageRules.sentenceVariation),
      formatBooleanHint(languageRules.allowIncompleteSentences, "允许不完整句", "句子尽量完整"),
      formatBooleanHint(languageRules.allowSwearing, "允许口语脏字", "避免粗口"),
    ].filter(Boolean).join("，"),
  );
}

function buildDialogueFocus(characterRules: CharacterRules): string | null {
  return firstNonEmptyText(
    characterRules.dialogueStyle,
    [
      compactText(characterRules.summary),
      compactText(characterRules.emotionExpression),
    ].filter(Boolean).join("，"),
  );
}

function buildEmotionFocus(characterRules: CharacterRules): string | null {
  return firstNonEmptyText(
    characterRules.emotionExpression,
    [
      Array.isArray(characterRules.defenseMechanisms) && characterRules.defenseMechanisms.length > 0
        ? `防御机制：${characterRules.defenseMechanisms.join("、")}`
        : "",
      formatBooleanHint(characterRules.allowSelfReflection, "允许明确自省", "少做直白自省"),
      formatBooleanHint(characterRules.facePriority, "优先保住体面", "不强求体面"),
    ].filter(Boolean).join("，"),
  );
}

function buildAntiAiFocus(profile: Pick<StyleProfile, "antiAiRules"> | null | undefined): string[] {
  const antiAiRules = profile?.antiAiRules ?? [];
  return antiAiRules
    .map((rule) => firstNonEmptyText(rule.promptInstruction, rule.rewriteSuggestion, rule.description, rule.name))
    .filter((item): item is string => Boolean(item))
    .slice(0, 3);
}

export function buildStyleIntentSummary(input: {
  styleProfile?: Pick<
    StyleProfile,
    "id"
    | "name"
    | "description"
    | "narrativeRules"
    | "characterRules"
    | "languageRules"
    | "rhythmRules"
    | "antiAiRules"
  > | null;
  styleTone?: string | null;
}): StyleIntentSummary | null {
  const styleTone = compactText(input.styleTone);
  const styleProfile = input.styleProfile ?? null;

  if (!styleProfile && !styleTone) {
    return null;
  }

  const readingFeel = firstNonEmptyText(
    styleProfile?.description,
    styleProfile?.narrativeRules.summary,
    styleProfile?.rhythmRules.summary,
    styleProfile ? null : styleTone,
  );
  const languageFocus = styleProfile ? buildLanguageFocus(styleProfile.languageRules) : null;
  const dialogueFocus = styleProfile ? buildDialogueFocus(styleProfile.characterRules) : null;
  const emotionFocus = styleProfile ? buildEmotionFocus(styleProfile.characterRules) : null;
  const antiAiFocus = buildAntiAiFocus(styleProfile);
  const headline = firstNonEmptyText(styleProfile?.name, styleProfile ? null : styleTone) ?? "未命名写法";
  const stageSummaryLines = [
    readingFeel ? `读感承诺：${readingFeel}` : "",
    languageFocus ? `语言密度：${languageFocus}` : "",
    dialogueFocus ? `对白风格：${dialogueFocus}` : "",
    emotionFocus ? `情绪外显：${emotionFocus}` : "",
    antiAiFocus.length > 0 ? `反 AI 约束：${antiAiFocus.join("；")}` : "",
    !styleProfile && styleTone ? `文风关键词：${styleTone}` : "",
  ].filter(Boolean);

  return {
    source: styleProfile ? "style_profile" : "style_tone",
    styleProfileId: styleProfile?.id ?? null,
    styleProfileName: styleProfile?.name ?? null,
    headline,
    readingFeel,
    languageFocus,
    dialogueFocus,
    emotionFocus,
    antiAiFocus,
    stageSummaryLines,
  };
}
