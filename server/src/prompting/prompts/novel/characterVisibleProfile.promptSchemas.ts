import { z } from "zod";

export const characterVisibleProfileOutputSchema = z.object({
  appearance: z.string().trim().min(4).max(240),
  physique: z.string().trim().min(4).max(240),
  attireStyle: z.string().trim().min(4).max(240),
  signatureDetail: z.string().trim().min(4).max(240),
  voiceTexture: z.string().trim().min(4).max(240),
  presenceImpression: z.string().trim().min(4).max(240),
  confidence: z.number().min(0).max(1),
  warnings: z.array(z.string().trim().min(1).max(160)).max(8).default([]),
});

export type CharacterVisibleProfileOutput = z.infer<typeof characterVisibleProfileOutputSchema>;
