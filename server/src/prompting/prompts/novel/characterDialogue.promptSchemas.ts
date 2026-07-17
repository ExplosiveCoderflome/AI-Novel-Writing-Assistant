import { z } from "zod";

const shortText = z.string().trim().min(1).max(260);

export const characterDialogueInfluenceDraftSchema = z.object({
  summary: shortText,
  behaviorGuidance: shortText,
  emotionalGuidance: z.string().trim().max(220).optional().default(""),
  relationTension: z.string().trim().max(220).optional().default(""),
  evidence: z.array(z.string().trim().min(1).max(220)).min(1).max(3),
  confidence: z.number().min(0).max(1),
}).nullable();

export const characterDialogueTurnResponseSchema = z.object({
  characterReply: z.string().trim().min(1).max(1200),
  influenceDraft: characterDialogueInfluenceDraftSchema,
});

export type CharacterDialogueInfluenceDraft = z.infer<typeof characterDialogueInfluenceDraftSchema>;
export type CharacterDialogueTurnResponse = z.infer<typeof characterDialogueTurnResponseSchema>;
