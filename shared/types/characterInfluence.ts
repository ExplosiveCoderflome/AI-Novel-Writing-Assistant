import { z } from "zod";

export const characterInfluenceProposalStatusSchema = z.enum([
  "draft",
  "accepted",
  "applied",
  "expired",
  "superseded",
  "dismissed",
]);

export const characterInfluenceProposalSchema = z.object({
  id: z.string(),
  novelId: z.string(),
  characterId: z.string(),
  proposalSetId: z.string(),
  sourceMindSnapshotId: z.string().nullable().optional(),
  title: z.string(),
  directionSummary: z.string(),
  recommendationReason: z.string(),
  isRecommended: z.boolean(),
  behaviorGuidance: z.string(),
  emotionalGuidance: z.string().nullable().optional(),
  relationTension: z.string().nullable().optional(),
  readerPayoff: z.string(),
  risk: z.string(),
  observableSignals: z.array(z.string()),
  evidence: z.array(z.string()),
  confidence: z.number().nullable().optional(),
  authorIntent: z.string().nullable().optional(),
  targetStartChapterOrder: z.number().int(),
  targetEndChapterOrder: z.number().int(),
  status: characterInfluenceProposalStatusSchema,
  acceptedAt: z.string().nullable().optional(),
  appliedAt: z.string().nullable().optional(),
  resolvedChapterId: z.string().nullable().optional(),
  resolutionEvidence: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const characterInfluenceResolutionSchema = z.object({
  proposalId: z.string().trim().min(1),
  status: z.enum(["applied", "defer"]),
  evidence: z.array(z.string().trim().min(1).max(220)).max(3).default([]),
  confidence: z.number().min(0).max(1),
});

export type CharacterInfluenceProposalStatus = z.infer<typeof characterInfluenceProposalStatusSchema>;
export type CharacterInfluenceProposal = z.infer<typeof characterInfluenceProposalSchema>;
export type CharacterInfluenceResolution = z.infer<typeof characterInfluenceResolutionSchema>;
