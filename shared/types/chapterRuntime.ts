import { z } from "zod";
import {
  chapterScenePlanSchema,
  lengthBudgetContractSchema,
} from "./chapterLengthControl";
import {
  canonicalStateSnapshotSchema,
  chapterStateGoalSchema,
  chapterPayoffDirectiveSchema,
  generationNextActionSchema,
} from "./canonicalState";
import { characterResourceContextSchema } from "./characterResource";
import { storyWorldSliceSchema } from "./storyWorldSlice";
import { timelineCheckResultSchema, timelineContextForChapterSchema } from "./timeline";
import {
  EMPTY_READER_EXPERIENCE_CONTRACT,
  readerExperienceContractSchema,
} from "./novel/readerExperience";
import type { LLMProvider } from "./llm";
import {
  dynamicCharacterRiskLevelSchema,
  runtimeDynamicCharacterOverviewSchema,
} from "./chapterRuntime/dynamicCharacterSchemas.js";
import {
  runtimeStyleContextSchema,
  runtimeStyleContractSchema,
} from "./chapterRuntime/styleSchemas.js";
import {
  runtimePayoffLedgerItemSchema,
  runtimePayoffLedgerSummarySchema,
} from "./chapterRuntime/payoffSchemas.js";
import {
  auditSeveritySchema,
  chapterAcceptanceAssetSyncRecommendationSchema,
  chapterAcceptanceContinuePolicySchema,
  chapterAcceptanceRepairDirectiveSchema,
  chapterAcceptanceStatusSchema,
  runtimeAuditIssueSchema,
  runtimeAuditReportSchema,
  runtimeLengthControlSchema,
  runtimeQualityScoreSchema,
  runtimeStyleReviewSchema,
} from "./chapterRuntime/qualitySchemas.js";

export * from "./chapterRuntime/index.js";

const llmProviderSchema = z.custom<LLMProvider>((value) => typeof value === "string" && value.trim().length > 0);
const chapterGenerationStateSchema = z.enum(["planned", "drafted", "reviewed", "repaired", "approved", "published"]);
const storyPlanRoleSchema = z.enum(["setup", "progress", "pressure", "turn", "payoff", "cooldown"]);
const auditModeSchema = z.enum(["light", "full", "repair_only"]);
const contextBlockTierSchema = z.enum(["hard_required", "situational", "optional"]);

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
  targetWordCount: z.number().int().nullable().optional(),
  conflictLevel: z.number().int().nullable().optional(),
  revealLevel: z.number().int().nullable().optional(),
  mustAvoid: z.string().nullable().optional(),
  taskSheet: z.string().nullable().optional(),
  sceneCards: z.string().nullable().optional(),
  hook: z.string().nullable().optional(),
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
  background: z.string().nullable().optional(),
  development: z.string().nullable().optional(),
  identityLabel: z.string().nullable().optional(),
  factionLabel: z.string().nullable().optional(),
  stanceLabel: z.string().nullable().optional(),
  powerLevel: z.string().nullable().optional(),
  realm: z.string().nullable().optional(),
  currentLocation: z.string().nullable().optional(),
  availability: z.string().nullable().optional(),
  prohibitions: z.array(z.string()).default([]),
  currentState: z.string().nullable().optional(),
  currentGoal: z.string().nullable().optional(),
  appearance: z.string().nullable().optional(),
  physique: z.string().nullable().optional(),
  attireStyle: z.string().nullable().optional(),
  signatureDetail: z.string().nullable().optional(),
  voiceTexture: z.string().nullable().optional(),
  presenceImpression: z.string().nullable().optional(),
});

export const runtimeCharacterMindStateSchema = z.object({
  characterId: z.string(),
  currentInterpretation: z.string(),
  privateIntent: z.string().nullable().optional(),
  activePlan: z.string().nullable().optional(),
  emotionalStance: z.string().nullable().optional(),
  actionTendency: z.string().nullable().optional(),
  decisionTrigger: z.string().nullable().optional(),
  beliefs: z.array(z.string()).default([]),
  misbeliefs: z.array(z.string()).default([]),
  evidence: z.array(z.string()).default([]),
  confidence: z.number().nullable().optional(),
  sourceChapterId: z.string().nullable().optional(),
});

export const runtimeCharacterDialogueGuidanceSchema = z.object({
  influenceId: z.string(),
  characterId: z.string(),
  summary: z.string(),
  behaviorGuidance: z.string(),
  emotionalGuidance: z.string().nullable().optional(),
  relationTension: z.string().nullable().optional(),
  targetStartChapterOrder: z.number().int(),
  targetEndChapterOrder: z.number().int(),
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

export const promptBudgetProfileSchema = z.object({
  promptId: z.string(),
  maxTokensBudget: z.number().int().positive(),
  preferredGroups: z.array(z.string()).default([]),
  dropOrder: z.array(z.string()).default([]),
});

export const contextGatingDecisionSchema = z.object({
  blockId: z.string(),
  tier: contextBlockTierSchema,
  included: z.boolean(),
  reason: z.string().optional(),
});

export const chapterChangeFlagsSchema = z.object({
  introducedPayoff: z.boolean().default(false),
  payoffResolutionSignal: z.boolean().default(false),
  relationshipShiftSignal: z.boolean().default(false),
  majorStateShiftSignal: z.boolean().default(false),
});

export const tokenBudgetPolicySchema = z.object({
  chapterBudgetProfile: z.string().default("balanced"),
  stageTokenCap: z.record(z.string(), z.number().int().positive()).default({}),
  retryCap: z.record(z.string(), z.number().int().nonnegative()).default({}),
  auditMode: auditModeSchema.default("light"),
});

export const bookContractContextSchema = z.object({
  title: z.string(),
  genre: z.string(),
  targetAudience: z.string(),
  sellingPoint: z.string(),
  first30ChapterPromise: z.string(),
  narrativePov: z.string(),
  pacePreference: z.string(),
  emotionIntensity: z.string(),
  toneGuardrails: z.array(z.string()).default([]),
  hardConstraints: z.array(z.string()).default([]),
  readingPromise: z.string().default(""),
  protagonistFantasy: z.string().default(""),
  coreSellingPoint: z.string().default(""),
  chapter3Payoff: z.string().default(""),
  chapter10Payoff: z.string().default(""),
  chapter30Payoff: z.string().default(""),
  escalationLadder: z.string().default(""),
  relationshipMainline: z.string().default(""),
  activeMilestonePayoffs: z.array(z.string()).default([]),
});

export const macroConstraintContextSchema = z.object({
  sellingPoint: z.string(),
  coreConflict: z.string(),
  mainHook: z.string(),
  progressionLoop: z.string(),
  growthPath: z.string(),
  endingFlavor: z.string(),
  hardConstraints: z.array(z.string()).default([]),
});

export const volumeKeyMilestoneGuardSchema = z.object({
  targetChapterRange: z.string(),
  event: z.string(),
  status: z.enum(["not_yet", "in_progress", "done"]).default("not_yet"),
  note: z.string(),
});

export const volumeWindowContextSchema = z.object({
  volumeId: z.string().nullable().optional(),
  sortOrder: z.number().int().nullable().optional(),
  title: z.string(),
  missionSummary: z.string(),
  adjacentSummary: z.string(),
  pendingPayoffs: z.array(z.string()).default([]),
  softFutureSummary: z.string(),
  keyMilestoneGuards: z.array(volumeKeyMilestoneGuardSchema).default([]),
  readerRewardLadder: z.string().default(""),
  coreReward: z.string().default(""),
});

export const chapterMissionContextSchema = z.object({
  chapterId: z.string(),
  chapterOrder: z.number().int(),
  title: z.string(),
  objective: z.string(),
  expectation: z.string(),
  taskSheet: z.string().nullable().optional(),
  targetWordCount: z.number().int().nullable().optional(),
  planRole: storyPlanRoleSchema.nullable().optional(),
  hookTarget: z.string(),
  mustAdvance: z.array(z.string()).default([]),
  mustPreserve: z.array(z.string()).default([]),
  riskNotes: z.array(z.string()).default([]),
});

export const chapterBoundaryContractSchema = z.object({
  exclusiveEvent: z.string().nullable().optional(),
  entryState: z.string().nullable().optional(),
  endingState: z.string().nullable().optional(),
  nextChapterEntryState: z.string().nullable().optional(),
  doNotCross: z.array(z.string()).default([]),
  protectedReveals: z.array(z.string()).default([]),
  allowedRevealLevel: z.number().int().nullable().optional(),
});

export const chapterExecutionObligationContractSchema = z.object({
  mustHitNow: z.array(z.string()).default([]),
  mustPreserve: z.array(z.string()).default([]),
  requiredPayoffTouches: z.array(z.string()).default([]),
  requiredCharacterAppearances: z.array(z.string()).default([]),
  requiredGoalChanges: z.array(z.string()).default([]),
  canDefer: z.array(z.string()).default([]),
  forbiddenCrossings: z.array(z.string()).default([]),
});

export const chapterExecutionObligationKindSchema = z.enum([
  "must_hit_now",
  "must_preserve",
  "payoff_touch",
  "character_appearance",
  "goal_change",
  "forbidden_crossing",
]);

export const chapterExecutionObligationCoverageStatusSchema = z.enum([
  "satisfied",
  "partial",
  "unmet",
]);

export const chapterExecutionMissingObligationSchema = z.object({
  kind: chapterExecutionObligationKindSchema,
  summary: z.string(),
  evidence: z.string().nullable().optional(),
});

export const chapterExecutionObligationCoverageSchema = z.object({
  status: chapterExecutionObligationCoverageStatusSchema,
  missing: z.array(chapterExecutionMissingObligationSchema).default([]),
  summary: z.string(),
});

export const chapterFailureClassificationCodeSchema = z.enum([
  "none",
  "draft_generation_failed",
  "draft_obligation_unmet",
  "draft_repair_exhausted",
  "replan_required",
]);

export const chapterFailureClassificationSchema = z.object({
  code: chapterFailureClassificationCodeSchema,
  summary: z.string(),
  decisionReason: z.string().nullable().optional(),
  blockingObligations: z.array(chapterExecutionMissingObligationSchema).default([]),
});

export const chapterCharacterBehaviorGuideSchema = z.object({
  characterId: z.string(),
  name: z.string(),
  role: z.string(),
  castRole: z.string().nullable().optional(),
  volumeRoleLabel: z.string().nullable().optional(),
  volumeResponsibility: z.string().nullable().optional(),
  currentGoal: z.string().nullable().optional(),
  currentState: z.string().nullable().optional(),
  visibleProfileSummary: z.string().nullable().optional(),
  factionLabel: z.string().nullable().optional(),
  stanceLabel: z.string().nullable().optional(),
  relationStageLabels: z.array(z.string()).default([]),
  relationRiskNotes: z.array(z.string()).default([]),
  plannedChapterOrders: z.array(z.number().int()).default([]),
  absenceRisk: dynamicCharacterRiskLevelSchema,
  absenceSpan: z.number().int().nonnegative(),
  isCoreInVolume: z.boolean(),
  shouldPreferAppearance: z.boolean(),
  mindGuidance: z.string().nullable().optional(),
  authorInfluenceGuidance: z.string().nullable().optional(),
});

export const chapterRelationStageGuideSchema = z.object({
  relationId: z.string().nullable().optional(),
  sourceCharacterId: z.string(),
  sourceCharacterName: z.string(),
  targetCharacterId: z.string(),
  targetCharacterName: z.string(),
  stageLabel: z.string(),
  stageSummary: z.string(),
  nextTurnPoint: z.string().nullable().optional(),
  isCurrent: z.boolean(),
});

export const chapterCandidateGuardSchema = z.object({
  id: z.string(),
  proposedName: z.string(),
  proposedRole: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  evidence: z.array(z.string()).default([]),
  sourceChapterOrder: z.number().int().nullable().optional(),
});

export const chapterCharacterPendingReviewFieldSchema = z.enum(["currentState", "currentGoal"]);

export const chapterCharacterHardFactSchema = z.object({
  characterId: z.string(),
  name: z.string(),
  role: z.string().nullable().optional(),
  identityLabel: z.string().nullable().optional(),
  factionLabel: z.string().nullable().optional(),
  stanceLabel: z.string().nullable().optional(),
  powerLevel: z.string().nullable().optional(),
  realm: z.string().nullable().optional(),
  currentLocation: z.string().nullable().optional(),
  availability: z.string().nullable().optional(),
  currentState: z.string().nullable().optional(),
  currentGoal: z.string().nullable().optional(),
  prohibitions: z.array(z.string()).default([]),
  pendingReviewFields: z.array(chapterCharacterPendingReviewFieldSchema).default([]),
});

export const chapterWriteContextSchema = z.object({
  bookContract: bookContractContextSchema,
  macroConstraints: macroConstraintContextSchema.nullable(),
  volumeWindow: volumeWindowContextSchema.nullable(),
  narrativeProgressHint: z.string().nullable().optional(),
  chapterMission: chapterMissionContextSchema,
  nextAction: generationNextActionSchema.default("write_chapter"),
  chapterStateGoal: chapterStateGoalSchema.nullable().optional(),
  protectedSecrets: z.array(z.string()).default([]),
  payoffDirectives: z.array(chapterPayoffDirectiveSchema).default([]),
  obligationContract: chapterExecutionObligationContractSchema.default({
    mustHitNow: [],
    mustPreserve: [],
    requiredPayoffTouches: [],
    requiredCharacterAppearances: [],
    requiredGoalChanges: [],
    canDefer: [],
    forbiddenCrossings: [],
  }),
  chapterBoundary: chapterBoundaryContractSchema.nullable().optional(),
  lengthBudget: lengthBudgetContractSchema.nullable(),
  scenePlan: chapterScenePlanSchema.nullable().optional(),
  readerExperience: readerExperienceContractSchema.default(EMPTY_READER_EXPERIENCE_CONTRACT),
  participants: z.array(runtimeCharacterSchema),
  characterHardFacts: z.array(chapterCharacterHardFactSchema).default([]),
  characterBehaviorGuides: z.array(chapterCharacterBehaviorGuideSchema).default([]),
  activeRelationStages: z.array(chapterRelationStageGuideSchema).default([]),
  pendingCandidateGuards: z.array(chapterCandidateGuardSchema).default([]),
  localStateSummary: z.string(),
  openConflictSummaries: z.array(z.string()).default([]),
  ledgerPendingItems: z.array(runtimePayoffLedgerItemSchema).default([]),
  ledgerUrgentItems: z.array(runtimePayoffLedgerItemSchema).default([]),
  ledgerOverdueItems: z.array(runtimePayoffLedgerItemSchema).default([]),
  ledgerSummary: runtimePayoffLedgerSummarySchema.nullable().optional(),
  timelineContext: timelineContextForChapterSchema.nullable().optional(),
  characterResourceContext: characterResourceContextSchema.nullable().optional(),
  recentChapterSummaries: z.array(z.string()).default([]),
  previousChapterTail: z.string().nullable().optional(),
  openingAntiRepeatHint: z.string(),
  styleContract: runtimeStyleContractSchema.nullable().optional(),
  styleConstraints: z.array(z.string()).default([]),
  continuationConstraints: z.array(z.string()).default([]),
  ragFacts: z.array(z.string()).default([]),
  completedMilestones: z.array(z.string()).default([]),
  recentScenePatterns: z.array(z.string()).default([]),
});

export const chapterReviewContextSchema = chapterWriteContextSchema.extend({
  structureObligations: z.array(z.string()).default([]),
  worldRules: z.array(z.string()).default([]),
  historicalIssues: z.array(z.string()).default([]),
});

export const chapterRepairIssueSchema = z.object({
  severity: auditSeveritySchema,
  category: z.string(),
  evidence: z.string(),
  fixSuggestion: z.string(),
});

export const chapterRepairContextSchema = z.object({
  writeContext: chapterWriteContextSchema,
  issues: z.array(chapterRepairIssueSchema).default([]),
  structureObligations: z.array(z.string()).default([]),
  worldRules: z.array(z.string()).default([]),
  historicalIssues: z.array(z.string()).default([]),
  allowedEditBoundaries: z.array(z.string()).default([]),
});

export const generationContextPackageSchema = z.object({
  chapter: runtimeChapterSchema,
  plan: runtimePlanSchema.nullable(),
  canonicalState: canonicalStateSnapshotSchema.nullable().optional(),
  nextAction: generationNextActionSchema.default("write_chapter"),
  chapterStateGoal: chapterStateGoalSchema.nullable().optional(),
  protectedSecrets: z.array(z.string()).default([]),
  pendingReviewProposalCount: z.number().int().nonnegative().default(0),
  stateSnapshot: runtimeStateSnapshotSchema.nullable(),
  openConflicts: z.array(runtimeOpenConflictSchema),
  storyWorldSlice: storyWorldSliceSchema.nullable().optional(),
  characterRoster: z.array(runtimeCharacterSchema),
  characterHardFacts: z.array(chapterCharacterHardFactSchema).default([]),
  creativeDecisions: z.array(runtimeCreativeDecisionSchema),
  openAuditIssues: z.array(runtimeAuditIssueSchema),
  previousChaptersSummary: z.array(z.string()),
  previousChapterTail: z.string().nullable().optional(),
  openingHint: z.string(),
  continuation: runtimeContinuationSchema,
  styleContext: runtimeStyleContextSchema.nullable().optional(),
  characterDynamics: runtimeDynamicCharacterOverviewSchema.nullable().optional(),
  characterMindStates: z.array(runtimeCharacterMindStateSchema).default([]),
  // Optional for older preview / recovery context producers; runtime consumers default to no guidance.
  characterDialogueGuidances: z.array(runtimeCharacterDialogueGuidanceSchema).optional(),
  bookContract: bookContractContextSchema.nullable().optional(),
  macroConstraints: macroConstraintContextSchema.nullable().optional(),
  volumeWindow: volumeWindowContextSchema.nullable().optional(),
  narrativeProgressHint: z.string().nullable().optional(),
  ledgerPendingItems: z.array(runtimePayoffLedgerItemSchema).default([]),
  ledgerUrgentItems: z.array(runtimePayoffLedgerItemSchema).default([]),
  ledgerOverdueItems: z.array(runtimePayoffLedgerItemSchema).default([]),
  ledgerSummary: runtimePayoffLedgerSummarySchema.nullable().optional(),
  timelineContext: timelineContextForChapterSchema.nullable().optional(),
  characterResourceContext: characterResourceContextSchema.nullable().optional(),
  ragContext: z.string().default(""),
  chapterMission: chapterMissionContextSchema.nullable().optional(),
  chapterWriteContext: chapterWriteContextSchema.nullable().optional(),
  chapterReviewContext: chapterReviewContextSchema.nullable().optional(),
  chapterRepairContext: chapterRepairContextSchema.nullable().optional(),
  contextGatingDecisions: z.array(contextGatingDecisionSchema).default([]),
  chapterChangeFlags: chapterChangeFlagsSchema.optional(),
  tokenBudgetPolicy: tokenBudgetPolicySchema.optional(),
  promptBudgetProfiles: z.array(promptBudgetProfileSchema).default([]),
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
  obligationContract: chapterExecutionObligationContractSchema.default({
    mustHitNow: [],
    mustPreserve: [],
    requiredPayoffTouches: [],
    requiredCharacterAppearances: [],
    requiredGoalChanges: [],
    canDefer: [],
    forbiddenCrossings: [],
  }),
  obligationCoverage: chapterExecutionObligationCoverageSchema.default({
    status: "satisfied",
    missing: [],
    summary: "旧运行记录未包含章节义务覆盖信息。",
  }),
  failureClassification: chapterFailureClassificationSchema.default({
    code: "none",
    summary: "旧运行记录未包含失败分类。",
    decisionReason: null,
    blockingObligations: [],
  }),
  replanRecommendation: z.object({
    recommended: z.boolean(),
    action: z.enum(["continue_with_warning", "local_patch_plan", "stop_for_replan"]).optional(),
    reason: z.string(),
    blockingIssueIds: z.array(z.string()),
    blockingLedgerKeys: z.array(z.string()).default([]),
    affectedChapterOrders: z.array(z.number().int()).default([]),
    anchorChapterOrder: z.number().int().nullable().optional(),
    triggerReason: z.string().optional(),
    windowReason: z.string().optional(),
    whyTheseChapters: z.string().optional(),
  }),
  lengthControl: runtimeLengthControlSchema.optional(),
  styleReview: runtimeStyleReviewSchema.optional(),
  timelineCheck: timelineCheckResultSchema.optional(),
  meta: z.object({
    provider: z.string().optional(),
    model: z.string().optional(),
    temperature: z.number().optional(),
    runId: z.string().optional(),
    generatedAt: z.string().optional(),
    nextAction: generationNextActionSchema.optional(),
    stateGoalSummary: z.string().optional(),
    pendingReviewProposalCount: z.number().int().nonnegative().optional(),
    acceptanceStatus: chapterAcceptanceStatusSchema.optional(),
    continuePolicy: chapterAcceptanceContinuePolicySchema.optional(),
    riskTags: z.array(z.string()).optional(),
    repairDirectives: z.array(chapterAcceptanceRepairDirectiveSchema).optional(),
    assetSyncRecommendation: chapterAcceptanceAssetSyncRecommendationSchema.optional(),
  }),
});

export type ChapterRuntimeRequest = z.infer<typeof chapterRuntimeRequestSchema>;
export type RuntimeChapter = z.infer<typeof runtimeChapterSchema>;
export type RuntimePlanScene = z.infer<typeof runtimePlanSceneSchema>;
export type RuntimePlan = z.infer<typeof runtimePlanSchema>;
export type RuntimeCharacter = z.infer<typeof runtimeCharacterSchema>;
export type ChapterCharacterHardFact = z.infer<typeof chapterCharacterHardFactSchema>;
export type ChapterCharacterPendingReviewField = z.infer<typeof chapterCharacterPendingReviewFieldSchema>;
export type RuntimeCreativeDecision = z.infer<typeof runtimeCreativeDecisionSchema>;
export type RuntimeStateSnapshot = z.infer<typeof runtimeStateSnapshotSchema>;
export type RuntimeOpenConflict = z.infer<typeof runtimeOpenConflictSchema>;
export type RuntimeContinuation = z.infer<typeof runtimeContinuationSchema>;
export type RuntimeCharacterResourceContext = z.infer<typeof characterResourceContextSchema>;
export type PromptBudgetProfile = z.infer<typeof promptBudgetProfileSchema>;
export type AuditMode = z.infer<typeof auditModeSchema>;
export type ContextBlockTier = z.infer<typeof contextBlockTierSchema>;
export type ContextGatingDecision = z.infer<typeof contextGatingDecisionSchema>;
export type ChapterChangeFlags = z.infer<typeof chapterChangeFlagsSchema>;
export type TokenBudgetPolicy = z.infer<typeof tokenBudgetPolicySchema>;
export type BookContractContext = z.infer<typeof bookContractContextSchema>;
export type MacroConstraintContext = z.infer<typeof macroConstraintContextSchema>;
export type VolumeWindowContext = z.infer<typeof volumeWindowContextSchema>;
export type ChapterMissionContext = z.infer<typeof chapterMissionContextSchema>;
export type ChapterBoundaryContract = z.infer<typeof chapterBoundaryContractSchema>;
export type ChapterExecutionObligationContract = z.infer<typeof chapterExecutionObligationContractSchema>;
export type ChapterExecutionObligationKind = z.infer<typeof chapterExecutionObligationKindSchema>;
export type ChapterExecutionMissingObligation = z.infer<typeof chapterExecutionMissingObligationSchema>;
export type ChapterExecutionObligationCoverage = z.infer<typeof chapterExecutionObligationCoverageSchema>;
export type ChapterFailureClassification = z.infer<typeof chapterFailureClassificationSchema>;
export type ChapterCharacterBehaviorGuide = z.infer<typeof chapterCharacterBehaviorGuideSchema>;
export type ChapterRelationStageGuide = z.infer<typeof chapterRelationStageGuideSchema>;
export type ChapterCandidateGuard = z.infer<typeof chapterCandidateGuardSchema>;
export type ChapterWriteContext = z.infer<typeof chapterWriteContextSchema>;
export type ChapterReviewContext = z.infer<typeof chapterReviewContextSchema>;
export type ChapterRepairIssue = z.infer<typeof chapterRepairIssueSchema>;
export type ChapterRepairContext = z.infer<typeof chapterRepairContextSchema>;
export type GenerationContextPackage = z.infer<typeof generationContextPackageSchema>;
export type ChapterRuntimePackage = z.infer<typeof chapterRuntimePackageSchema>;
