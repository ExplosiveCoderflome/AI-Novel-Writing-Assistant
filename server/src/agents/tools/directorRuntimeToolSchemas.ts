import { z } from "zod";

export const directorPolicyModeSchema = z.enum([
  "suggest_only",
  "run_next_step",
  "run_until_gate",
  "auto_safe_scope",
]);

export const directorModelTierSchema = z.enum(["cheap_fast", "balanced", "high_quality"]);

export const directorRuntimeIdentityInputSchema = z
  .object({
    novelId: z.string().trim().min(1).optional(),
    taskId: z.string().trim().min(1).optional(),
  })
  .refine((input) => Boolean(input.novelId || input.taskId), {
    message: "novelId or taskId is required.",
  });

export const analyzeDirectorWorkspaceInputSchema = directorRuntimeIdentityInputSchema.extend({
  includeAiInterpretation: z.boolean().optional(),
});

export const getDirectorRunStatusInputSchema = directorRuntimeIdentityInputSchema;

export const explainDirectorNextActionInputSchema = directorRuntimeIdentityInputSchema.extend({
  includeAiInterpretation: z.boolean().optional(),
});

export const runDirectorRuntimeInputSchema = directorRuntimeIdentityInputSchema.extend({
  dryRun: z.boolean().optional(),
});

export const switchDirectorPolicyInputSchema = directorRuntimeIdentityInputSchema.extend({
  mode: directorPolicyModeSchema,
  mayOverwriteUserContent: z.boolean().optional(),
  allowExpensiveReview: z.boolean().optional(),
  modelTier: directorModelTierSchema.optional(),
  dryRun: z.boolean().optional(),
});

export const evaluateManualEditImpactInputSchema = directorRuntimeIdentityInputSchema.extend({
  chapterId: z.string().trim().min(1).optional(),
  includeAiInterpretation: z.boolean().optional(),
});

export const directorNextActionSchema = z.object({
  action: z.string(),
  reason: z.string(),
  affectedScope: z.string().nullable(),
  riskLevel: z.enum(["low", "medium", "high"]),
}).nullable();

export const directorArtifactSummarySchema = z.object({
  total: z.number().int(),
  missingArtifactTypes: z.array(z.string()),
  staleArtifactCount: z.number().int(),
  protectedUserContentCount: z.number().int(),
  needsRepairCount: z.number().int(),
});

export const analyzeDirectorWorkspaceOutputSchema = z.object({
  novelId: z.string(),
  taskId: z.string().nullable(),
  productionStage: z.string().nullable(),
  summary: z.string(),
  confidence: z.number(),
  nextAction: directorNextActionSchema,
  artifactSummary: directorArtifactSummarySchema,
});

export const directorRuntimeEventSummarySchema = z.object({
  type: z.string(),
  summary: z.string(),
  nodeKey: z.string().nullable(),
  severity: z.string().nullable(),
  occurredAt: z.string(),
});

export const getDirectorRunStatusOutputSchema = z.object({
  taskId: z.string(),
  novelId: z.string().nullable(),
  status: z.string(),
  currentNodeKey: z.string().nullable(),
  currentLabel: z.string().nullable(),
  headline: z.string().nullable(),
  detail: z.string().nullable(),
  nextActionLabel: z.string().nullable(),
  scopeSummary: z.string().nullable(),
  progressSummary: z.string().nullable(),
  requiresUserAction: z.boolean(),
  blockedReason: z.string().nullable(),
  policyMode: directorPolicyModeSchema,
  recentEvents: z.array(directorRuntimeEventSummarySchema),
  summary: z.string(),
});

export const explainDirectorNextActionOutputSchema = z.object({
  novelId: z.string(),
  taskId: z.string(),
  runtimeStatus: z.string(),
  currentStep: z.string().nullable(),
  recommendedAction: directorNextActionSchema,
  nextActionLabel: z.string().nullable(),
  requiresUserAction: z.boolean(),
  blockedReason: z.string().nullable(),
  reason: z.string(),
  summary: z.string(),
});

export const runDirectorRuntimeOutputSchema = z.object({
  taskId: z.string(),
  novelId: z.string().nullable(),
  mode: directorPolicyModeSchema,
  status: z.enum(["preview_only", "accepted"]),
  summary: z.string(),
});

export const switchDirectorPolicyOutputSchema = z.object({
  taskId: z.string(),
  novelId: z.string().nullable(),
  mode: directorPolicyModeSchema,
  status: z.enum(["preview_only", "updated"]),
  summary: z.string(),
});

export const evaluateManualEditImpactOutputSchema = z.object({
  novelId: z.string(),
  taskId: z.string().nullable(),
  impactLevel: z.enum(["none", "low", "medium", "high"]),
  summary: z.string(),
  safeToContinue: z.boolean(),
  requiresApproval: z.boolean(),
  affectedArtifactIds: z.array(z.string()),
  changedChapters: z.array(z.object({
    chapterId: z.string(),
    title: z.string(),
    order: z.number().int(),
  })),
  minimalRepairPath: z.array(z.object({
    action: z.string(),
    label: z.string(),
    reason: z.string(),
    affectedScope: z.string().nullable(),
    requiresApproval: z.boolean(),
  })),
  riskNotes: z.array(z.string()),
});
