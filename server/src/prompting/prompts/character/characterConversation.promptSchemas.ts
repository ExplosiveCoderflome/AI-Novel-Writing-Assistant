import { z } from "zod";

const shortText = z.string().trim().min(1).max(260);

export const characterConversationEvidenceOutputSchema = z.object({
  label: z.string().trim().min(1).max(160),
  detail: z.string().trim().min(1).max(360),
  sourceType: z.string().trim().min(1).max(80),
  sourceRef: z.string().trim().max(160).nullable().optional(),
  chapterOrder: z.number().int().positive().nullable().optional(),
});

export const characterConversationInfluenceDraftSchema = z.object({
  summary: shortText,
  behaviorGuidance: shortText,
  emotionalGuidance: z.string().trim().max(220).optional().default(""),
  relationTension: z.string().trim().max(220).optional().default(""),
  evidence: z.array(z.string().trim().min(1).max(220)).min(1).max(3),
  confidence: z.number().min(0).max(1),
}).nullable();

export const characterConversationTurnResponseSchema = z.object({
  characterReply: z.string().trim().min(1).max(1200),
  evidence: z.array(characterConversationEvidenceOutputSchema).max(3).default([]),
  uncertainty: z.string().trim().max(260).nullable().default(null),
  influenceDraft: characterConversationInfluenceDraftSchema,
});

export type CharacterConversationInfluenceDraft = z.infer<typeof characterConversationInfluenceDraftSchema>;
export type CharacterConversationTurnResponse = z.infer<typeof characterConversationTurnResponseSchema>;
