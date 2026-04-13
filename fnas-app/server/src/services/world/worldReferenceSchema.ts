import { z } from "zod";

export const worldReferenceConceptCardSchema = z
  .object({
    worldType: z.string().trim().min(1),
    templateKey: z.string().trim().min(1),
    coreImagery: z.array(z.string().trim()).optional().default([]),
    tone: z.string().trim().optional(),
    keywords: z.array(z.string().trim()).optional().default([]),
    summary: z.string().trim().optional(),
  })
  .passthrough();

export const worldReferenceAnchorSchema = z
  .object({
    id: z.string().trim().optional(),
    label: z.string().trim().min(1),
    content: z.string().trim().min(1),
  })
  .passthrough();

export const worldReferenceSeedBundleSchema = z.record(z.string(), z.unknown()).optional();

export const worldReferenceInspirationPayloadSchema = z.object({
  conceptCard: worldReferenceConceptCardSchema,
  anchors: z.array(worldReferenceAnchorSchema).optional().default([]),
  // LLM 输出里可能是 seedPackage 或 referenceSeeds，后续代码会做归一化处理。
  seedPackage: worldReferenceSeedBundleSchema.optional(),
  referenceSeeds: worldReferenceSeedBundleSchema.optional(),
}).passthrough();

