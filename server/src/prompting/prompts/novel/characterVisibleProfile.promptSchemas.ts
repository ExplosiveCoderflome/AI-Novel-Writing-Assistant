import { z } from "zod";

export const characterVisibleProfileOutputSchema = z.object({
  appearance: z.string().trim().min(4).max(120),
  physique: z.string().trim().min(4).max(120),
  attireStyle: z.string().trim().min(4).max(120),
  signatureDetail: z.string().trim().min(4).max(120),
  voiceTexture: z.string().trim().min(4).max(120),
  presenceImpression: z.string().trim().min(4).max(120),
  confidence: z.number().min(0).max(1),
  warnings: z.array(z.string().trim().min(1).max(160)).max(8).default([]),
});

export type CharacterVisibleProfileOutput = z.infer<typeof characterVisibleProfileOutputSchema>;
