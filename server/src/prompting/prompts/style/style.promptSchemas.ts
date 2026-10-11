import { z } from "zod";
import { styleRiskLayerSchema } from "@ai-novel/shared/types/styleEngine";

export const styleDetectionRuleTypeSchema = z.enum([
  "style",
  "character",
  "forbidden",
  "risk",
  "encourage",
]);

export const styleDetectionViolationSchema = z.object({
  layer: styleRiskLayerSchema,
  ruleId: z.string().trim().min(1).nullish().describe("反 AI 规则目录中方括号内的原始 ID；普通写法合同问题为 null，禁止使用统计 signalCode 或自造编号。"),
  ruleName: z.string().trim().min(1),
  ruleType: styleDetectionRuleTypeSchema,
  severity: z.enum(["low", "medium", "high"]),
  issueCategory: z.enum(["style_expression", "story_structure"]).optional(),
  excerpt: z.string().trim().min(1).describe("当前正文中的一段连续原句，逐字复制；不得拼接或添加省略号缩写。"),
  reason: z.string().trim().min(1),
  suggestion: z.string().trim().min(1),
  canAutoRewrite: z.boolean(),
});

export const styleDetectionPayloadSchema = z.object({
  riskScore: z.coerce.number().min(0).max(100).optional(),
  summary: z.string().trim().optional(),
  violations: z.array(styleDetectionViolationSchema).max(8).optional().default([]),
  canAutoRewrite: z.boolean().optional().default(false),
});

export const styleRecommendationSchema = z.object({
  summary: z.string().trim().min(1),
  candidates: z.array(z.object({
    styleProfileId: z.string().trim().min(1),
    fitScore: z.number().int().min(0).max(100),
    recommendationReason: z.string().trim().min(1),
    caution: z.string().trim().optional().nullable(),
  })).min(1).max(3),
});

export const styleRuleObjectSchema = z.object({}).passthrough();

export const styleFeatureSchema = z.object({
  id: z.string().trim().min(1),
  group: z.enum(["narrative", "language", "dialogue", "rhythm", "fingerprint"]),
  label: z.string().trim().min(1),
  description: z.string().trim().min(1),
  evidence: z.string().trim().min(1),
  importance: z.number(),
  imitationValue: z.number(),
  transferability: z.number(),
  fingerprintRisk: z.number(),
  keepRulePatch: styleRuleObjectSchema,
  weakenRulePatch: styleRuleObjectSchema.optional(),
}).passthrough();

export const stylePresetSchema = z.object({
  key: z.enum(["imitate", "balanced", "transfer"]),
  label: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  decisions: z.array(z.object({
    featureId: z.string().trim().min(1),
    decision: z.enum(["keep", "weaken", "remove"]),
  })),
}).passthrough();

export const styleProfileExtractionSchema = z.object({
  name: z.string().trim().optional(),
  description: z.string().trim().optional().nullable(),
  analysisMarkdown: z.string().trim().optional().nullable(),
  summary: z.string().trim().optional(),
  features: z.array(styleFeatureSchema).optional(),
}).passthrough();

export const styleGeneratedProfileSchema = z.object({
  name: z.string().trim().optional(),
  description: z.string().trim().optional().nullable(),
  analysisMarkdown: z.string().trim().optional().nullable(),
  narrativeRules: styleRuleObjectSchema.optional(),
  characterRules: styleRuleObjectSchema.optional(),
  languageRules: styleRuleObjectSchema.optional(),
  rhythmRules: styleRuleObjectSchema.optional(),
}).passthrough();

export const styleProfileMetadataSchema = z.object({
  category: z.string().trim().optional().nullable(),
  tags: z.array(z.string().trim()).optional().default([]),
  applicableGenres: z.array(z.string().trim()).optional().default([]),
}).passthrough();

export const styleProfileAntiAiSelectionSchema = z.object({
  antiAiRuleKeys: z.array(z.string().trim()).optional().default([]),
}).passthrough();

export const styleProfileSanitizeForGenerationSchema = z.object({
  writingGuidance: z.array(z.string().trim().min(1)).default([]),
  forbiddenEntities: z.array(z.string().trim().min(1)).default([]),
  sourceRiskSummary: z.string().trim().optional().nullable(),
}).passthrough();

export const antiAiRuleDraftFieldsSchema = z.object({
  key: z.string().trim().optional().default(""),
  name: z.string().trim().min(1),
  type: z.enum(["forbidden", "risk", "encourage"]),
  severity: z.enum(["low", "medium", "high"]),
  description: z.string().trim().min(1),
  detectPatterns: z.array(z.string().trim().min(1)).max(12).optional().default([]),
  promptInstruction: z.string().trim().optional().nullable(),
  rewriteSuggestion: z.string().trim().optional().nullable(),
}).passthrough();

export const antiAiRuleAiDraftSchema = z.object({
  draft: antiAiRuleDraftFieldsSchema,
  rationale: z.string().trim().optional().default(""),
  safetyNotes: z.array(z.string().trim().min(1)).max(6).optional().default([]),
}).passthrough();
