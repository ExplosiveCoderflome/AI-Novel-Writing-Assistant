import { z } from "zod";

export const characterResourceOwnerTypeSchema = z.enum(["character", "organization", "location", "world", "unknown"]);
export const characterResourceTypeSchema = z.enum([
  "physical_item",
  "clue",
  "credential",
  "ability_resource",
  "relationship_token",
  "consumable",
  "hidden_card",
  "world_resource",
]);
export const characterResourceStatusSchema = z.enum([
  "available",
  "hidden",
  "borrowed",
  "transferred",
  "lost",
  "consumed",
  "damaged",
  "destroyed",
  "stale",
]);
export const characterResourceNarrativeFunctionSchema = z.enum([
  "tool",
  "clue",
  "weapon",
  "proof",
  "key",
  "cost",
  "promise",
  "hidden_card",
  "constraint",
]);
export const characterResourceEventTypeSchema = z.enum([
  "introduced",
  "acquired",
  "revealed",
  "used",
  "transferred",
  "lost",
  "consumed",
  "damaged",
  "destroyed",
  "recovered",
  "stale_marked",
]);
export const characterResourceRiskLevelSchema = z.enum(["none", "info", "warn", "high"]);
export const characterResourceRiskSeveritySchema = z.enum(["low", "medium", "high", "critical"]);

export const characterResourceRiskSignalSchema = z.object({
  code: z.string(),
  severity: characterResourceRiskSeveritySchema,
  summary: z.string(),
  stale: z.boolean().optional(),
});

export const characterResourceSourceRefSchema = z.object({
  kind: z.enum(["chapter_content", "chapter_plan", "state_snapshot", "audit_issue", "payoff_ledger", "manual"]),
  refId: z.string().nullable().optional(),
  refLabel: z.string(),
  chapterId: z.string().nullable().optional(),
  chapterOrder: z.number().int().nullable().optional(),
});

export const characterResourceEvidenceSchema = z.object({
  summary: z.string(),
  chapterId: z.string().nullable().optional(),
  chapterOrder: z.number().int().nullable().optional(),
});

export const characterResourceLedgerItemSchema = z.object({
  id: z.string(),
  novelId: z.string(),
  resourceKey: z.string(),
  name: z.string(),
  summary: z.string(),
  resourceType: characterResourceTypeSchema,
  narrativeFunction: characterResourceNarrativeFunctionSchema,
  ownerType: characterResourceOwnerTypeSchema,
  ownerId: z.string().nullable().optional(),
  ownerName: z.string().nullable().optional(),
  ownerCharacterId: z.string().nullable().optional(),
  holderCharacterId: z.string().nullable().optional(),
  holderCharacterName: z.string().nullable().optional(),
  status: characterResourceStatusSchema,
  readerKnows: z.boolean(),
  holderKnows: z.boolean(),
  knownByCharacterIds: z.array(z.string()).default([]),
  introducedChapterId: z.string().nullable().optional(),
  introducedChapterOrder: z.number().int().nullable().optional(),
  lastTouchedChapterId: z.string().nullable().optional(),
  lastTouchedChapterOrder: z.number().int().nullable().optional(),
  expectedUseStartChapterOrder: z.number().int().nullable().optional(),
  expectedUseEndChapterOrder: z.number().int().nullable().optional(),
  constraints: z.array(z.string()).default([]),
  riskSignals: z.array(characterResourceRiskSignalSchema).default([]),
  sourceRefs: z.array(characterResourceSourceRefSchema).default([]),
  evidence: z.array(characterResourceEvidenceSchema).default([]),
  confidence: z.number().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const characterResourceEventSchema = z.object({
  id: z.string(),
  novelId: z.string(),
  resourceId: z.string(),
  chapterId: z.string().nullable().optional(),
  chapterOrder: z.number().int().nullable().optional(),
  eventType: characterResourceEventTypeSchema,
  actorCharacterId: z.string().nullable().optional(),
  fromHolderCharacterId: z.string().nullable().optional(),
  toHolderCharacterId: z.string().nullable().optional(),
  summary: z.string(),
  evidence: z.array(z.string()).default([]),
  createdAt: z.string(),
});

export const canonicalCharacterResourceSummarySchema = z.object({
  resourceId: z.string(),
  name: z.string(),
  status: characterResourceStatusSchema,
  narrativeFunction: characterResourceNarrativeFunctionSchema,
  summary: z.string(),
  constraints: z.array(z.string()).default([]),
  riskLevel: characterResourceRiskLevelSchema,
});

export const characterResourceContextSchema = z.object({
  summary: z.string(),
  availableItems: z.array(characterResourceLedgerItemSchema).default([]),
  setupNeededItems: z.array(characterResourceLedgerItemSchema).default([]),
  blockedItems: z.array(characterResourceLedgerItemSchema).default([]),
  pendingReviewItems: z.array(characterResourceLedgerItemSchema).default([]),
  riskSignals: z.array(characterResourceRiskSignalSchema).default([]),
});

export const characterResourceProposalSummarySchema = z.object({
  id: z.string(),
  novelId: z.string(),
  chapterId: z.string().nullable().optional(),
  sourceType: z.string().optional(),
  sourceStage: z.string().nullable().optional(),
  proposalType: z.literal("character_resource_update"),
  riskLevel: z.enum(["low", "medium", "high"]),
  status: z.enum(["validated", "committed", "pending_review", "rejected"]),
  summary: z.string(),
  payload: z.record(z.string(), z.unknown()).default({}),
  evidence: z.array(z.string()).default([]),
  validationNotes: z.array(z.string()).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const characterResourceLedgerResponseSchema = z.object({
  items: z.array(characterResourceLedgerItemSchema).default([]),
  pendingProposals: z.array(characterResourceProposalSummarySchema).default([]),
});

export const characterResourceUpdatePayloadSchema = z.object({
  resourceKey: z.string().optional(),
  resourceId: z.string().optional(),
  resourceName: z.string(),
  chapterOrder: z.number().int().nullable().optional(),
  resourceType: characterResourceTypeSchema.default("physical_item"),
  narrativeFunction: characterResourceNarrativeFunctionSchema.default("tool"),
  updateType: characterResourceEventTypeSchema,
  ownerType: characterResourceOwnerTypeSchema.default("unknown"),
  ownerId: z.string().nullable().optional(),
  ownerName: z.string().nullable().optional(),
  holderCharacterId: z.string().nullable().optional(),
  holderCharacterName: z.string().nullable().optional(),
  previousHolderCharacterId: z.string().nullable().optional(),
  statusAfter: characterResourceStatusSchema,
  visibilityAfter: z.object({
    readerKnows: z.boolean(),
    holderKnows: z.boolean(),
    knownByCharacterIds: z.array(z.string()).default([]),
  }),
  summary: z.string().optional(),
  narrativeImpact: z.string(),
  expectedFutureUse: z.string().nullable().optional(),
  expectedUseStartChapterOrder: z.number().int().nullable().optional(),
  expectedUseEndChapterOrder: z.number().int().nullable().optional(),
  constraints: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).nullable().optional(),
});

export type CharacterResourceOwnerType = z.infer<typeof characterResourceOwnerTypeSchema>;
export type CharacterResourceType = z.infer<typeof characterResourceTypeSchema>;
export type CharacterResourceStatus = z.infer<typeof characterResourceStatusSchema>;
export type CharacterResourceNarrativeFunction = z.infer<typeof characterResourceNarrativeFunctionSchema>;
export type CharacterResourceEventType = z.infer<typeof characterResourceEventTypeSchema>;
export type CharacterResourceRiskLevel = z.infer<typeof characterResourceRiskLevelSchema>;
export type CharacterResourceRiskSeverity = z.infer<typeof characterResourceRiskSeveritySchema>;
export type CharacterResourceRiskSignal = z.infer<typeof characterResourceRiskSignalSchema>;
export type CharacterResourceSourceRef = z.infer<typeof characterResourceSourceRefSchema>;
export type CharacterResourceEvidence = z.infer<typeof characterResourceEvidenceSchema>;
export type CharacterResourceLedgerItem = z.infer<typeof characterResourceLedgerItemSchema>;
export type CharacterResourceEvent = z.infer<typeof characterResourceEventSchema>;
export type CanonicalCharacterResourceSummary = z.infer<typeof canonicalCharacterResourceSummarySchema>;
export type CharacterResourceContext = z.infer<typeof characterResourceContextSchema>;
export type CharacterResourceProposalSummary = z.infer<typeof characterResourceProposalSummarySchema>;
export type CharacterResourceLedgerResponse = z.infer<typeof characterResourceLedgerResponseSchema>;
export type CharacterResourceUpdatePayload = z.infer<typeof characterResourceUpdatePayloadSchema>;
