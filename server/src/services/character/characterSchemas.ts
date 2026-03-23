import { z } from "zod";
import { stringOrArraySchema } from "../../llm/schemaHelpers";

// 角色生成分两阶段：
// 1) skeleton：用于拼装最终角色的“半结构化骨架”
// 2) final：用于入库的最终字符串字段

export const characterSkeletonOutputSchema = z
  .object({
    nameSuggestion: z.string().trim().optional(),
    role: z.string().trim().optional(),
    corePersona: z.string().trim().optional(),
    surfaceTemperament: z.string().trim().optional(),
    coreDrive: z.string().trim().optional(),
    socialMask: z.string().trim().optional(),
    behaviorPatterns: stringOrArraySchema(4).optional(),
    triggerPoints: stringOrArraySchema(3).optional(),
    lifeOrigin: z.string().trim().optional(),
    relationshipNetwork: stringOrArraySchema(3).optional(),
    externalGoal: z.string().trim().optional(),
    internalNeed: z.string().trim().optional(),
    coreFear: z.string().trim().optional(),
    moralBottomLine: z.string().trim().optional(),
    secret: z.string().trim().optional(),
    coreFlaw: z.string().trim().optional(),
    growthArc: stringOrArraySchema(3).optional(),
    keyEvents: stringOrArraySchema(3).optional(),
    dailyAnchors: stringOrArraySchema(3).optional(),
    habitualActions: stringOrArraySchema(3).optional(),
    speechStyle: z.string().trim().optional(),
    talents: stringOrArraySchema(4).optional(),
    conflictKeywords: stringOrArraySchema(4).optional(),
    themeKeywords: stringOrArraySchema(4).optional(),
    bodyType: z.string().trim().optional(),
    facialFeatures: z.string().trim().optional(),
    styleSignature: z.string().trim().optional(),
    auraAndVoice: z.string().trim().optional(),
    appearance: z.string().trim().optional(),
    toneStyle: z.string().trim().optional(),
    conflictNotes: stringOrArraySchema(6).optional(),
  })
  .passthrough();

export const characterFinalPayloadSchema = z
  .object({
    name: z.string().trim().optional(),
    role: z.string().trim().optional(),
    personality: z.string().trim().optional(),
    background: z.string().trim().optional(),
    development: z.string().trim().optional(),
    appearance: z.string().trim().optional(),
    weaknesses: z.string().trim().optional(),
    interests: z.string().trim().optional(),
    keyEvents: z.string().trim().optional(),
    tags: z.string().trim().optional(),
    category: z.string().trim().optional(),
  })
  .passthrough();

