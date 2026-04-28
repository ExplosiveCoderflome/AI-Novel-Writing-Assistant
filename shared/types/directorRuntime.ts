import type { LLMProvider } from "./llm";
import type { NovelWorkflowStage } from "./novelWorkflow";

export const DIRECTOR_POLICY_MODES = [
  "suggest_only",
  "run_next_step",
  "run_until_gate",
  "auto_safe_scope",
] as const;

export type DirectorPolicyMode = typeof DIRECTOR_POLICY_MODES[number];

export const DIRECTOR_ARTIFACT_TYPES = [
  "book_contract",
  "story_macro",
  "character_cast",
  "volume_strategy",
  "chapter_task_sheet",
  "chapter_draft",
  "audit_report",
  "repair_ticket",
  "reader_promise",
  "character_governance_state",
  "world_skeleton",
  "source_knowledge_pack",
  "chapter_retention_contract",
  "continuity_state",
  "rolling_window_review",
] as const;

export type DirectorArtifactType = typeof DIRECTOR_ARTIFACT_TYPES[number];

export type DirectorArtifactTargetType = "novel" | "volume" | "chapter" | "global";

export type DirectorArtifactStatus = "draft" | "active" | "superseded" | "stale" | "rejected";

export type DirectorArtifactSource =
  | "ai_generated"
  | "user_edited"
  | "auto_repaired"
  | "imported"
  | "backfilled";

export interface DirectorArtifactRef {
  id: string;
  novelId: string;
  runId?: string | null;
  artifactType: DirectorArtifactType;
  targetType: DirectorArtifactTargetType;
  targetId?: string | null;
  version: number;
  status: DirectorArtifactStatus;
  source: DirectorArtifactSource;
  contentRef: {
    table: string;
    id: string;
  };
  contentHash?: string | null;
  schemaVersion: string;
  promptAssetKey?: string | null;
  promptVersion?: string | null;
  modelRoute?: string | null;
  sourceStepRunId?: string | null;
  protectedUserContent?: boolean | null;
  dependsOn?: Array<{
    artifactId: string;
    version?: number | null;
  }>;
  updatedAt?: string | null;
}

export type DirectorStepRunStatus =
  | "running"
  | "succeeded"
  | "failed"
  | "skipped"
  | "waiting_approval"
  | "blocked_scope";

export interface DirectorStepRun {
  idempotencyKey: string;
  nodeKey: string;
  label: string;
  status: DirectorStepRunStatus;
  targetType?: DirectorArtifactTargetType | null;
  targetId?: string | null;
  startedAt: string;
  finishedAt?: string | null;
  error?: string | null;
  producedArtifacts?: DirectorArtifactRef[];
  policyDecision?: DirectorPolicyDecision | null;
}

export type DirectorEventType =
  | "run_started"
  | "run_resumed"
  | "node_started"
  | "node_completed"
  | "node_failed"
  | "artifact_indexed"
  | "workspace_analyzed"
  | "policy_changed"
  | "approval_required"
  | "quality_issue_found"
  | "repair_ticket_created"
  | "continue_with_risk";

export interface DirectorEvent {
  eventId: string;
  type: DirectorEventType;
  taskId?: string | null;
  novelId?: string | null;
  nodeKey?: string | null;
  artifactId?: string | null;
  artifactType?: DirectorArtifactType | null;
  summary: string;
  affectedScope?: string | null;
  severity?: "low" | "medium" | "high" | null;
  occurredAt: string;
  metadata?: Record<string, unknown>;
}

export interface DirectorPolicyDecision {
  canRun: boolean;
  requiresApproval: boolean;
  reason: string;
  mayOverwriteUserContent: boolean;
  affectedArtifacts: string[];
  autoRetryBudget: number;
  onQualityFailure: "repair_once" | "pause_for_manual" | "continue_with_risk" | "block_scope";
}

export type DirectorQualityGateResult =
  | { status: "passed" }
  | { status: "repairable"; repairPlanId: string; autoRetryAllowed: true; affectedScope?: string | null }
  | { status: "needs_manual_repair"; issueIds: string[]; affectedScope: string }
  | { status: "continue_with_risk"; riskIds: string[]; affectedScope: string }
  | { status: "blocked_scope"; blockedScope: string; reason: string };

export interface DirectorRuntimePolicySnapshot {
  mode: DirectorPolicyMode;
  mayOverwriteUserContent: boolean;
  maxAutoRepairAttempts: 1;
  allowExpensiveReview: boolean;
  modelTier: "cheap_fast" | "balanced" | "high_quality";
  updatedAt: string;
}

export interface DirectorRuntimePolicyUpdateRequest {
  mode: DirectorPolicyMode;
  mayOverwriteUserContent?: boolean;
  allowExpensiveReview?: boolean;
  modelTier?: DirectorRuntimePolicySnapshot["modelTier"];
}

export interface DirectorRuntimePolicyUpdateResponse {
  snapshot: DirectorRuntimeSnapshot | null;
}

export type DirectorRuntimeProjectionStatus =
  | "idle"
  | "running"
  | "waiting_approval"
  | "blocked"
  | "failed"
  | "completed";

export interface DirectorRuntimeProjectionEvent {
  eventId: string;
  type: DirectorEventType;
  summary: string;
  nodeKey?: string | null;
  artifactType?: DirectorArtifactType | null;
  severity?: DirectorEvent["severity"];
  occurredAt: string;
}

export interface DirectorRuntimeProjection {
  runId: string;
  novelId?: string | null;
  status: DirectorRuntimeProjectionStatus;
  currentNodeKey?: string | null;
  currentLabel?: string | null;
  lastEventSummary?: string | null;
  requiresUserAction: boolean;
  blockedReason?: string | null;
  policyMode: DirectorPolicyMode;
  updatedAt: string;
  recentEvents: DirectorRuntimeProjectionEvent[];
}

export interface DirectorRuntimeSnapshotResponse {
  snapshot: DirectorRuntimeSnapshot | null;
  projection?: DirectorRuntimeProjection | null;
}

export interface DirectorWorkspaceAnalysisResponse {
  analysis: DirectorWorkspaceAnalysis;
}

export type DirectorManualEditImpactLevel = "none" | "low" | "medium" | "high";

export type DirectorManualEditRepairAction =
  | "continue_chapter_execution"
  | "review_recent_chapters"
  | "update_continuity_state"
  | "repair_scope"
  | "ask_user_confirmation";

export interface DirectorManualEditChangedChapter {
  chapterId: string;
  title: string;
  order: number;
  changedAt?: string | null;
  contentHash?: string | null;
  previousContentHash?: string | null;
  relatedArtifactIds: string[];
}

export interface DirectorManualEditRepairStep {
  action: DirectorManualEditRepairAction;
  label: string;
  reason: string;
  affectedScope?: string | null;
  requiresApproval: boolean;
}

export interface AiManualEditImpactDecision {
  impactLevel: DirectorManualEditImpactLevel;
  affectedArtifactIds: string[];
  minimalRepairPath: DirectorManualEditRepairStep[];
  safeToContinue: boolean;
  requiresApproval: boolean;
  summary: string;
  riskNotes: string[];
  evidenceRefs: string[];
  confidence: number;
}

export interface DirectorManualEditInventory {
  novelId: string;
  changedChapters: DirectorManualEditChangedChapter[];
  comparedAgainstTaskId?: string | null;
  generatedAt: string;
}

export interface DirectorManualEditImpact extends AiManualEditImpactDecision {
  novelId: string;
  changedChapters: DirectorManualEditChangedChapter[];
  affectedArtifacts: DirectorArtifactRef[];
  generatedAt: string;
  prompt?: {
    promptId: string;
    promptVersion: string;
    provider?: LLMProvider;
    model?: string;
  } | null;
}

export interface DirectorManualEditImpactResponse {
  impact: DirectorManualEditImpact;
}

export type DirectorProductionStage =
  | "empty"
  | "has_seed"
  | "has_contract"
  | "has_macro"
  | "has_characters"
  | "has_volume_plan"
  | "has_chapter_plan"
  | "has_drafts"
  | "needs_repair"
  | "unknown";

export type DirectorNextActionType =
  | "generate_candidates"
  | "create_book_contract"
  | "complete_story_macro"
  | "prepare_characters"
  | "build_volume_strategy"
  | "build_chapter_tasks"
  | "continue_chapter_execution"
  | "review_recent_chapters"
  | "repair_scope"
  | "ask_user_confirmation";

export interface DirectorNextAction {
  action: DirectorNextActionType;
  reason: string;
  affectedScope?: string | null;
  riskLevel: "low" | "medium" | "high";
}

export interface DirectorWorkspaceInventory {
  novelId: string;
  novelTitle: string;
  hasBookContract: boolean;
  hasStoryMacro: boolean;
  hasCharacters: boolean;
  hasVolumeStrategy: boolean;
  hasChapterPlan: boolean;
  chapterCount: number;
  draftedChapterCount: number;
  approvedChapterCount: number;
  pendingRepairChapterCount: number;
  hasActivePipelineJob: boolean;
  hasActiveDirectorRun: boolean;
  hasWorldBinding: boolean;
  hasSourceKnowledge: boolean;
  hasContinuationAnalysis: boolean;
  latestDirectorTaskId?: string | null;
  activeDirectorTaskId?: string | null;
  activePipelineJobId?: string | null;
  missingArtifactTypes: DirectorArtifactType[];
  staleArtifacts: DirectorArtifactRef[];
  protectedUserContentArtifacts: DirectorArtifactRef[];
  needsRepairArtifacts: DirectorArtifactRef[];
  artifacts: DirectorArtifactRef[];
}

export interface AiWorkspaceInterpretation {
  productionStage: DirectorProductionStage;
  missingArtifacts: DirectorArtifactType[];
  staleArtifacts: DirectorArtifactType[];
  protectedUserContent: string[];
  recommendedAction: DirectorNextAction;
  confidence: number;
  evidenceRefs: string[];
  summary: string;
  riskNotes: string[];
}

export interface DirectorWorkspaceAnalysis {
  novelId: string;
  inventory: DirectorWorkspaceInventory;
  interpretation?: AiWorkspaceInterpretation | null;
  manualEditImpact?: DirectorManualEditImpact | null;
  recommendation?: DirectorNextAction | null;
  confidence: number;
  evidenceRefs: string[];
  generatedAt: string;
  prompt?: {
    promptId: string;
    promptVersion: string;
    provider?: LLMProvider;
    model?: string;
  } | null;
}

export interface DirectorRuntimeSnapshot {
  schemaVersion: 1;
  runId: string;
  novelId?: string | null;
  entrypoint?: string | null;
  policy: DirectorRuntimePolicySnapshot;
  steps: DirectorStepRun[];
  events: DirectorEvent[];
  artifacts: DirectorArtifactRef[];
  lastWorkspaceAnalysis?: DirectorWorkspaceAnalysis | null;
  updatedAt: string;
}
