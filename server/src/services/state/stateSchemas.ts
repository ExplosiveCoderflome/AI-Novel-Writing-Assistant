import { z } from "zod";
import type { SnapshotExtractionOutput } from "./stateSnapshotExtraction";

const characterStateOutputSchema = z.object({
  characterId: z.string().trim().optional(),
  characterName: z.string().trim().optional(),
  currentGoal: z.string().trim().optional(),
  emotion: z.string().trim().optional(),
  stressLevel: z.number().optional(),
  secretExposure: z.string().trim().optional(),
  knownFacts: z.array(z.string().trim()).optional(),
  misbeliefs: z.array(z.string().trim()).optional(),
  summary: z.string().trim().optional(),
});

const relationStateOutputSchema = z.object({
  sourceCharacterId: z.string().trim().nullable().optional(),
  sourceCharacterName: z.string().trim().optional(),
  targetCharacterId: z.string().trim().optional(),
  targetCharacterName: z.string().trim().optional(),
  trustScore: z.number().optional(),
  intimacyScore: z.number().optional(),
  conflictScore: z.number().optional(),
  dependencyScore: z.number().optional(),
  summary: z.string().trim().optional(),
});

const informationStateOutputSchema = z.object({
  holderType: z.enum(["reader", "character"]).optional(),
  holderRefId: z.string().trim().nullable().optional(),
  holderRefName: z.string().trim().nullable().optional(),
  fact: z.string().trim().optional(),
  status: z.enum(["known", "misbelief"]).optional(),
  summary: z.string().trim().optional(),
});

const foreshadowStateOutputSchema = z.object({
  title: z.string().trim().optional(),
  summary: z.string().trim().optional(),
  status: z.enum(["setup", "hinted", "pending_payoff", "paid_off", "failed"]).optional(),
  setupChapterId: z.string().trim().optional(),
  payoffChapterId: z.string().trim().optional(),
});

export const snapshotExtractionOutputSchema = z.object({
  summary: z.string().trim().optional(),
  characterStates: z.array(characterStateOutputSchema).optional(),
  relationStates: z.array(relationStateOutputSchema).optional(),
  informationStates: z.array(informationStateOutputSchema).optional(),
  foreshadowStates: z.array(foreshadowStateOutputSchema).optional(),
});

export type SnapshotExtractionOutputSchema = z.infer<typeof snapshotExtractionOutputSchema> & Partial<SnapshotExtractionOutput>;
