import { z } from "zod";

const auditTypeSchema = z.enum(["continuity", "character", "plot", "mode_fit"]);
export const auditSeveritySchema = z.enum(["low", "medium", "high", "critical"]);
const auditIssueStatusSchema = z.enum(["open", "resolved", "ignored"]);
const styleDetectionRuleTypeSchema = z.enum(["style", "character", "forbidden", "risk", "encourage"]);
const antiAiSeveritySchema = z.enum(["low", "medium", "high"]);
const styleContractIssueCategorySchema = z.enum(["style_expression", "story_structure"]);
const styleContractViolationSourceSchema = z.enum(["global_anti_ai", "style_anti_ai", "style_contract"]);

export const runtimeAuditIssueSchema = z.object({
  id: z.string(),
  reportId: z.string(),
  auditType: auditTypeSchema,
  severity: auditSeveritySchema,
  code: z.string(),
  description: z.string(),
  evidence: z.string(),
  fixSuggestion: z.string(),
  status: auditIssueStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const runtimeQualityScoreSchema = z.object({
  coherence: z.number(),
  repetition: z.number(),
  pacing: z.number(),
  voice: z.number(),
  engagement: z.number(),
  overall: z.number(),
});

export const chapterAcceptanceStatusSchema = z.enum(["accepted", "repairable", "needs_manual_review", "continue_with_risk"]);
export const chapterAcceptanceContinuePolicySchema = z.enum(["continue", "repair_once", "pause"]);
export const chapterAcceptanceRepairDirectiveSchema = z.object({
  mode: z.enum(["patch", "rewrite", "manual"]),
  target: z.enum(["continuity", "character", "plot", "ending", "voice"]),
  instruction: z.string(),
});
export const chapterAcceptanceRepairabilitySchema = z.enum([
  "none",
  "patchable_obligation_gap",
  "rewrite_needed",
  "plan_misalignment",
]);
export const chapterAcceptanceAssetSyncRecommendationSchema = z.object({
  priority: z.enum(["normal", "high"]),
  reason: z.string(),
  requiresFullPayoffReconcile: z.boolean(),
});

export const runtimeAuditReportSchema = z.object({
  id: z.string(),
  novelId: z.string(),
  chapterId: z.string(),
  auditType: auditTypeSchema,
  overallScore: z.number().nullable().optional(),
  summary: z.string().nullable().optional(),
  legacyScoreJson: z.string().nullable().optional(),
  issues: z.array(runtimeAuditIssueSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const styleDetectionViolationSchema = z.object({
  ruleId: z.string(),
  ruleName: z.string(),
  ruleType: styleDetectionRuleTypeSchema,
  severity: antiAiSeveritySchema,
  source: styleContractViolationSourceSchema,
  issueCategory: styleContractIssueCategorySchema,
  excerpt: z.string(),
  reason: z.string(),
  suggestion: z.string(),
  canAutoRewrite: z.boolean(),
});

export const styleDetectionReportSchema = z.object({
  riskScore: z.number().int(),
  summary: z.string(),
  violations: z.array(styleDetectionViolationSchema),
  canAutoRewrite: z.boolean(),
  appliedRuleIds: z.array(z.string()),
});

export const runtimeStyleReviewSchema = z.object({
  report: styleDetectionReportSchema.nullable(),
  autoRewritten: z.boolean(),
  originalContent: z.string().nullable().optional(),
});

export const runtimeSceneGenerationResultSchema = z.object({
  sceneKey: z.string(),
  sceneTitle: z.string(),
  sceneIndex: z.number().int().min(1),
  targetWordCount: z.number().int().positive(),
  beforeLength: z.number().int().nonnegative(),
  afterLength: z.number().int().nonnegative(),
  actualWordCount: z.number().int().nonnegative(),
  sceneStatus: z.string(),
});

export const runtimeSceneRoundResultSchema = z.object({
  roundIndex: z.number().int().min(1),
  suggestedWordCount: z.number().int().nonnegative().nullable().optional(),
  hardWordLimit: z.number().int().positive().nullable().optional(),
  actualWordCount: z.number().int().nonnegative(),
  isFinalRound: z.boolean(),
  closingPhase: z.boolean(),
  hardStopTriggered: z.boolean().default(false),
  trimmedAtSentenceBoundary: z.boolean().default(false),
  stopReason: z.string(),
});

export const runtimeSceneGenerationWithRoundsSchema = runtimeSceneGenerationResultSchema.extend({
  wordControlMode: z.enum(["prompt_only", "balanced"]).default("balanced"),
  roundCount: z.number().int().nonnegative().default(0),
  hardStopCount: z.number().int().nonnegative().default(0),
  closingPhaseTriggered: z.boolean().default(false),
  roundResults: z.array(runtimeSceneRoundResultSchema).default([]),
});

export const runtimeLengthControlSchema = z.object({
  targetWordCount: z.number().int().positive(),
  softMinWordCount: z.number().int().positive(),
  softMaxWordCount: z.number().int().positive(),
  hardMaxWordCount: z.number().int().positive(),
  finalWordCount: z.number().int().nonnegative(),
  variance: z.number(),
  wordControlMode: z.enum(["prompt_only", "balanced", "hybrid"]).default("hybrid"),
  plannedSceneCount: z.number().int().nonnegative(),
  generatedSceneCount: z.number().int().nonnegative(),
  sceneResults: z.array(runtimeSceneGenerationWithRoundsSchema).default([]),
  closingPhaseTriggered: z.boolean().default(false),
  hardStopsTriggered: z.number().int().nonnegative().default(0),
  lengthRepairPath: z.array(z.string()).default([]),
  overlengthRepairApplied: z.boolean(),
});

export type RuntimeAuditIssue = z.infer<typeof runtimeAuditIssueSchema>;
export type RuntimeQualityScore = z.infer<typeof runtimeQualityScoreSchema>;
export type ChapterAcceptanceStatus = z.infer<typeof chapterAcceptanceStatusSchema>;
export type ChapterAcceptanceContinuePolicy = z.infer<typeof chapterAcceptanceContinuePolicySchema>;
export type ChapterAcceptanceRepairDirective = z.infer<typeof chapterAcceptanceRepairDirectiveSchema>;
export type ChapterAcceptanceRepairability = z.infer<typeof chapterAcceptanceRepairabilitySchema>;
export type ChapterAcceptanceAssetSyncRecommendation = z.infer<typeof chapterAcceptanceAssetSyncRecommendationSchema>;
export type RuntimeAuditReport = z.infer<typeof runtimeAuditReportSchema>;
export type RuntimeStyleDetectionViolation = z.infer<typeof styleDetectionViolationSchema>;
export type RuntimeStyleDetectionReport = z.infer<typeof styleDetectionReportSchema>;
export type RuntimeStyleReview = z.infer<typeof runtimeStyleReviewSchema>;
export type RuntimeSceneGenerationResult = z.infer<typeof runtimeSceneGenerationWithRoundsSchema>;
export type RuntimeSceneRoundResult = z.infer<typeof runtimeSceneRoundResultSchema>;
export type RuntimeLengthControl = z.infer<typeof runtimeLengthControlSchema>;
