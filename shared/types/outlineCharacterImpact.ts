import { z } from "zod";
import type { AgentConversationTurn } from "./agentConversation/turn";
import type { OutlineDocument } from "./outline";

export const impactRoles = ["character", "plot", "payoff"] as const;
export const impactRoleLabels = {character: "人物", plot: "卷章", payoff: "伏笔"} as const;
export type ImpactRole = typeof impactRoles[number];
const text = z.string().trim().min(1);
export const impactRequestSchema = z.object({
  characterId: text, baseVersion: z.number().int().positive(), requestText: text.max(6000),
}).strict();
export type ImpactRequest = z.infer<typeof impactRequestSchema>;
export const impactGenerateSchema = impactRequestSchema.extend({priorProposalId: text.optional()});

export const impactTurnSchema = impactGenerateSchema.extend({ requestId: text.max(128) });
export interface ImpactResultRef {
  id: string;
  status: string;
  baseVersion: number;
  source: "workbench" | "external";
}
export type ImpactConversationTurn = AgentConversationTurn<ImpactResultRef>;

export const impactReviewSchema = z.object({
  changes: z.array(z.object({
    nodeId: text, field: text, value: z.string().max(12000), reason: text,
    dependsOnNodeIds: z.array(text), risks: z.array(text),
  }).strict()),
  retained: z.array(z.object({nodeId: text, reason: text}).strict()),
}).strict();
// The model sometimes labels its own reply with a word outside the enum
// (for example "analysis"). The changes it actually proposed are the ground
// truth: a turn that proposes changes is a proposal, otherwise it is an
// explanation. Normalizing here keeps a slipped label from failing the whole
// turn after the structured-output repair has already spent its attempt.
const normalizeDialogueResponseKind = (value: unknown) => {
  if (value && typeof value === "object") {
    const raw = value as Record<string, unknown>;
    if (raw.responseKind !== "explanation" && raw.responseKind !== "proposal") {
      const changes = Array.isArray(raw.changes) ? raw.changes : [];
      return {...raw, responseKind: changes.length > 0 ? "proposal" : "explanation"};
    }
  }
  return value;
};
export const impactDialogueReviewSchema = z.preprocess(normalizeDialogueResponseKind,
  impactReviewSchema.extend({
    replyText: text.max(2400), responseKind: z.enum(["explanation", "proposal"]),
  }));
export type ImpactReview = z.infer<typeof impactReviewSchema>;
export const impactReviewsSchema = z.object({
  character: impactReviewSchema, plot: impactReviewSchema, payoff: impactReviewSchema,
}).strict();
export const impactSubmissionSchema = impactRequestSchema.extend({reviews: impactReviewsSchema});
export type ImpactSubmission = z.infer<typeof impactSubmissionSchema>;
export type ImpactSnapshot = {
  projectId: string; baseVersion: number; characterId: string; document: OutlineDocument;
  writtenChapterIds: string[];
  recentCharacterChanges: {field: string; before: string; after: string}[];
};
export interface ImpactSummary {
  characterId: string;
  origin: "workbench" | "external";
  retained: {nodeId: string; reason: string; role: ImpactRole}[];
  writtenChapterIds: string[];
  appliedOperationIds?: string[];
}
