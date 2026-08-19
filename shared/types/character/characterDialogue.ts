import { z } from "zod";

export const characterDialogueSessionStatusSchema = z.enum(["active", "archived"]);
export const characterDialogueInfluenceStatusSchema = z.enum([
  "draft",
  "active",
  "applied",
  "expired",
  "dismissed",
  "superseded",
]);

export const characterDialogueTurnSchema = z.object({
  id: z.string(),
  role: z.enum(["author", "character"]),
  content: z.string(),
  createdAt: z.string(),
});

export const characterDialogueInfluenceSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  novelId: z.string(),
  characterId: z.string(),
  sourceMindSnapshotId: z.string().nullable().optional(),
  summary: z.string(),
  behaviorGuidance: z.string(),
  emotionalGuidance: z.string().nullable().optional(),
  relationTension: z.string().nullable().optional(),
  evidence: z.array(z.string()),
  confidence: z.number().nullable().optional(),
  targetStartChapterOrder: z.number().int(),
  targetEndChapterOrder: z.number().int(),
  status: characterDialogueInfluenceStatusSchema,
  activatedAt: z.string().nullable().optional(),
  appliedAt: z.string().nullable().optional(),
  resolvedChapterId: z.string().nullable().optional(),
  resolutionEvidence: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const characterDialogueSessionSchema = z.object({
  id: z.string(),
  novelId: z.string(),
  characterId: z.string(),
  sourceMindSnapshotId: z.string().nullable().optional(),
  status: characterDialogueSessionStatusSchema,
  turns: z.array(characterDialogueTurnSchema),
  latestInfluence: characterDialogueInfluenceSchema.nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const characterDialogueTurnResultSchema = z.object({
  session: characterDialogueSessionSchema,
  characterTurn: characterDialogueTurnSchema,
  influence: characterDialogueInfluenceSchema.nullable().optional(),
});

export const characterDialogueInfluenceResolutionSchema = z.object({
  influenceId: z.string().trim().min(1),
  status: z.enum(["applied", "defer"]),
  evidence: z.array(z.string().trim().min(1).max(220)).max(3).default([]),
  confidence: z.number().min(0).max(1),
});

export type CharacterDialogueSessionStatus = z.infer<typeof characterDialogueSessionStatusSchema>;
export type CharacterDialogueInfluenceStatus = z.infer<typeof characterDialogueInfluenceStatusSchema>;
export type CharacterDialogueTurn = z.infer<typeof characterDialogueTurnSchema>;
export type CharacterDialogueInfluence = z.infer<typeof characterDialogueInfluenceSchema>;
export type CharacterDialogueSession = z.infer<typeof characterDialogueSessionSchema>;
export type CharacterDialogueTurnResult = z.infer<typeof characterDialogueTurnResultSchema>;
export type CharacterDialogueInfluenceResolution = z.infer<typeof characterDialogueInfluenceResolutionSchema>;
