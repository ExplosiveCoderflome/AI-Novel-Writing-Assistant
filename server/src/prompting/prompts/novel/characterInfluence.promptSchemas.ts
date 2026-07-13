import { z } from "zod";

const shortText = z.string().trim().min(1).max(220);
const optionalText = z.string().trim().max(220).optional().default("");

export const characterInfluenceOptionSchema = z.object({
  title: z.string().trim().min(1).max(80),
  directionSummary: shortText,
  recommendationReason: shortText,
  isRecommended: z.boolean(),
  behaviorGuidance: shortText,
  emotionalGuidance: optionalText,
  relationTension: optionalText,
  readerPayoff: shortText,
  risk: shortText,
  observableSignals: z.array(z.string().trim().min(1).max(160)).min(1).max(3),
  evidence: z.array(z.string().trim().min(1).max(220)).min(1).max(3),
  confidence: z.number().min(0).max(1),
});

export const characterInfluenceOptionsResponseSchema = z.object({
  proposals: z.array(characterInfluenceOptionSchema).min(1).max(3),
});

export type CharacterInfluenceOption = z.infer<typeof characterInfluenceOptionSchema>;
export type CharacterInfluenceOptionsResponse = z.infer<typeof characterInfluenceOptionsResponseSchema>;
