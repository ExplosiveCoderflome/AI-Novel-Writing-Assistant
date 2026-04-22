import type {
  StyleExtractionDraft,
  StyleExtractionFeature,
  StyleExtractionFeatureGroup,
  StyleProfileFeature,
  StyleExtractionPreset,
  StyleFeatureDecision,
  StyleRulePatch,
  StyleRuleSet,
} from "@ai-novel/shared/types/styleEngine";
import {
  buildStyleRuleSetFromFeatures,
  hasStyleRulePatchContent,
  resolveStyleFeatureRulePatch,
} from "@ai-novel/shared/types/styleEngine";
import { buildEmptyRuleSet, clamp, mergeRuleObjects } from "./helpers";

const FEATURE_GROUPS: StyleExtractionFeatureGroup[] = ["narrative", "language", "dialogue", "rhythm", "fingerprint"];
const PRESET_KEYS = ["imitate", "balanced", "transfer"] as const;
type PresetKey = (typeof PRESET_KEYS)[number];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function firstNonEmptyText(...values: unknown[]): string {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (normalized) {
      return normalized;
    }
  }
  return "";
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => normalizeText(item)).filter(Boolean)
    : [];
}

function normalizeScore(value: unknown, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }
  return clamp(Number(value), 0, 1);
}

function normalizeRulePatch(value: unknown): StyleRulePatch {
  const record = asRecord(value);
  if (!record) {
    return {};
  }
  return {
    narrativeRules: asRecord(record.narrativeRules) ?? undefined,
    characterRules: asRecord(record.characterRules) ?? undefined,
    languageRules: asRecord(record.languageRules) ?? undefined,
    rhythmRules: asRecord(record.rhythmRules) ?? undefined,
  };
}

function normalizeFeature(raw: unknown, index: number): StyleExtractionFeature | null {
  const record = asRecord(raw);
  if (!record) {
    return null;
  }
  const label = firstNonEmptyText(record.label, record.name, record.title, record.feature);
  const description = firstNonEmptyText(record.description, record.summary, record.signal, record.reason);
  const evidence = firstNonEmptyText(record.evidence, record.example, record.excerpt, record.quote);
  const rawGroup = firstNonEmptyText(record.group, record.type, record.dimension) as StyleExtractionFeatureGroup;
  const group = FEATURE_GROUPS.includes(rawGroup) ? rawGroup : "fingerprint";
  if (!label || !description) {
    return null;
  }
  return {
    id: normalizeText(record.id) || `feature-${index + 1}`,
    group,
    label,
    description,
    evidence: evidence || "未提供证据片段。",
    importance: normalizeScore(record.importance, 0.5),
    imitationValue: normalizeScore(record.imitationValue, 0.5),
    transferability: normalizeScore(record.transferability, 0.5),
    fingerprintRisk: normalizeScore(record.fingerprintRisk, group === "fingerprint" ? 0.8 : 0.4),
    keepRulePatch: resolveStyleFeatureRulePatch({
      group,
      label,
      description,
      keepRulePatch: normalizeRulePatch(record.keepRulePatch ?? record.rulePatch ?? record.patch ?? record.rules),
      weakenRulePatch: normalizeRulePatch(record.weakenRulePatch ?? record.weakenPatch ?? record.softRulePatch),
    }),
    weakenRulePatch: normalizeRulePatch(record.weakenRulePatch ?? record.weakenPatch ?? record.softRulePatch),
  };
}

function normalizeProfileFeature(raw: unknown, index: number): StyleProfileFeature | null {
  const feature = normalizeFeature(raw, index);
  if (!feature) {
    return null;
  }
  const record = asRecord(raw);
  return {
    ...feature,
    enabled: typeof record?.enabled === "boolean" ? record.enabled : true,
    selectedDecision: record?.selectedDecision === "keep"
      || record?.selectedDecision === "weaken"
      || record?.selectedDecision === "remove"
      ? record.selectedDecision
      : undefined,
  };
}

function decideFeatureDecision(feature: StyleExtractionFeature, presetKey: PresetKey): StyleFeatureDecision {
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

function buildFallbackPreset(features: StyleExtractionFeature[], presetKey: PresetKey): StyleExtractionPreset {
  const labels: Record<PresetKey, { label: string; summary: string }> = {
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
      decision: decideFeatureDecision(feature, presetKey),
    })),
  };
}

function normalizePreset(raw: unknown, features: StyleExtractionFeature[]): StyleExtractionPreset | null {
  const record = asRecord(raw);
  if (!record) {
    return null;
  }
  const key = normalizeText(record.key) as PresetKey;
  if (!PRESET_KEYS.includes(key)) {
    return null;
  }
  const rawDecisions = Array.isArray(record.decisions) ? record.decisions : [];
  const decisionMap = new Map<string, StyleFeatureDecision>();
  for (const item of rawDecisions) {
    const next = asRecord(item);
    if (!next) {
      continue;
    }
    const featureId = normalizeText(next.featureId);
    const decision = normalizeText(next.decision) as StyleFeatureDecision;
    if (!featureId || !["keep", "weaken", "remove"].includes(decision)) {
      continue;
    }
    decisionMap.set(featureId, decision);
  }

  return {
    key,
    label: normalizeText(record.label) || buildFallbackPreset(features, key).label,
    summary: normalizeText(record.summary) || buildFallbackPreset(features, key).summary,
    decisions: features.map((feature) => ({
      featureId: feature.id,
      decision: decisionMap.get(feature.id) ?? decideFeatureDecision(feature, key),
    })),
  };
}

function buildPresetMap(features: StyleExtractionFeature[], rawPresets: unknown): StyleExtractionPreset[] {
  const normalized = Array.isArray(rawPresets)
    ? rawPresets
      .map((item) => normalizePreset(item, features))
      .filter((item): item is StyleExtractionPreset => Boolean(item))
    : [];

  const result: StyleExtractionPreset[] = [];
  for (const key of PRESET_KEYS) {
    result.push(normalized.find((item) => item.key === key) ?? buildFallbackPreset(features, key));
  }
  return result;
}

function mergeStylePatch(ruleSet: StyleRuleSet, patch: StyleRulePatch | undefined): StyleRuleSet {
  if (!patch) {
    return ruleSet;
  }
  return {
    narrativeRules: patch.narrativeRules ? mergeRuleObjects(ruleSet.narrativeRules, patch.narrativeRules) : ruleSet.narrativeRules,
    characterRules: patch.characterRules ? mergeRuleObjects(ruleSet.characterRules, patch.characterRules) : ruleSet.characterRules,
    languageRules: patch.languageRules ? mergeRuleObjects(ruleSet.languageRules, patch.languageRules) : ruleSet.languageRules,
    rhythmRules: patch.rhythmRules ? mergeRuleObjects(ruleSet.rhythmRules, patch.rhythmRules) : ruleSet.rhythmRules,
  };
}

export function normalizeStyleExtractionDraft(
  raw: unknown,
  inputName: string,
  inputCategory?: string,
): StyleExtractionDraft {
  const record = asRecord(raw) ?? {};
  const rawFeatures = Array.isArray(record.features)
    ? record.features
    : Array.isArray(record.extractedFeatures)
      ? record.extractedFeatures
      : Array.isArray(record.featurePool)
        ? record.featurePool
        : [];
  const features = rawFeatures
    .map((item, index) => normalizeFeature(item, index))
    .filter((item): item is StyleExtractionFeature => Boolean(item));

  return {
    name: normalizeText(record.name) || inputName,
    description: normalizeText(record.description) || null,
    category: normalizeText(record.category) || inputCategory?.trim() || null,
    tags: normalizeStringArray(record.tags),
    applicableGenres: normalizeStringArray(record.applicableGenres),
    analysisMarkdown: normalizeText(record.analysisMarkdown) || null,
    summary: normalizeText(record.summary) || "已完成文本写法特征提取。",
    features,
    presets: buildPresetMap(features, record.presets),
    antiAiRuleKeys: normalizeStringArray(record.antiAiRuleKeys),
  };
}

export function resolveStyleExtractionDecisions(
  draft: StyleExtractionDraft,
  decisions: Array<{ featureId: string; decision: StyleFeatureDecision }>,
  presetKey?: PresetKey,
): Map<string, StyleFeatureDecision> {
  const map = new Map<string, StyleFeatureDecision>();
  const preset = presetKey
    ? draft.presets.find((item) => item.key === presetKey)
    : draft.presets.find((item) => item.key === "balanced");

  for (const feature of draft.features) {
    const presetDecision = preset?.decisions.find((item) => item.featureId === feature.id)?.decision ?? "keep";
    map.set(feature.id, presetDecision);
  }

  for (const item of decisions) {
    if (!["keep", "weaken", "remove"].includes(item.decision)) {
      continue;
    }
    map.set(item.featureId, item.decision);
  }

  return map;
}

export function buildProfileFeaturesFromDraft(draft: StyleExtractionDraft): StyleProfileFeature[] {
  return draft.features.map((feature) => ({
    ...feature,
    keepRulePatch: hasStyleRulePatchContent(feature.keepRulePatch)
      ? feature.keepRulePatch
      : resolveStyleFeatureRulePatch(feature),
    enabled: true,
    selectedDecision: "keep",
  }));
}

export function normalizeStyleProfileFeatures(raw: unknown): StyleProfileFeature[] {
  return Array.isArray(raw)
    ? raw
      .map((item, index) => normalizeProfileFeature(item, index))
      .filter((item): item is StyleProfileFeature => Boolean(item))
    : [];
}

export function buildRuleSetFromProfileFeatures(features: StyleProfileFeature[]): StyleRuleSet {
  return buildStyleRuleSetFromFeatures(features);
}

export function buildRuleSetFromExtraction(
  draft: StyleExtractionDraft,
  decisions: Array<{ featureId: string; decision: StyleFeatureDecision }>,
  presetKey?: PresetKey,
): StyleRuleSet {
  const decisionMap = resolveStyleExtractionDecisions(draft, decisions, presetKey);
  return buildStyleRuleSetFromFeatures(
    draft.features.map((feature) => ({
      ...feature,
      enabled: (decisionMap.get(feature.id) ?? "keep") !== "remove",
      selectedDecision: decisionMap.get(feature.id) ?? "keep",
    })),
  );
}

export function buildExtractionAnalysisMarkdown(
  draft: StyleExtractionDraft,
  decisions: Array<{ featureId: string; decision: StyleFeatureDecision }>,
  presetKey?: PresetKey,
): string {
  const decisionMap = resolveStyleExtractionDecisions(draft, decisions, presetKey);
  const lines = [draft.summary];
  const groups: Array<{ key: StyleFeatureDecision; label: string }> = [
    { key: "keep", label: "保留特征" },
    { key: "weaken", label: "弱化特征" },
    { key: "remove", label: "剥离特征" },
  ];

  for (const group of groups) {
    const matched = draft.features
      .filter((feature) => (decisionMap.get(feature.id) ?? "keep") === group.key)
      .map((feature) => `- ${feature.label}：${feature.description}`);
    if (matched.length === 0) {
      continue;
    }
    lines.push(`\n${group.label}\n${matched.join("\n")}`);
  }

  return lines.join("\n");
}

export function buildProfileFeatureAnalysisMarkdown(summary: string, features: StyleProfileFeature[]): string {
  const lines = [summary];
  const enabled = features.filter((feature) => feature.enabled).map((feature) => `- ${feature.label}：${feature.description}`);
  const disabled = features.filter((feature) => !feature.enabled).map((feature) => `- ${feature.label}：${feature.description}`);

  if (enabled.length > 0) {
    lines.push(`\n启用特征\n${enabled.join("\n")}`);
  }
  if (disabled.length > 0) {
    lines.push(`\n停用特征\n${disabled.join("\n")}`);
  }

  return lines.join("\n");
}
