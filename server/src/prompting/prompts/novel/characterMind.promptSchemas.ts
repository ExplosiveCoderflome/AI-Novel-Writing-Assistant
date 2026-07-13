import { z } from "zod";

const shortText = z.string().trim().min(1).max(360);
const optionalText = z.string().trim().max(260).optional().default("");

export const characterMindSnapshotItemSchema = z.object({
  characterName: shortText,
  currentInterpretation: shortText,
  privateIntent: optionalText,
  activePlan: optionalText,
  emotionalStance: optionalText,
  actionTendency: optionalText,
  decisionTrigger: optionalText,
  beliefs: z.array(z.string().trim().min(1).max(160)).max(4).default([]),
  misbeliefs: z.array(z.string().trim().min(1).max(160)).max(4).default([]),
  evidence: z.array(z.string().trim().min(1).max(220)).min(1).max(4),
  confidence: z.number().min(0).max(1),
});

export const characterMindSnapshotResponseSchema = z.object({
  snapshots: z.array(characterMindSnapshotItemSchema).min(1).max(6),
});

export const characterMindDeltaSchema = characterMindSnapshotItemSchema.extend({
  evidence: z.array(z.string().trim().min(1).max(220)).min(1).max(3),
}).partial({
  privateIntent: true,
  activePlan: true,
  emotionalStance: true,
  actionTendency: true,
  decisionTrigger: true,
  beliefs: true,
  misbeliefs: true,
}).extend({
  characterName: shortText,
  currentInterpretation: shortText,
  confidence: z.number().min(0).max(1),
});

export type CharacterMindSnapshotItem = z.infer<typeof characterMindSnapshotItemSchema>;
export type CharacterMindSnapshotResponse = z.infer<typeof characterMindSnapshotResponseSchema>;
export type CharacterMindDelta = z.infer<typeof characterMindDeltaSchema>;
