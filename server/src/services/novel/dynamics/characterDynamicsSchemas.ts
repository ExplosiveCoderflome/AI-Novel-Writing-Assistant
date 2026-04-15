import { z } from "zod";

function normalizeOptionalConfidence(value: unknown): unknown {
  if (value == null || typeof value === "number") {
    return value;
  }
  if (typeof value !== "string") {
    return value;
  }
  const normalized = value.trim();
  if (!normalized) {
    return undefined;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : value;
}

function normalizeThresholdValue(value: unknown): unknown {
  if (value == null) {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) {
      return undefined;
    }
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed)) {
      return value;
    }
    return Math.min(parsed, 12);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.min(value, 12);
  }
  return value;
}

const normalizedConfidenceSchema = z.preprocess(
  normalizeOptionalConfidence,
  z.number().min(0).max(1).optional().nullable(),
);

const normalizedVolumeThresholdSchema = z.preprocess(
  normalizeThresholdValue,
  z.number().int().min(1).max(12).optional().nullable(),
);

const volumeProjectionAssignmentSchema = z.object({
  characterName: z.string().trim().min(1),
  volumeSortOrder: z.number().int().min(1),
  roleLabel: z.string().trim().optional().nullable(),
  responsibility: z.string().trim().min(1),
  appearanceExpectation: z.string().trim().optional().nullable(),
  plannedChapterOrders: z.array(z.number().int().min(1)).default([]),
  isCore: z.boolean().default(false),
  absenceWarningThreshold: normalizedVolumeThresholdSchema,
  absenceHighRiskThreshold: normalizedVolumeThresholdSchema,
}).superRefine((value, ctx) => {
  if (
    value.absenceWarningThreshold != null
    && value.absenceHighRiskThreshold != null
    && value.absenceHighRiskThreshold < value.absenceWarningThreshold
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["absenceHighRiskThreshold"],
      message: "absenceHighRiskThreshold must be greater than or equal to absenceWarningThreshold",
    });
  }
});

export const chapterDynamicExtractionSchema = z.object({
  candidates: z.array(z.object({
    proposedName: z.string().trim().min(1),
    proposedRole: z.string().trim().optional().nullable(),
    summary: z.string().trim().optional().nullable(),
    evidence: z.array(z.string().trim().min(1)).max(4).default([]),
    matchedCharacterName: z.string().trim().optional().nullable(),
    confidence: normalizedConfidenceSchema,
  })).default([]),
  factionUpdates: z.array(z.object({
    characterName: z.string().trim().min(1),
    factionLabel: z.string().trim().min(1),
    stanceLabel: z.string().trim().optional().nullable(),
    summary: z.string().trim().optional().nullable(),
    confidence: normalizedConfidenceSchema,
  })).default([]),
  relationStages: z.array(z.object({
    sourceCharacterName: z.string().trim().min(1),
    targetCharacterName: z.string().trim().min(1),
    stageLabel: z.string().trim().min(1),
    stageSummary: z.string().trim().min(1),
    nextTurnPoint: z.string().trim().optional().nullable(),
    confidence: normalizedConfidenceSchema,
  })).default([]),
});

export const volumeDynamicsProjectionSchema = z.object({
  assignments: z.array(volumeProjectionAssignmentSchema).default([]),
  factionTracks: z.array(z.object({
    characterName: z.string().trim().min(1),
    volumeSortOrder: z.number().int().min(1).optional().nullable(),
    factionLabel: z.string().trim().min(1),
    stanceLabel: z.string().trim().optional().nullable(),
    summary: z.string().trim().optional().nullable(),
    confidence: normalizedConfidenceSchema,
  })).default([]),
  relationStages: z.array(z.object({
    sourceCharacterName: z.string().trim().min(1),
    targetCharacterName: z.string().trim().min(1),
    volumeSortOrder: z.number().int().min(1).optional().nullable(),
    stageLabel: z.string().trim().min(1),
    stageSummary: z.string().trim().min(1),
    nextTurnPoint: z.string().trim().optional().nullable(),
    confidence: normalizedConfidenceSchema,
  })).default([]),
}).strict();

export const confirmCandidateInputSchema = z.object({
  role: z.string().trim().optional(),
  castRole: z.enum(["protagonist", "antagonist", "ally", "foil", "mentor", "love_interest", "pressure_source", "catalyst"]).optional(),
  relationToProtagonist: z.string().trim().optional(),
  currentState: z.string().trim().optional(),
  currentGoal: z.string().trim().optional(),
  summary: z.string().trim().optional(),
});

export const mergeCandidateInputSchema = z.object({
  characterId: z.string().trim().min(1),
  summary: z.string().trim().optional(),
});

export const updateCharacterDynamicStateInputSchema = z.object({
  currentState: z.string().trim().optional(),
  currentGoal: z.string().trim().optional(),
  factionLabel: z.string().trim().optional(),
  stanceLabel: z.string().trim().optional(),
  summary: z.string().trim().optional(),
  volumeId: z.string().trim().optional(),
  chapterId: z.string().trim().optional(),
  chapterOrder: z.number().int().min(1).optional(),
  roleLabel: z.string().trim().optional(),
  responsibility: z.string().trim().optional(),
  appearanceExpectation: z.string().trim().optional(),
  plannedChapterOrders: z.array(z.number().int().min(1)).optional(),
  isCore: z.boolean().optional(),
  absenceWarningThreshold: z.number().int().min(1).max(12).optional(),
  absenceHighRiskThreshold: z.number().int().min(1).max(12).optional(),
  decisionNote: z.string().trim().optional(),
});

export const updateRelationStageInputSchema = z.object({
  stageLabel: z.string().trim().min(1),
  stageSummary: z.string().trim().min(1),
  nextTurnPoint: z.string().trim().optional(),
  volumeId: z.string().trim().optional(),
  chapterId: z.string().trim().optional(),
  chapterOrder: z.number().int().min(1).optional(),
  confidence: z.number().min(0).max(1).optional(),
  decisionNote: z.string().trim().optional(),
});

export type ChapterDynamicExtraction = z.infer<typeof chapterDynamicExtractionSchema>;
export type VolumeDynamicsProjection = z.infer<typeof volumeDynamicsProjectionSchema>;
export type ConfirmCandidateInput = z.infer<typeof confirmCandidateInputSchema>;
export type MergeCandidateInput = z.infer<typeof mergeCandidateInputSchema>;
export type UpdateCharacterDynamicStateInput = z.infer<typeof updateCharacterDynamicStateInputSchema>;
export type UpdateRelationStageInput = z.infer<typeof updateRelationStageInputSchema>;
