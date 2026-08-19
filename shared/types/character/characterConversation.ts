import { z } from "zod";

export const characterSubjectKindSchema = z.enum([
  "novel_character",
  "base_character",
  "book_analysis_character",
  "drama_character",
]);

export const characterConversationPolicySchema = z.enum([
  "novel_influence",
  "read_only",
  "evidence_interview",
]);

export const characterConversationScopeKindSchema = z.enum([
  "novel",
  "base_library",
  "book_analysis",
  "drama_project",
]);

export const characterConversationStatusSchema = z.enum(["active", "archived"]);

export const characterConversationEvidenceSchema = z.object({
  label: z.string().trim().min(1).max(160),
  detail: z.string().trim().min(1).max(360),
  sourceType: z.string().trim().min(1).max(80),
  sourceRef: z.string().trim().max(160).nullable().optional(),
  chapterOrder: z.number().int().positive().nullable().optional(),
});

export const characterSubjectRefSchema = z.object({
  kind: characterSubjectKindSchema,
  id: z.string().trim().min(1),
  scopeKind: characterConversationScopeKindSchema,
  scopeId: z.string().trim().min(1).nullable().optional(),
});

export const characterSubjectProjectionSchema = z.object({
  subject: characterSubjectRefSchema,
  name: z.string().trim().min(1),
  role: z.string().trim().min(1),
  sourceLabel: z.string().trim().min(1),
  sourceDescription: z.string().trim().min(1),
  interactionPolicy: characterConversationPolicySchema,
  identity: z.string().trim().min(1),
  currentSituation: z.string().trim().min(1),
  hardBoundaries: z.array(z.string().trim().min(1)).max(12),
  subjectiveState: z.string().trim().min(1).nullable().optional(),
  evidence: z.array(characterConversationEvidenceSchema).max(12),
  chapterAnchor: z.number().int().positive().nullable().optional(),
  chapterAnchorLabel: z.string().trim().min(1).nullable().optional(),
});

export const characterConversationTurnSchema = z.object({
  id: z.string(),
  role: z.enum(["author", "character"]),
  content: z.string(),
  evidence: z.array(characterConversationEvidenceSchema).default([]),
  uncertainty: z.string().trim().nullable().optional(),
  createdAt: z.string(),
});

export const characterConversationSessionSchema = z.object({
  id: z.string(),
  subject: characterSubjectRefSchema,
  interactionPolicy: characterConversationPolicySchema,
  chapterAnchor: z.number().int().positive().nullable().optional(),
  status: characterConversationStatusSchema,
  turns: z.array(characterConversationTurnSchema),
  legacyDialogueSessionId: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const characterConversationContextSchema = z.object({
  projection: characterSubjectProjectionSchema,
  activeSession: characterConversationSessionSchema.nullable(),
});

export type CharacterSubjectKind = z.infer<typeof characterSubjectKindSchema>;
export type CharacterConversationPolicy = z.infer<typeof characterConversationPolicySchema>;
export type CharacterConversationScopeKind = z.infer<typeof characterConversationScopeKindSchema>;
export type CharacterConversationEvidence = z.infer<typeof characterConversationEvidenceSchema>;
export type CharacterSubjectRef = z.infer<typeof characterSubjectRefSchema>;
export type CharacterSubjectProjection = z.infer<typeof characterSubjectProjectionSchema>;
export type CharacterConversationTurn = z.infer<typeof characterConversationTurnSchema>;
export type CharacterConversationSession = z.infer<typeof characterConversationSessionSchema>;
export type CharacterConversationContext = z.infer<typeof characterConversationContextSchema>;
