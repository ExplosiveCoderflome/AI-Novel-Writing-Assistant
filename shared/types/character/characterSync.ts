import { z } from "zod";

export const characterSyncPolicySchema = z.enum([
  "manual_review",
  "pull_library_safe_fields",
  "locked_instance",
  "forked",
]);

export const characterLibraryLinkStatusSchema = z.enum([
  "linked",
  "forked",
  "detached",
]);

export const characterSyncDirectionSchema = z.enum([
  "novel_to_library",
  "library_to_novel",
]);

export const characterSyncProposalStatusSchema = z.enum([
  "pending_review",
  "applied",
  "ignored",
  "rejected",
]);

export const characterSyncFieldLayerSchema = z.enum([
  "identity",
  "persona",
  "story_adaptation",
  "runtime_state",
  "growth_deposit",
]);

export const baseCharacterDraftSchema = z.object({
  name: z.string().trim().min(1),
  role: z.string().trim().min(1),
  personality: z.string().trim().min(1),
  background: z.string().trim().min(1),
  development: z.string().trim().min(1),
  appearance: z.string().trim().nullable().optional(),
  weaknesses: z.string().trim().nullable().optional(),
  interests: z.string().trim().nullable().optional(),
  keyEvents: z.string().trim().nullable().optional(),
  tags: z.string().trim().default(""),
  category: z.string().trim().min(1),
});

export const characterSyncFieldUpdateSchema = z.object({
  field: z.string().trim().min(1),
  layer: characterSyncFieldLayerSchema,
  summary: z.string().trim().min(1),
  reason: z.string().trim().min(1),
  fromValue: z.string().trim().nullable().optional(),
  toValue: z.string().trim().nullable().optional(),
});

export const characterSyncProposalPayloadSchema = z.object({
  baseCharacterDraft: baseCharacterDraftSchema.nullable().optional(),
  baseSnapshot: baseCharacterDraftSchema.nullable().optional(),
  applyableFields: z.array(z.string().trim().min(1)).default([]),
  warnings: z.array(z.string().trim().min(1)).default([]),
  scopeNote: z.string().trim().nullable().optional(),
}).passthrough();

export const characterSyncProposalAiOutputSchema = z.object({
  confidence: z.number().min(0).max(1),
  summary: z.string().trim().min(1),
  safeUpdates: z.array(characterSyncFieldUpdateSchema).default([]),
  novelOnlyUpdates: z.array(characterSyncFieldUpdateSchema).default([]),
  riskyUpdates: z.array(characterSyncFieldUpdateSchema).default([]),
  baseCharacterDraft: baseCharacterDraftSchema.nullable().optional(),
  recommendedAction: z.enum([
    "create_library_character",
    "update_library_after_review",
    "keep_novel_only",
    "review_before_apply",
  ]),
  scopeNote: z.string().trim().min(1),
});

export const baseCharacterRevisionSchema = z.object({
  id: z.string(),
  baseCharacterId: z.string(),
  version: z.number().int().min(1),
  snapshot: baseCharacterDraftSchema,
  changeSummary: z.string().nullable().optional(),
  sourceType: z.string(),
  sourceRefId: z.string().nullable().optional(),
  createdAt: z.string(),
});

export const characterLibraryLinkSchema = z.object({
  id: z.string(),
  novelId: z.string(),
  characterId: z.string(),
  baseCharacterId: z.string(),
  baseRevisionId: z.string().nullable().optional(),
  syncPolicy: characterSyncPolicySchema,
  linkStatus: characterLibraryLinkStatusSchema,
  localOverrides: z.record(z.string(), z.unknown()).default({}),
  lastSyncedAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const characterSyncProposalSchema = z.object({
  id: z.string(),
  novelId: z.string().nullable().optional(),
  characterId: z.string().nullable().optional(),
  baseCharacterId: z.string().nullable().optional(),
  baseRevisionId: z.string().nullable().optional(),
  direction: characterSyncDirectionSchema,
  status: characterSyncProposalStatusSchema,
  confidence: z.number().nullable().optional(),
  summary: z.string(),
  payload: characterSyncProposalPayloadSchema,
  safeUpdates: z.array(characterSyncFieldUpdateSchema).default([]),
  novelOnlyUpdates: z.array(characterSyncFieldUpdateSchema).default([]),
  riskyUpdates: z.array(characterSyncFieldUpdateSchema).default([]),
  recommendedAction: z.string().nullable().optional(),
  sourceType: z.string(),
  sourceRefId: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const novelCharacterSaveToLibraryInputSchema = z.object({
  proposalId: z.string().trim().min(1).optional(),
  baseCharacter: baseCharacterDraftSchema.optional(),
  syncPolicy: characterSyncPolicySchema.default("manual_review"),
  linkStatus: characterLibraryLinkStatusSchema.default("linked"),
});

export const baseCharacterImportModeSchema = z.enum([
  "prototype",
  "linked",
  "detached_copy",
]);

export const importBaseCharacterToNovelInputSchema = z.object({
  baseCharacterId: z.string().trim().min(1),
  mode: baseCharacterImportModeSchema.default("prototype"),
  overrides: z.object({
    name: z.string().trim().min(1).optional(),
    role: z.string().trim().min(1).optional(),
    storyFunction: z.string().trim().optional(),
    relationToProtagonist: z.string().trim().optional(),
    currentState: z.string().trim().optional(),
    currentGoal: z.string().trim().optional(),
  }).default({}),
});

export type CharacterSyncPolicy = z.infer<typeof characterSyncPolicySchema>;
export type CharacterLibraryLinkStatus = z.infer<typeof characterLibraryLinkStatusSchema>;
export type CharacterSyncDirection = z.infer<typeof characterSyncDirectionSchema>;
export type CharacterSyncProposalStatus = z.infer<typeof characterSyncProposalStatusSchema>;
export type BaseCharacterDraft = z.infer<typeof baseCharacterDraftSchema>;
export type CharacterSyncFieldUpdate = z.infer<typeof characterSyncFieldUpdateSchema>;
export type CharacterSyncProposalPayload = z.infer<typeof characterSyncProposalPayloadSchema>;
export type CharacterSyncProposalAiOutput = z.infer<typeof characterSyncProposalAiOutputSchema>;
export type BaseCharacterRevision = z.infer<typeof baseCharacterRevisionSchema>;
export type CharacterLibraryLink = z.infer<typeof characterLibraryLinkSchema>;
export type CharacterSyncProposal = z.infer<typeof characterSyncProposalSchema>;
export type NovelCharacterSaveToLibraryInput = z.infer<typeof novelCharacterSaveToLibraryInputSchema>;
export type BaseCharacterImportMode = z.infer<typeof baseCharacterImportModeSchema>;
export type ImportBaseCharacterToNovelInput = z.infer<typeof importBaseCharacterToNovelInputSchema>;
