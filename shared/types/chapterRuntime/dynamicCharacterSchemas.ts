import { z } from "zod";

const characterCandidateStatusSchema = z.enum(["pending", "confirmed", "merged", "rejected"]);
export const dynamicCharacterRiskLevelSchema = z.enum(["none", "info", "warn", "high"]);

export const runtimeCharacterCandidateSchema = z.object({
  id: z.string(),
  novelId: z.string(),
  sourceChapterId: z.string().nullable().optional(),
  sourceChapterOrder: z.number().int().nullable().optional(),
  proposedName: z.string(),
  proposedRole: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  evidence: z.array(z.string()).default([]),
  matchedCharacterId: z.string().nullable().optional(),
  status: characterCandidateStatusSchema,
  confidence: z.number().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const runtimeCharacterVolumeAssignmentSchema = z.object({
  id: z.string(),
  novelId: z.string(),
  characterId: z.string(),
  volumeId: z.string(),
  volumeTitle: z.string().nullable().optional(),
  roleLabel: z.string().nullable().optional(),
  responsibility: z.string(),
  appearanceExpectation: z.string().nullable().optional(),
  plannedChapterOrders: z.array(z.number().int()),
  isCore: z.boolean(),
  absenceWarningThreshold: z.number().int(),
  absenceHighRiskThreshold: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const runtimeCharacterFactionTrackSchema = z.object({
  id: z.string(),
  novelId: z.string(),
  characterId: z.string(),
  volumeId: z.string().nullable().optional(),
  volumeTitle: z.string().nullable().optional(),
  chapterId: z.string().nullable().optional(),
  chapterOrder: z.number().int().nullable().optional(),
  factionLabel: z.string(),
  stanceLabel: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  sourceType: z.string(),
  confidence: z.number().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const runtimeCharacterRelationStageSchema = z.object({
  id: z.string(),
  novelId: z.string(),
  relationId: z.string().nullable().optional(),
  sourceCharacterId: z.string(),
  targetCharacterId: z.string(),
  sourceCharacterName: z.string().nullable().optional(),
  targetCharacterName: z.string().nullable().optional(),
  volumeId: z.string().nullable().optional(),
  volumeTitle: z.string().nullable().optional(),
  chapterId: z.string().nullable().optional(),
  chapterOrder: z.number().int().nullable().optional(),
  stageLabel: z.string(),
  stageSummary: z.string(),
  nextTurnPoint: z.string().nullable().optional(),
  sourceType: z.string(),
  confidence: z.number().nullable().optional(),
  isCurrent: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const runtimeDynamicCharacterOverviewItemSchema = z.object({
  characterId: z.string(),
  name: z.string(),
  role: z.string(),
  castRole: z.string().nullable().optional(),
  currentState: z.string().nullable().optional(),
  currentGoal: z.string().nullable().optional(),
  volumeRoleLabel: z.string().nullable().optional(),
  volumeResponsibility: z.string().nullable().optional(),
  isCoreInVolume: z.boolean(),
  plannedChapterOrders: z.array(z.number().int()),
  appearanceCount: z.number().int(),
  lastAppearanceChapterOrder: z.number().int().nullable().optional(),
  absenceSpan: z.number().int(),
  absenceRisk: dynamicCharacterRiskLevelSchema,
  factionLabel: z.string().nullable().optional(),
  stanceLabel: z.string().nullable().optional(),
});

export const runtimeDynamicCharacterCurrentVolumeSchema = z.object({
  id: z.string().nullable().optional(),
  title: z.string(),
  sortOrder: z.number().int().nullable().optional(),
  startChapterOrder: z.number().int().nullable().optional(),
  endChapterOrder: z.number().int().nullable().optional(),
  currentChapterOrder: z.number().int().nullable().optional(),
});

export const runtimeDynamicCharacterOverviewSchema = z.object({
  novelId: z.string(),
  currentVolume: runtimeDynamicCharacterCurrentVolumeSchema.nullable(),
  summary: z.string(),
  pendingCandidateCount: z.number().int(),
  characters: z.array(runtimeDynamicCharacterOverviewItemSchema),
  relations: z.array(runtimeCharacterRelationStageSchema),
  candidates: z.array(runtimeCharacterCandidateSchema),
  factionTracks: z.array(runtimeCharacterFactionTrackSchema),
  assignments: z.array(runtimeCharacterVolumeAssignmentSchema),
});

export type RuntimeCharacterCandidate = z.infer<typeof runtimeCharacterCandidateSchema>;
export type RuntimeCharacterVolumeAssignment = z.infer<typeof runtimeCharacterVolumeAssignmentSchema>;
export type RuntimeCharacterFactionTrack = z.infer<typeof runtimeCharacterFactionTrackSchema>;
export type RuntimeCharacterRelationStage = z.infer<typeof runtimeCharacterRelationStageSchema>;
export type RuntimeDynamicCharacterOverviewItem = z.infer<typeof runtimeDynamicCharacterOverviewItemSchema>;
export type RuntimeDynamicCharacterCurrentVolume = z.infer<typeof runtimeDynamicCharacterCurrentVolumeSchema>;
export type RuntimeDynamicCharacterOverview = z.infer<typeof runtimeDynamicCharacterOverviewSchema>;
