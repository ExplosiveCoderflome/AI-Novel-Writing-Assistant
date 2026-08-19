import { z } from "zod";

export const directorStateProposalResolutionDecisionSchema = z.enum([
  "apply",
  "defer",
  "auto_replan_window",
  "manual_required",
]);

export const directorStateProposalResolutionSchema = z.object({
  decision: directorStateProposalResolutionDecisionSchema,
  confidence: z.number().min(0).max(1),
  riskLevel: z.enum(["low", "medium", "high"]),
  reason: z.string().min(1),
  affectedChapterWindow: z.object({
    startOrder: z.number().int().nullable().optional(),
    endOrder: z.number().int().nullable().optional(),
    chapterOrders: z.array(z.number().int()).default([]),
  }).default({ chapterOrders: [] }),
  proposalIds: z.array(z.string()).default([]),
  blockingLedgerKeys: z.array(z.string()).default([]),
});

export type DirectorStateProposalResolutionDecision = z.infer<typeof directorStateProposalResolutionDecisionSchema>;
export type DirectorStateProposalResolution = z.infer<typeof directorStateProposalResolutionSchema>;

