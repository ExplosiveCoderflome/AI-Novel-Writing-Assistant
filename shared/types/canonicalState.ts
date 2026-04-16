import { z } from "zod";

export const canonicalStateRiskLevelSchema = z.enum(["low", "medium", "high"]);
export const stateChangeProposalStatusSchema = z.enum(["validated", "pending_review", "committed", "rejected"]);
export const stateChangeProposalTypeSchema = z.enum([
  "event_record",
  "character_state_update",
  "relation_state_update",
  "information_disclosure",
  "conflict_update",
  "payoff_progression",
  "world_rule_change",
  "book_contract_change",
]);

export const canonicalBookContractStateSchema = z.object({
  title: z.string(),
  genre: z.string().nullable().optional(),
  targetAudience: z.string().nullable().optional(),
  sellingPoint: z.string().nullable().optional(),
  first30ChapterPromise: z.string().nullable().optional(),
  readingPromise: z.string().nullable().optional(),
  protagonistFantasy: z.string().nullable().optional(),
  coreSellingPoint: z.string().nullable().optional(),
  chapter3Payoff: z.string().nullable().optional(),
  chapter10Payoff: z.string().nullable().optional(),
  chapter30Payoff: z.string().nullable().optional(),
  escalationLadder: z.string().nullable().optional(),
  relationshipMainline: z.string().nullable().optional(),
  toneGuardrails: z.array(z.string()).default([]),
  hardConstraints: z.array(z.string()).default([]),
});

export const canonicalWorldStateSchema = z.object({
  worldId: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  rules: z.array(z.string()).default([]),
  forces: z.array(z.string()).default([]),
  locations: z.array(z.string()).default([]),
  tabooRules: z.array(z.string()).default([]),
  currentSituation: z.string().nullable().optional(),
});

export const canonicalCharacterRuntimeStateSchema = z.object({
  characterId: z.string(),
  name: z.string(),
  role: z.string(),
  currentGoal: z.string().nullable().optional(),
  currentState: z.string().nullable().optional(),
  currentPressure: z.string().nullable().optional(),
  currentSecret: z.string().nullable().optional(),
  emotion: z.string().nullable().optional(),
  knownFacts: z.array(z.string()).default([]),
  relationStageLabels: z.array(z.string()).default([]),
  summary: z.string().nullable().optional(),
  lastEventSummary: z.string().nullable().optional(),
});

export const canonicalOpenConflictStateSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  conflictType: z.string(),
  severity: z.string(),
  status: z.string(),
  resolutionHint: z.string().nullable().optional(),
  lastSeenChapterOrder: z.number().int().nullable().optional(),
  createdAt: z.string().nullable().optional(),
  updatedAt: z.string().nullable().optional(),
});

export const canonicalPayoffStateSchema = z.object({
  id: z.string(),
  ledgerKey: z.string(),
  title: z.string(),
  summary: z.string(),
  scopeType: z.string().nullable().optional(),
  currentStatus: z.string(),
  targetStartChapterOrder: z.number().int().nullable().optional(),
  targetEndChapterOrder: z.number().int().nullable().optional(),
  firstSeenChapterOrder: z.number().int().nullable().optional(),
  lastTouchedChapterOrder: z.number().int().nullable().optional(),
  lastTouchedChapterId: z.string().nullable().optional(),
  setupChapterId: z.string().nullable().optional(),
  payoffChapterId: z.string().nullable().optional(),
  statusReason: z.string().nullable().optional(),
  confidence: z.number().nullable().optional(),
  createdAt: z.string().nullable().optional(),
  updatedAt: z.string().nullable().optional(),
});

export const canonicalTimelineEventStateSchema = z.object({
  chapterId: z.string().nullable().optional(),
  chapterOrder: z.number().int().nullable().optional(),
  title: z.string(),
  summary: z.string(),
  participants: z.array(z.string()).default([]),
  consequences: z.array(z.string()).default([]),
});

export const canonicalNarrativeStateSchema = z.object({
  currentVolumeId: z.string().nullable().optional(),
  currentVolumeTitle: z.string().nullable().optional(),
  currentChapterId: z.string().nullable().optional(),
  currentChapterOrder: z.number().int().nullable().optional(),
  currentChapterGoal: z.string().nullable().optional(),
  currentPhase: z.string(),
  openConflicts: z.array(canonicalOpenConflictStateSchema).default([]),
  pendingPayoffs: z.array(canonicalPayoffStateSchema).default([]),
  urgentPayoffs: z.array(canonicalPayoffStateSchema).default([]),
  overduePayoffs: z.array(canonicalPayoffStateSchema).default([]),
  publicKnowledge: z.array(z.string()).default([]),
  hiddenKnowledge: z.array(z.string()).default([]),
  suspenseThreads: z.array(z.string()).default([]),
});

export const canonicalStateSnapshotSchema = z.object({
  novelId: z.string(),
  sourceSnapshotId: z.string().nullable().optional(),
  scopeLabel: z.string(),
  bookContract: canonicalBookContractStateSchema,
  worldState: canonicalWorldStateSchema.nullable(),
  characters: z.array(canonicalCharacterRuntimeStateSchema),
  narrative: canonicalNarrativeStateSchema,
  timeline: z.array(canonicalTimelineEventStateSchema).default([]),
  createdAt: z.string(),
});

export const stateChangeProposalSchema = z.object({
  id: z.string().optional(),
  novelId: z.string(),
  chapterId: z.string().nullable().optional(),
  sourceSnapshotId: z.string().nullable().optional(),
  sourceType: z.string(),
  sourceStage: z.string().nullable().optional(),
  proposalType: stateChangeProposalTypeSchema,
  riskLevel: canonicalStateRiskLevelSchema,
  status: stateChangeProposalStatusSchema.default("validated"),
  summary: z.string(),
  payload: z.record(z.string(), z.unknown()),
  evidence: z.array(z.string()).default([]),
  validationNotes: z.array(z.string()).default([]),
});

export const stateChangeValidationResultSchema = z.object({
  accepted: z.array(stateChangeProposalSchema).default([]),
  pendingReview: z.array(stateChangeProposalSchema).default([]),
  rejected: z.array(stateChangeProposalSchema).default([]),
});

export const stateVersionRecordSchema = z.object({
  id: z.string(),
  novelId: z.string(),
  chapterId: z.string().nullable().optional(),
  sourceType: z.string(),
  sourceStage: z.string().nullable().optional(),
  version: z.number().int().positive(),
  summary: z.string(),
  acceptedProposalIds: z.array(z.string()).default([]),
  snapshotJson: z.string(),
  createdAt: z.string(),
});

export const stateCommitResultSchema = z.object({
  versionRecord: stateVersionRecordSchema.nullable(),
  committed: z.array(stateChangeProposalSchema).default([]),
  pendingReview: z.array(stateChangeProposalSchema).default([]),
  rejected: z.array(stateChangeProposalSchema).default([]),
});

export const generationNextActionSchema = z.enum([
  "replan",
  "refresh_character_state",
  "repair_chapter_mission",
  "advance_payoff",
  "write_chapter",
  "repair_existing_chapter",
  "hold_for_review",
]);

export const stateGoalSchema = z.object({
  summary: z.string(),
  targetConflicts: z.array(z.string()).default([]),
  targetRelationships: z.array(z.string()).default([]),
  targetPayoffs: z.array(z.string()).default([]),
  protectedSecrets: z.array(z.string()).default([]),
});

export const stageOutcomeExpectationSchema = z.object({
  stage: z.string(),
  mustChange: z.array(z.string()).default([]),
  mustNotChange: z.array(z.string()).default([]),
  stateGoal: stateGoalSchema.nullable().optional(),
});

export const chapterStateGoalSchema = stateGoalSchema.extend({
  chapterId: z.string(),
  chapterOrder: z.number().int(),
});

export const novelControlPolicySchema = z.object({
  kickoffMode: z.enum(["manual_start", "director_start", "takeover_start"]),
  advanceMode: z.enum(["manual", "stage_review", "auto_to_ready", "auto_to_execution"]),
  reviewCheckpoints: z.array(z.string()).default([]),
  autoExecutionRange: z.object({
    mode: z.enum(["front10", "volume", "chapter_range"]),
    start: z.number().int().nullable().optional(),
    end: z.number().int().nullable().optional(),
    volumeOrder: z.number().int().nullable().optional(),
  }).nullable().optional(),
});

export type CanonicalStateSnapshot = z.infer<typeof canonicalStateSnapshotSchema>;
export type CanonicalBookContractState = z.infer<typeof canonicalBookContractStateSchema>;
export type CanonicalWorldState = z.infer<typeof canonicalWorldStateSchema>;
export type CanonicalCharacterRuntimeState = z.infer<typeof canonicalCharacterRuntimeStateSchema>;
export type CanonicalOpenConflictState = z.infer<typeof canonicalOpenConflictStateSchema>;
export type CanonicalPayoffState = z.infer<typeof canonicalPayoffStateSchema>;
export type CanonicalTimelineEventState = z.infer<typeof canonicalTimelineEventStateSchema>;
export type CanonicalNarrativeState = z.infer<typeof canonicalNarrativeStateSchema>;
export type StateChangeProposal = z.infer<typeof stateChangeProposalSchema>;
export type StateChangeValidationResult = z.infer<typeof stateChangeValidationResultSchema>;
export type StateVersionRecord = z.infer<typeof stateVersionRecordSchema>;
export type StateCommitResult = z.infer<typeof stateCommitResultSchema>;
export type GenerationNextAction = z.infer<typeof generationNextActionSchema>;
export type StateGoal = z.infer<typeof stateGoalSchema>;
export type StageOutcomeExpectation = z.infer<typeof stageOutcomeExpectationSchema>;
export type ChapterStateGoal = z.infer<typeof chapterStateGoalSchema>;
export type NovelControlPolicy = z.infer<typeof novelControlPolicySchema>;
