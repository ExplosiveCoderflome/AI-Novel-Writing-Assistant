import type { StyleExtractionDraft, StyleProfileFeature, StyleRuleSet } from "@ai-novel/shared/types/styleEngine";

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergeRuleObjects(base: Record<string, unknown>, patch: Record<string, unknown>) {
  const next: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      continue;
    }
    if (isRecord(value) && isRecord(next[key])) {
      next[key] = mergeRuleObjects(next[key] as Record<string, unknown>, value);
      continue;
    }
    next[key] = value;
  }
  return next;
}

export function buildRuleSetFromExtractedFeatures(features: StyleProfileFeature[]): StyleRuleSet {
  const next: StyleRuleSet = {
    narrativeRules: {},
    characterRules: {},
    languageRules: {},
    rhythmRules: {},
  };

  for (const feature of features) {
    if (!feature.enabled) {
      continue;
    }
    const patch = feature.keepRulePatch ?? {};
    if (isRecord(patch.narrativeRules)) {
      next.narrativeRules = mergeRuleObjects(next.narrativeRules, patch.narrativeRules);
    }
    if (isRecord(patch.characterRules)) {
      next.characterRules = mergeRuleObjects(next.characterRules, patch.characterRules);
    }
    if (isRecord(patch.languageRules)) {
      next.languageRules = mergeRuleObjects(next.languageRules, patch.languageRules);
    }
    if (isRecord(patch.rhythmRules)) {
      next.rhythmRules = mergeRuleObjects(next.rhythmRules, patch.rhythmRules);
    }
  }

  return next;
}

export function buildProfileFeaturesFromDraft(draft: StyleExtractionDraft): StyleProfileFeature[] {
  return draft.features.map((feature) => ({
    ...feature,
    enabled: true,
  }));
}
