import { z } from "zod";
import { storyWorldSliceSchema } from "./storyWorldSlice";

const llmProviderSchema = z.enum([
  "deepseek",
  "siliconflow",
  "openai",
  "anthropic",
  "grok",
  "kimi",
  "glm",
  "qwen",
  "gemini",
]);
const auditTypeSchema = z.enum(["continuity", "character", "plot"]);
const auditSeveritySchema = z.enum(["low", "medium", "high", "critical"]);
const auditIssueStatusSchema = z.enum(["open", "resolved", "ignored"]);
const chapterGenerationStateSchema = z.enum(["planned", "drafted", "reviewed", "repaired", "approved", "published"]);
const storyPlanRoleSchema = z.enum(["setup", "progress", "pressure", "turn", "payoff", "cooldown"]);
const styleBindingTargetTypeSchema = z.enum(["novel", "chapter", "task"]);
const antiAiRuleTypeSchema = z.enum(["forbidden", "risk", "encourage"]);
const antiAiSeveritySchema = z.enum(["low", "medium", "high"]);

export const chapterRuntimeRequestSchema = z.object({
  provider: llmProviderSchema.optional(),
  model: z.string().trim().optional(),
  temperature: z.number().min(0).max(2).optional(),
  previousChaptersSummary: z.array(z.string()).optional(),
  taskStyleProfileId: z.string().trim().optional(),
});

export const runtimeChapterSchema = z.object({
  id: z.string(),
  title: z.string(),
  order: z.number().int(),
  content: z.string().nullable().optional(),
  expectation: z.string().nullable().optional(),
  supportingContextText: z.string().default(""),
});

export const runtimePlanSceneSchema = z.object({
  id: z.string(),
  sortOrder: z.number().int(),
  title: z.string(),
  objective: z.string().nullable().optional(),
  conflict: z.string().nullable().optional(),
  reveal: z.string().nullable().optional(),
  emotionBeat: z.string().nullable().optional(),
});

export const runtimePlanSchema = z.object({
  id: z.string(),
  chapterId: z.string().nullable().optional(),
  planRole: storyPlanRoleSchema.nullable().optional(),
  phaseLabel: z.string().nullable().optional(),
  title: z.string(),
  objective: z.string(),
  participants: z.array(z.string()),
  reveals: z.array(z.string()),
  riskNotes: z.array(z.string()),
  mustAdvance: z.array(z.string()).default([]),
  mustPreserve: z.array(z.string()).default([]),
  sourceIssueIds: z.array(z.string()).default([]),
  replannedFromPlanId: z.string().nullable().optional(),
  hookTarget: z.string().nullable().optional(),
  rawPlanJson: z.string().nullable().optional(),
  scenes: z.array(runtimePlanSceneSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const runtimeCharacterSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  personality: z.string().nullable().optional(),
  currentState: z.string().nullable().optional(),
  currentGoal: z.string().nullable().optional(),
});

export const runtimeCreativeDecisionSchema = z.object({
  id: z.string(),
  chapterId: z.string().nullable().optional(),
  category: z.string(),
  content: z.string(),
  importance: z.string(),
  expiresAt: z.number().int().nullable().optional(),
  sourceType: z.string().nullable().optional(),
  sourceRefId: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

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

export const runtimeCharacterStateSchema = z.object({
  characterId: z.string(),
  currentGoal: z.string().nullable().optional(),
  emotion: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
});

export const runtimeRelationStateSchema = z.object({
  sourceCharacterId: z.string(),
  targetCharacterId: z.string(),
  summary: z.string().nullable().optional(),
});

export const runtimeInformationStateSchema = z.object({
  holderType: z.string(),
  holderRefId: z.string().nullable().optional(),
  fact: z.string(),
  status: z.string(),
  summary: z.string().nullable().optional(),
});

export const runtimeForeshadowStateSchema = z.object({
  title: z.string(),
  summary: z.string().nullable().optional(),
  status: z.string(),
  setupChapterId: z.string().nullable().optional(),
  payoffChapterId: z.string().nullable().optional(),
});

export const runtimeOpenConflictSchema = z.object({
  id: z.string(),
  novelId: z.string(),
  chapterId: z.string().nullable().optional(),
  sourceSnapshotId: z.string().nullable().optional(),
  sourceIssueId: z.string().nullable().optional(),
  sourceType: z.string(),
  conflictType: z.string(),
  conflictKey: z.string(),
  title: z.string(),
  summary: z.string(),
  severity: z.string(),
  status: z.string(),
  evidence: z.array(z.string()).default([]),
  affectedCharacterIds: z.array(z.string()).default([]),
  resolutionHint: z.string().nullable().optional(),
  lastSeenChapterOrder: z.number().int().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const runtimeStateSnapshotSchema = z.object({
  id: z.string(),
  novelId: z.string(),
  sourceChapterId: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  rawStateJson: z.string().nullable().optional(),
  characterStates: z.array(runtimeCharacterStateSchema),
  relationStates: z.array(runtimeRelationStateSchema),
  informationStates: z.array(runtimeInformationStateSchema),
  foreshadowStates: z.array(runtimeForeshadowStateSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const runtimeContinuationSchema = z.object({
  enabled: z.boolean(),
  sourceType: z.enum(["novel", "knowledge_document"]).nullable(),
  sourceId: z.string().nullable(),
  sourceTitle: z.string(),
  systemRule: z.string(),
  humanBlock: z.string(),
  antiCopyCorpus: z.array(z.string()).default([]),
});

export const runtimeStyleRuleBlockSchema = z.record(z.string(), z.unknown());

export const runtimeCompiledStylePromptBlocksSchema = z.object({
  context: z.string(),
  style: z.string(),
  character: z.string(),
  antiAi: z.string(),
  output: z.string(),
  selfCheck: z.string(),
  mergedRules: z.object({
    narrativeRules: runtimeStyleRuleBlockSchema,
    characterRules: runtimeStyleRuleBlockSchema,
    languageRules: runtimeStyleRuleBlockSchema,
    rhythmRules: runtimeStyleRuleBlockSchema,
  }),
  appliedRuleIds: z.array(z.string()),
});

export const runtimeStyleProfileSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
});

export const runtimeStyleBindingSchema = z.object({
  id: z.string(),
  styleProfileId: z.string(),
  targetType: styleBindingTargetTypeSchema,
  targetId: z.string(),
  priority: z.number().int(),
  weight: z.number(),
  enabled: z.boolean(),
  styleProfile: runtimeStyleProfileSummarySchema.optional(),
});

export const runtimeStyleContextSchema = z.object({
  matchedBindings: z.array(runtimeStyleBindingSchema),
  compiledBlocks: runtimeCompiledStylePromptBlocksSchema.nullable(),
});

export const generationContextPackageSchema = z.object({
  chapter: runtimeChapterSchema,
  plan: runtimePlanSchema.nullable(),
  stateSnapshot: runtimeStateSnapshotSchema.nullable(),
  openConflicts: z.array(runtimeOpenConflictSchema),
  storyWorldSlice: storyWorldSliceSchema.nullable().optional(),
  characterRoster: z.array(runtimeCharacterSchema),
  creativeDecisions: z.array(runtimeCreativeDecisionSchema),
  openAuditIssues: z.array(runtimeAuditIssueSchema),
  previousChaptersSummary: z.array(z.string()),
  openingHint: z.string(),
  continuation: runtimeContinuationSchema,
  styleContext: runtimeStyleContextSchema.nullable().optional(),
});

export const runtimeQualityScoreSchema = z.object({
  coherence: z.number(),
  repetition: z.number(),
  pacing: z.number(),
  voice: z.number(),
  engagement: z.number(),
  overall: z.number(),
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
  ruleType: antiAiRuleTypeSchema,
  severity: antiAiSeveritySchema,
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

export const chapterRuntimePackageSchema = z.object({
  novelId: z.string(),
  chapterId: z.string(),
  context: generationContextPackageSchema,
  draft: z.object({
    content: z.string(),
    wordCount: z.number().int().nonnegative(),
    generationState: chapterGenerationStateSchema.optional(),
  }),
  audit: z.object({
    score: runtimeQualityScoreSchema,
    reports: z.array(runtimeAuditReportSchema),
    openIssues: z.array(runtimeAuditIssueSchema),
    hasBlockingIssues: z.boolean(),
  }),
  replanRecommendation: z.object({
    recommended: z.boolean(),
    reason: z.string(),
    blockingIssueIds: z.array(z.string()),
  }),
  styleReview: runtimeStyleReviewSchema.optional(),
  meta: z.object({
    provider: z.string().optional(),
    model: z.string().optional(),
    temperature: z.number().optional(),
    runId: z.string().optional(),
    generatedAt: z.string().optional(),
  }),
});

export type ChapterRuntimeRequest = z.infer<typeof chapterRuntimeRequestSchema>;
export type RuntimeChapter = z.infer<typeof runtimeChapterSchema>;
export type RuntimePlanScene = z.infer<typeof runtimePlanSceneSchema>;
export type RuntimePlan = z.infer<typeof runtimePlanSchema>;
export type RuntimeCharacter = z.infer<typeof runtimeCharacterSchema>;
export type RuntimeCreativeDecision = z.infer<typeof runtimeCreativeDecisionSchema>;
export type RuntimeAuditIssue = z.infer<typeof runtimeAuditIssueSchema>;
export type RuntimeStateSnapshot = z.infer<typeof runtimeStateSnapshotSchema>;
export type RuntimeOpenConflict = z.infer<typeof runtimeOpenConflictSchema>;
export type RuntimeContinuation = z.infer<typeof runtimeContinuationSchema>;
export type RuntimeCompiledStylePromptBlocks = z.infer<typeof runtimeCompiledStylePromptBlocksSchema>;
export type RuntimeStyleBinding = z.infer<typeof runtimeStyleBindingSchema>;
export type RuntimeStyleContext = z.infer<typeof runtimeStyleContextSchema>;
export type GenerationContextPackage = z.infer<typeof generationContextPackageSchema>;
export type RuntimeQualityScore = z.infer<typeof runtimeQualityScoreSchema>;
export type RuntimeAuditReport = z.infer<typeof runtimeAuditReportSchema>;
export type ChapterRuntimePackage = z.infer<typeof chapterRuntimePackageSchema>;
export type RuntimeStyleDetectionViolation = z.infer<typeof styleDetectionViolationSchema>;
export type RuntimeStyleDetectionReport = z.infer<typeof styleDetectionReportSchema>;
export type RuntimeStyleReview = z.infer<typeof runtimeStyleReviewSchema>;
