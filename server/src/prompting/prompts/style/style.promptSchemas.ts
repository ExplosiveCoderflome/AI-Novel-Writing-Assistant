import { z } from "zod";

export const styleDetectionViolationSchema = z.object({
  ruleId: z.string().trim().optional(),
  ruleName: z.string().trim().min(1),
  ruleType: z.enum(["forbidden", "risk", "encourage"]),
  severity: z.enum(["low", "medium", "high"]),
  excerpt: z.string().trim().min(1),
  reason: z.string().trim().min(1),
  suggestion: z.string().trim().min(1),
  canAutoRewrite: z.boolean(),
});

export const styleDetectionPayloadSchema = z.object({
  riskScore: z.coerce.number().min(0).max(100).optional(),
  summary: z.string().trim().optional(),
  violations: z.array(styleDetectionViolationSchema).optional().default([]),
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
  category: z.string().trim().optional().nullable(),
  tags: z.array(z.string().trim()).optional(),
  applicableGenres: z.array(z.string().trim()).optional(),
  analysisMarkdown: z.string().trim().optional().nullable(),
  summary: z.string().trim().optional(),
  antiAiRuleKeys: z.array(z.string().trim()).optional(),
  features: z.array(styleFeatureSchema).optional(),
  presets: z.array(stylePresetSchema).optional(),
}).passthrough();

export const styleGeneratedProfileSchema = z.object({
  name: z.string().trim().optional(),
  description: z.string().trim().optional().nullable(),
  category: z.string().trim().optional().nullable(),
  tags: z.array(z.string().trim()).optional(),
  applicableGenres: z.array(z.string().trim()).optional(),
  analysisMarkdown: z.string().trim().optional().nullable(),
  antiAiRuleKeys: z.array(z.string().trim()).optional(),
  narrativeRules: styleRuleObjectSchema.optional(),
  characterRules: styleRuleObjectSchema.optional(),
  languageRules: styleRuleObjectSchema.optional(),
  rhythmRules: styleRuleObjectSchema.optional(),
}).passthrough();
