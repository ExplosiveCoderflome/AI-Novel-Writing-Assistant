import { z } from "zod";
import {
  characterResourceEventTypeSchema,
  characterResourceNarrativeFunctionSchema,
  characterResourceOwnerTypeSchema,
  characterResourceRiskSeveritySchema,
  characterResourceStatusSchema,
  characterResourceTypeSchema,
} from "@ai-novel/shared/types/characterResource";

function normalizeOptionalConfidence(value: unknown): unknown {
  if (value == null || typeof value === "number") {
    return value;
  }
  if (typeof value !== "string") {
    return value;
  }
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : undefined;
}

export const characterResourceExtractionUpdateSchema = z.object({
  resourceName: z.string().trim().min(1),
  resourceType: characterResourceTypeSchema.default("physical_item"),
  updateType: characterResourceEventTypeSchema,
  holderCharacterName: z.string().trim().optional().nullable(),
  previousHolderCharacterName: z.string().trim().optional().nullable(),
  ownerType: characterResourceOwnerTypeSchema.default("unknown"),
  ownerName: z.string().trim().optional().nullable(),
  statusAfter: characterResourceStatusSchema,
  readerKnows: z.boolean().default(true),
  holderKnows: z.boolean().default(true),
  knownByCharacterNames: z.array(z.string().trim().min(1)).default([]),
  narrativeFunction: characterResourceNarrativeFunctionSchema.default("tool"),
  summary: z.string().trim().optional().nullable(),
  narrativeImpact: z.string().trim().min(1),
  expectedFutureUse: z.string().trim().optional().nullable(),
  expectedUseStartChapterOrder: z.number().int().optional().nullable(),
  expectedUseEndChapterOrder: z.number().int().optional().nullable(),
  constraints: z.array(z.string().trim().min(1)).default([]),
  evidence: z.array(z.string().trim().min(1)).default([]),
  confidence: z.preprocess(normalizeOptionalConfidence, z.number().min(0).max(1).optional().nullable()),
  riskLevel: z.enum(["low", "medium", "high"]).default("low"),
  riskReason: z.string().trim().optional().nullable(),
});

export const characterResourceContinuityRiskSchema = z.object({
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  severity: characterResourceRiskSeveritySchema,
  blockingResourceNames: z.array(z.string().trim().min(1)).default([]),
  suggestedAction: z.enum(["confirm", "repair", "replan", "ignore"]),
});

export const characterResourceExtractionOutputSchema = z.object({
  updates: z.array(characterResourceExtractionUpdateSchema).default([]),
  continuityRisks: z.array(characterResourceContinuityRiskSchema).default([]),
});
