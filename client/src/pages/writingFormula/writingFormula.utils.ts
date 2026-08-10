import {
  buildStyleRuleSetFromFeatures,
  resolveStyleFeatureRulePatch,
  type StyleExtractionDraft,
  type StyleProfileFeature,
  type StyleRuleSet,
} from "@ai-novel/shared/types/styleEngine";

export function prettyJson(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

export function parseJsonInput(value: string) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

export function normalizeCsv(value: string) {
  return value.split(/[,\uFF0C]/).map((item) => item.trim()).filter(Boolean);
}

export function buildRuleSetFromExtractedFeatures(features: StyleProfileFeature[]): StyleRuleSet {
  return buildStyleRuleSetFromFeatures(features);
}

export function buildProfileFeaturesFromDraft(draft: StyleExtractionDraft): StyleProfileFeature[] {
  return draft.features.map((feature) => ({
    ...feature,
    keepRulePatch: resolveStyleFeatureRulePatch(feature),
    enabled: true,
    selectedDecision: "keep",
  }));
}
