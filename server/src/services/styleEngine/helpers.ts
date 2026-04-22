import type { AntiAiRule, StyleProfile, StyleTemplate, StyleRuleSet } from "@ai-novel/shared/types/styleEngine";
import { extractJSONObject as extractCanonicalJSONObject } from "../novel/novelP0Utils";

export function parseJsonObject<T extends Record<string, unknown>>(value?: string | null, fallback?: T): T {
  if (!value) {
    return (fallback ?? {}) as T;
  }
  try {
    const parsed = JSON.parse(value) as T;
    return parsed && typeof parsed === "object" ? parsed : ((fallback ?? {}) as T);
  } catch {
    return (fallback ?? {}) as T;
  }
}

export function parseJsonArray(value?: string | null): string[] {
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function parseJsonValue<T>(value: string | null | undefined, fallback: T): T {
  if (!value) {
    return fallback;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function serializeJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export function toLlmText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content.map((item) => {
      if (typeof item === "string") {
        return item;
      }
      if (item && typeof item === "object" && "text" in item && typeof (item as { text?: unknown }).text === "string") {
        return (item as { text: string }).text;
      }
      return "";
    }).join("");
  }
  return JSON.stringify(content ?? "");
}

export function extractJsonObject<T>(content: string): T {
  let extracted: string;
  try {
    extracted = extractCanonicalJSONObject(content);
  } catch {
    throw new Error("未解析到有效 JSON 对象。");
  }
  return JSON.parse(extracted) as T;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function mergeRuleObjects<T extends Record<string, unknown>>(base: T, override: T): T {
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) {
      continue;
    }
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      result[key] &&
      typeof result[key] === "object" &&
      !Array.isArray(result[key])
    ) {
      result[key] = mergeRuleObjects(
        result[key] as Record<string, unknown>,
        value as Record<string, unknown>,
      );
      continue;
    }
    result[key] = value;
  }
  return result as T;
}

export function buildEmptyRuleSet(): StyleRuleSet {
  return {
    narrativeRules: {},
    characterRules: {},
    languageRules: {},
    rhythmRules: {},
  };
}

export function mapStyleProfileRow(row: {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  tagsJson: string | null;
  applicableGenresJson: string | null;
  sourceType: string;
  sourceRefId: string | null;
  sourceContent: string | null;
  extractedFeaturesJson: string | null;
  analysisMarkdown: string | null;
  status: string;
  narrativeRulesJson: string | null;
  characterRulesJson: string | null;
  languageRulesJson: string | null;
  rhythmRulesJson: string | null;
  antiAiBindings?: Array<{
    antiAiRule: {
      id: string;
      key: string;
      name: string;
      type: "forbidden" | "risk" | "encourage";
      severity: "low" | "medium" | "high";
      description: string;
      detectPatternsJson: string | null;
      rewriteSuggestion: string | null;
      promptInstruction: string | null;
      autoRewrite: boolean;
      enabled: boolean;
      createdAt: Date;
      updatedAt: Date;
    };
  }>;
  createdAt: Date;
  updatedAt: Date;
}): StyleProfile {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    tags: parseJsonArray(row.tagsJson),
    applicableGenres: parseJsonArray(row.applicableGenresJson),
    sourceType: row.sourceType as StyleProfile["sourceType"],
    sourceRefId: row.sourceRefId,
    sourceContent: row.sourceContent,
    extractedFeatures: parseJsonValue(row.extractedFeaturesJson, []),
    analysisMarkdown: row.analysisMarkdown,
    status: row.status as StyleProfile["status"],
    narrativeRules: parseJsonObject(row.narrativeRulesJson),
    characterRules: parseJsonObject(row.characterRulesJson),
    languageRules: parseJsonObject(row.languageRulesJson),
    rhythmRules: parseJsonObject(row.rhythmRulesJson),
    antiAiRules: (row.antiAiBindings ?? []).map((binding) => mapAntiAiRuleRow(binding.antiAiRule)),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function mapStyleTemplateRow(row: {
  id: string;
  key: string;
  name: string;
  description: string;
  category: string;
  tagsJson: string | null;
  applicableGenresJson: string | null;
  analysisMarkdown: string | null;
  narrativeRulesJson: string | null;
  characterRulesJson: string | null;
  languageRulesJson: string | null;
  rhythmRulesJson: string | null;
  defaultAntiAiRuleKeysJson: string | null;
  createdAt: Date;
  updatedAt: Date;
}): StyleTemplate {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    category: row.category,
    tags: parseJsonArray(row.tagsJson),
    applicableGenres: parseJsonArray(row.applicableGenresJson),
    analysisMarkdown: row.analysisMarkdown,
    narrativeRules: parseJsonObject(row.narrativeRulesJson),
    characterRules: parseJsonObject(row.characterRulesJson),
    languageRules: parseJsonObject(row.languageRulesJson),
    rhythmRules: parseJsonObject(row.rhythmRulesJson),
    defaultAntiAiRuleKeys: parseJsonArray(row.defaultAntiAiRuleKeysJson),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function mapAntiAiRuleRow(row: {
  id: string;
  key: string;
  name: string;
  type: "forbidden" | "risk" | "encourage";
  severity: "low" | "medium" | "high";
  description: string;
  detectPatternsJson: string | null;
  rewriteSuggestion: string | null;
  promptInstruction: string | null;
  autoRewrite: boolean;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}): AntiAiRule {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    type: row.type,
    severity: row.severity,
    description: row.description,
    detectPatterns: parseJsonArray(row.detectPatternsJson),
    rewriteSuggestion: row.rewriteSuggestion,
    promptInstruction: row.promptInstruction,
    autoRewrite: row.autoRewrite,
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
