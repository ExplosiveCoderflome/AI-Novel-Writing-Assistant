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
import type { LLMProvider } from "./llm";

const llmProviderSchema = z.custom<LLMProvider>((value) => typeof value === "string" && value.trim().length > 0);
const auditTypeSchema = z.enum(["continuity", "character", "plot", "mode_fit"]);
const auditSeveritySchema = z.enum(["low", "medium", "high", "critical"]);
const auditIssueStatusSchema = z.enum(["open", "resolved", "ignored"]);
const chapterGenerationStateSchema = z.enum(["planned", "drafted", "reviewed", "repaired", "approved", "published"]);
const storyPlanRoleSchema = z.enum(["setup", "progress", "pressure", "turn", "payoff", "cooldown"]);
const payoffLedgerScopeTypeSchema = z.enum(["book", "volume", "chapter"]);
const payoffLedgerStatusSchema = z.enum(["setup", "hinted", "pending_payoff", "paid_off", "failed", "overdue"]);
const styleBindingTargetTypeSchema = z.enum(["novel", "chapter", "task"]);
const styleDetectionRuleTypeSchema = z.enum(["style", "character", "forbidden", "risk", "encourage"]);
const antiAiSeveritySchema = z.enum(["low", "medium", "high"]);
const styleContractSectionKeySchema = z.enum(["narrative", "character", "language", "rhythm", "antiAi", "selfCheck"]);
const styleContractMaturitySchema = z.enum(["structured", "summary_only"]);
const styleContractIssueCategorySchema = z.enum(["style_expression", "story_structure"]);
const styleContractViolationSourceSchema = z.enum(["global_anti_ai", "style_anti_ai", "style_contract"]);
const characterCandidateStatusSchema = z.enum(["pending", "confirmed", "merged", "rejected"]);
const dynamicCharacterRiskLevelSchema = z.enum(["none", "info", "warn", "high"]);
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

export const runtimePayoffLedgerSourceRefSchema = z.object({
  kind: z.enum(["major_payoff", "volume_open_payoff", "chapter_payoff_ref", "foreshadow_state", "open_conflict", "audit_issue"]),
  refId: z.string().nullable().optional(),
  refLabel: z.string(),
  chapterId: z.string().nullable().optional(),
  chapterOrder: z.number().int().nullable().optional(),
  volumeId: z.string().nullable().optional(),
  volumeSortOrder: z.number().int().nullable().optional(),
});

export const runtimePayoffLedgerEvidenceSchema = z.object({
  summary: z.string(),
  chapterId: z.string().nullable().optional(),
  chapterOrder: z.number().int().nullable().optional(),
});

export const runtimePayoffLedgerRiskSignalSchema = z.object({
  code: z.string(),
  severity: auditSeveritySchema,
  summary: z.string(),
  stale: z.boolean().optional(),
});

export const runtimePayoffLedgerItemSchema = z.object({
  id: z.string(),
  novelId: z.string(),
  ledgerKey: z.string(),
  title: z.string(),
  summary: z.string(),
  scopeType: payoffLedgerScopeTypeSchema,
  currentStatus: payoffLedgerStatusSchema,
  targetStartChapterOrder: z.number().int().nullable().optional(),
  targetEndChapterOrder: z.number().int().nullable().optional(),
  firstSeenChapterOrder: z.number().int().nullable().optional(),
  lastTouchedChapterOrder: z.number().int().nullable().optional(),
  lastTouchedChapterId: z.string().nullable().optional(),
  setupChapterId: z.string().nullable().optional(),
  payoffChapterId: z.string().nullable().optional(),
  lastSnapshotId: z.string().nullable().optional(),
  sourceRefs: z.array(runtimePayoffLedgerSourceRefSchema).default([]),
  evidence: z.array(runtimePayoffLedgerEvidenceSchema).default([]),
  riskSignals: z.array(runtimePayoffLedgerRiskSignalSchema).default([]),
  statusReason: z.string().nullable().optional(),
  confidence: z.number().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const runtimePayoffLedgerSummarySchema = z.object({
  totalCount: z.number().int().nonnegative(),
  pendingCount: z.number().int().nonnegative(),
  urgentCount: z.number().int().nonnegative(),
  overdueCount: z.number().int().nonnegative(),
  paidOffCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  updatedAt: z.string().nullable().optional(),
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

export const runtimeStyleContractSectionSchema = z.object({
  key: styleContractSectionKeySchema,
  title: z.string(),
  summary: z.string().nullable().optional(),
  lines: z.array(z.string()).default([]),
  text: z.string(),
  hasContent: z.boolean(),
});

export const runtimeStyleContractSchema = z.object({
  narrative: runtimeStyleContractSectionSchema,
  character: runtimeStyleContractSectionSchema,
  language: runtimeStyleContractSectionSchema,
  rhythm: runtimeStyleContractSectionSchema,
  antiAi: runtimeStyleContractSectionSchema,
  selfCheck: runtimeStyleContractSectionSchema,
  meta: z.object({
    effectiveStyleProfileId: z.string().nullable().optional(),
    taskStyleProfileId: z.string().nullable().optional(),
    activeSourceTargets: z.array(styleBindingTargetTypeSchema).default([]),
    activeSourceLabels: z.array(z.string()).default([]),
    writerIncludedSections: z.array(styleContractSectionKeySchema).default([]),
    plannerIncludedSections: z.array(styleContractSectionKeySchema).default([]),
    droppedSections: z.array(styleContractSectionKeySchema).default([]),
    maturity: styleContractMaturitySchema,
    usesGlobalAntiAiBaseline: z.boolean(),
    globalAntiAiRuleIds: z.array(z.string()).default([]),
    styleAntiAiRuleIds: z.array(z.string()).default([]),
  }),
});

export const runtimeCompiledStylePromptBlocksSchema = z.object({
  context: z.string(),
  style: z.string(),
  character: z.string(),
  antiAi: z.string(),
  output: z.string(),
  selfCheck: z.string(),
  contract: runtimeStyleContractSchema,
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
  effectiveStyleProfileId: z.string().nullable().optional(),
  taskStyleProfileId: z.string().nullable().optional(),
  activeSourceTargets: z.array(styleBindingTargetTypeSchema).default([]),
  activeSourceLabels: z.array(z.string()).default([]),
  maturity: styleContractMaturitySchema.optional(),
  usesGlobalAntiAiBaseline: z.boolean().optional(),
  globalAntiAiRuleIds: z.array(z.string()).default([]),
  styleAntiAiRuleIds: z.array(z.string()).default([]),
  sanitizedGenerationProfile: z.object({
    writingGuidance: z.array(z.string()).default([]),
    forbiddenEntities: z.array(z.string()).default([]),
    sourceProfileNames: z.array(z.string()).default([]),
    sanitizedAt: z.string(),
    strategy: z.enum(["deterministic", "llm"]),
  }).nullable().optional(),
});

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
export type RuntimeCreativeDecision = z.infer<typeof runtimeCreativeDecisionSchema>;
export type RuntimeAuditIssue = z.infer<typeof runtimeAuditIssueSchema>;
export type RuntimeStateSnapshot = z.infer<typeof runtimeStateSnapshotSchema>;
export type RuntimeOpenConflict = z.infer<typeof runtimeOpenConflictSchema>;
export type RuntimeContinuation = z.infer<typeof runtimeContinuationSchema>;
export type RuntimeStyleContractSection = z.infer<typeof runtimeStyleContractSectionSchema>;
export type RuntimeStyleContract = z.infer<typeof runtimeStyleContractSchema>;
export type RuntimeCompiledStylePromptBlocks = z.infer<typeof runtimeCompiledStylePromptBlocksSchema>;
export type RuntimeStyleBinding = z.infer<typeof runtimeStyleBindingSchema>;
export type RuntimeStyleContext = z.infer<typeof runtimeStyleContextSchema>;
export type RuntimePayoffLedgerSourceRef = z.infer<typeof runtimePayoffLedgerSourceRefSchema>;
export type RuntimePayoffLedgerEvidence = z.infer<typeof runtimePayoffLedgerEvidenceSchema>;
export type RuntimePayoffLedgerRiskSignal = z.infer<typeof runtimePayoffLedgerRiskSignalSchema>;
export type RuntimePayoffLedgerItem = z.infer<typeof runtimePayoffLedgerItemSchema>;
export type RuntimePayoffLedgerSummary = z.infer<typeof runtimePayoffLedgerSummarySchema>;
export type RuntimeCharacterResourceContext = z.infer<typeof characterResourceContextSchema>;
export type RuntimeCharacterCandidate = z.infer<typeof runtimeCharacterCandidateSchema>;
export type RuntimeCharacterVolumeAssignment = z.infer<typeof runtimeCharacterVolumeAssignmentSchema>;
export type RuntimeCharacterFactionTrack = z.infer<typeof runtimeCharacterFactionTrackSchema>;
export type RuntimeCharacterRelationStage = z.infer<typeof runtimeCharacterRelationStageSchema>;
export type RuntimeDynamicCharacterOverviewItem = z.infer<typeof runtimeDynamicCharacterOverviewItemSchema>;
export type RuntimeDynamicCharacterCurrentVolume = z.infer<typeof runtimeDynamicCharacterCurrentVolumeSchema>;
export type RuntimeDynamicCharacterOverview = z.infer<typeof runtimeDynamicCharacterOverviewSchema>;
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
export type RuntimeQualityScore = z.infer<typeof runtimeQualityScoreSchema>;
export type ChapterAcceptanceStatus = z.infer<typeof chapterAcceptanceStatusSchema>;
export type ChapterAcceptanceContinuePolicy = z.infer<typeof chapterAcceptanceContinuePolicySchema>;
export type ChapterAcceptanceRepairDirective = z.infer<typeof chapterAcceptanceRepairDirectiveSchema>;
export type ChapterAcceptanceRepairability = z.infer<typeof chapterAcceptanceRepairabilitySchema>;
export type ChapterAcceptanceAssetSyncRecommendation = z.infer<typeof chapterAcceptanceAssetSyncRecommendationSchema>;
export type RuntimeAuditReport = z.infer<typeof runtimeAuditReportSchema>;
export type ChapterRuntimePackage = z.infer<typeof chapterRuntimePackageSchema>;
export type RuntimeStyleDetectionViolation = z.infer<typeof styleDetectionViolationSchema>;
export type RuntimeStyleDetectionReport = z.infer<typeof styleDetectionReportSchema>;
export type RuntimeStyleReview = z.infer<typeof runtimeStyleReviewSchema>;
export type RuntimeSceneGenerationResult = z.infer<typeof runtimeSceneGenerationWithRoundsSchema>;
export type RuntimeSceneRoundResult = z.infer<typeof runtimeSceneRoundResultSchema>;
export type RuntimeLengthControl = z.infer<typeof runtimeLengthControlSchema>;
