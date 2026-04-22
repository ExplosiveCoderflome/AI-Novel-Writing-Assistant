import type {
  AntiAiRule,
  StyleExtractionFeature,
  StyleRuleSet,
} from "@ai-novel/shared/types/styleEngine";

export interface StyleMetadataDraft {
  category?: string | null;
  tags: string[];
  applicableGenres: string[];
}

export interface StyleAntiAiSelectionDraft {
  antiAiRuleKeys: string[];
}

export interface StyleCreationCoreDraft {
  name: string;
  description?: string | null;
  summary?: string | null;
  analysisMarkdown?: string | null;
  features?: StyleExtractionFeature[];
  ruleSet?: Partial<StyleRuleSet>;
}

function compactText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
      .map((item) => compactText(item))
      .filter(Boolean)
    : [];
}

function takeFeatureDigest(features: StyleExtractionFeature[] | undefined, limit: number): string[] {
  return (features ?? [])
    .slice(0, limit)
    .map((feature) => {
      const risk = feature.fingerprintRisk >= 0.65
        ? `；指纹风险 ${Math.round(feature.fingerprintRisk * 100)}`
        : "";
      return `- [${feature.group}] ${feature.label}：${feature.description}${risk}`;
    });
}

function takeRiskDigest(features: StyleExtractionFeature[] | undefined, limit: number): string[] {
  return (features ?? [])
    .slice()
    .sort((left, right) => right.fingerprintRisk - left.fingerprintRisk)
    .slice(0, limit)
    .map((feature) => (
      `- ${feature.label}：指纹风险 ${Math.round(feature.fingerprintRisk * 100)} / 迁移性 ${Math.round(feature.transferability * 100)} / 仿写价值 ${Math.round(feature.imitationValue * 100)}`
    ));
}

function renderRuleSection(sectionLabel: string, rules: Record<string, unknown> | undefined, limit: number): string[] {
  if (!rules || typeof rules !== "object" || Array.isArray(rules)) {
    return [];
  }

  return Object.entries(rules)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .slice(0, limit)
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        return `- ${sectionLabel}.${key}：${value.join("、")}`;
      }
      if (typeof value === "boolean") {
        return `- ${sectionLabel}.${key}：${value ? "是" : "否"}`;
      }
      return `- ${sectionLabel}.${key}：${String(value)}`;
    });
}

export function normalizeStyleMetadataDraft(
  raw: unknown,
  fallbackCategory?: string | null,
): StyleMetadataDraft {
  const record = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
  const category = compactText(record.category) || compactText(fallbackCategory) || null;
  return {
    category,
    tags: normalizeStringArray(record.tags),
    applicableGenres: normalizeStringArray(record.applicableGenres),
  };
}

export function normalizeStyleAntiAiSelectionDraft(
  raw: unknown,
  allowedRuleKeys: Iterable<string>,
): StyleAntiAiSelectionDraft {
  const record = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
  const allowed = new Set(Array.from(allowedRuleKeys));
  const antiAiRuleKeys = normalizeStringArray(record.antiAiRuleKeys)
    .filter((key, index, array) => allowed.has(key) && array.indexOf(key) === index);
  return { antiAiRuleKeys };
}

export function buildStyleMetadataDigest(input: StyleCreationCoreDraft): string {
  const lines = [
    compactText(input.description) ? `写法概述：${compactText(input.description)}` : "",
    compactText(input.summary) ? `核心摘要：${compactText(input.summary)}` : "",
    compactText(input.analysisMarkdown) ? `分析短稿：${compactText(input.analysisMarkdown)}` : "",
  ].filter(Boolean);

  const featureLines = takeFeatureDigest(input.features, 8);
  if (featureLines.length > 0) {
    lines.push("特征摘要：", ...featureLines);
  }

  const ruleLines = [
    ...renderRuleSection("叙事", input.ruleSet?.narrativeRules as Record<string, unknown> | undefined, 4),
    ...renderRuleSection("角色", input.ruleSet?.characterRules as Record<string, unknown> | undefined, 4),
    ...renderRuleSection("语言", input.ruleSet?.languageRules as Record<string, unknown> | undefined, 4),
    ...renderRuleSection("节奏", input.ruleSet?.rhythmRules as Record<string, unknown> | undefined, 4),
  ];
  if (ruleLines.length > 0) {
    lines.push("规则摘要：", ...ruleLines);
  }

  return lines.join("\n").trim();
}

export function buildStyleAntiAiRiskDigest(input: StyleCreationCoreDraft): string {
  const lines = [
    compactText(input.summary) ? `写法核心：${compactText(input.summary)}` : "",
    compactText(input.description) ? `读感定位：${compactText(input.description)}` : "",
  ].filter(Boolean);

  const riskLines = takeRiskDigest(input.features, 6);
  if (riskLines.length > 0) {
    lines.push("高风险特征：", ...riskLines);
  }

  const ruleLines = [
    ...renderRuleSection("叙事", input.ruleSet?.narrativeRules as Record<string, unknown> | undefined, 3),
    ...renderRuleSection("角色", input.ruleSet?.characterRules as Record<string, unknown> | undefined, 3),
    ...renderRuleSection("语言", input.ruleSet?.languageRules as Record<string, unknown> | undefined, 3),
    ...renderRuleSection("节奏", input.ruleSet?.rhythmRules as Record<string, unknown> | undefined, 3),
  ];
  if (ruleLines.length > 0) {
    lines.push("规则抓手：", ...ruleLines);
  }

  return lines.join("\n").trim();
}

export function buildAntiAiCatalogText(rules: AntiAiRule[], limit = 24): string {
  return rules
    .slice(0, limit)
    .map((rule) => {
      const instruction = compactText(rule.promptInstruction)
        || compactText(rule.rewriteSuggestion)
        || compactText(rule.description);
      return `- key=${rule.key} | 名称=${rule.name} | 类型=${rule.type} | 严重度=${rule.severity} | 说明=${instruction}`;
    })
    .join("\n");
}
