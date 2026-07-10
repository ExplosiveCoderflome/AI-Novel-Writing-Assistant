import type { LLMProvider } from "./llm";
import type { NovelWorkflowStage } from "./novelWorkflow";
import type { DirectorCircuitBreakerState, DirectorQualityLoopBudgetNextAction } from "./novelDirector";

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
  "volume_beat_sheet",
  "volume_chapter_list",
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

export interface DirectorArtifactVersionRef {
  artifactId: string;
  version?: number | null;
}

export interface DirectorStepBlocker {
  code: string;
  reason: string;
  retryable?: boolean;
  nextAction?: string | null;
  evidence?: Record<string, unknown>;
}

export interface DirectorStepCompletionEvidence {
  stepId: string;
  completed: boolean;
  completenessRatio: number;
  evidence?: Record<string, unknown>;
  producedArtifacts?: DirectorArtifactRef[];
}

export interface DirectorRecoveryCursor {
  stepId: string;
  resumeFrom?: string | null;
  scope?: string | null;
  targetId?: string | null;
  evidence?: Record<string, unknown>;
}

export interface DirectorStepFactInspection {
  stepId: string;
  ready: boolean;
  completed: boolean;
  blockers: DirectorStepBlocker[];
  evidence?: Record<string, unknown>;
  producedArtifacts?: DirectorArtifactRef[];
  completenessRatio: number;
  nextAction?: string | null;
  resumeFrom?: string | null;
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

export type DirectorUsageAttributionStatus =
  | "step_attributed"
  | "task_only"
  | "unattributed";

export interface DirectorLlmUsageSummary {
  llmCallCount: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  durationMs?: number | null;
  lastRecordedAt?: string | null;
}

export interface DirectorLlmUsageRecordSummary extends DirectorLlmUsageSummary {
  id: string;
  novelId?: string | null;
  taskId?: string | null;
  runId?: string | null;
  chapterId?: string | null;
  volumeId?: string | null;
  stage?: string | null;
  itemKey?: string | null;
  scope?: string | null;
  entrypoint?: string | null;
  stepIdempotencyKey?: string | null;
  nodeKey?: string | null;
  promptAssetKey?: string | null;
  promptVersion?: string | null;
  modelRoute?: string | null;
  provider?: string | null;
  model?: string | null;
  status: string;
  attributionStatus: DirectorUsageAttributionStatus | string;
  recordedAt: string;
}

export interface DirectorStepUsageSummary extends DirectorLlmUsageSummary {
  stepIdempotencyKey: string;
  nodeKey: string;
  label?: string | null;
  status?: DirectorStepRunStatus | string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  attributionStatus: DirectorUsageAttributionStatus | string;
}

export interface DirectorPromptUsageSummary extends DirectorLlmUsageSummary {
  promptAssetKey: string;
  promptVersion?: string | null;
  nodeKey?: string | null;
  stepIdempotencyKey?: string | null;
  label?: string | null;
  attributionStatus: DirectorUsageAttributionStatus | string;
}

const DIRECTOR_NODE_DISPLAY_LABELS: Record<string, string> = {
  candidate_generation: "生成书级方向",
  candidate_refine: "细化书级方向",
  candidate_patch: "修正书级方向",
  candidate_title_refine: "优化书名",
  novel_create: "创建小说项目",
  takeover_execution: "接管已有项目",
  story_macro: "故事宏观规划",
  story_macro_phase: "故事宏观规划",
  book_contract: "书级创作约定",
  book_contract_phase: "书级创作约定",
  character_setup: "角色阵容准备",
  character_setup_phase: "角色阵容准备",
  volume_strategy: "分卷策略",
  volume_strategy_phase: "分卷策略",
  "volume_strategy.volume_generation": "生成分卷策略",
  structured_outline: "拆章与任务单",
  structured_outline_phase: "拆章与任务单",
  "structured_outline.beat_sheet": "生成节奏板",
  "structured_outline.chapter_list": "生成章节列表",
  "structured_outline.chapter_detail_bundle": "准备章节任务单",
  "structured_outline.chapter_sync": "同步章节执行资源",
  "book.candidate.generate": "生成书级方向",
  "book.candidate.refine": "细化书级方向",
  "book.candidate.patch": "修正书级方向",
  "book.candidate.title_refine": "优化书名",
  "book.project.create": "创建小说项目",
  "workflow.takeover.execute": "接管已有项目",
  "story.macro.plan": "故事宏观规划",
  "book.contract.create": "书级创作约定",
  "character.cast.prepare": "角色阵容准备",
  "volume.strategy.plan": "分卷策略",
  "chapter.task_sheet.plan": "拆章与任务单",
  chapter_execution: "章节执行流程",
  chapter_execution_node: "章节执行流程",
  chapter_quality_review: "章节质量检查",
  chapter_quality_review_node: "章节质量检查",
  chapter_repair: "章节问题修复",
  chapter_repair_node: "章节问题修复",
  quality_repair: "章节质量修复",
  chapter_state_commit: "更新章节状态",
  chapter_state_commit_node: "更新章节状态",
  payoff_ledger_sync: "同步伏笔与读者承诺",
  payoff_ledger_sync_node: "同步伏笔与读者承诺",
  character_resource_sync: "同步角色状态",
  character_resource_sync_node: "同步角色状态",
  "chapter.draft.write": "章节正文生成",
  "planner.chapter.plan": "章节规划",
  "novel.chapter.writer": "章节正文生成",
  "audit.chapter.light": "基础质量检查",
  "audit.chapter.full": "完整质量检查",
  "novel.review.patch": "局部文本修复",
  "style.detection": "风格检查",
  "style.rewrite": "风格调整",
  "novel.payoff_ledger.sync": "伏笔与读者承诺同步",
  "novel.characterDynamics.chapterExtract": "角色动态同步",
  "novel.character_resource.extract_updates": "角色资源同步",
  "state.snapshot.extract": "章节状态同步",
  "chapter.quality.review": "章节质量检查",
  "chapter.draft.repair": "章节问题修复",
  "chapter.state.commit": "更新章节状态",
  "payoff.ledger.sync": "同步伏笔与读者承诺",
  "character.resource.sync": "同步角色状态",
  "planner.replan": "调整后续章节规划",
};

function looksLikeDirectorInternalKey(value: string): boolean {
  return /^[a-z][a-z0-9]*(?:[._:][a-z0-9]+)+$/.test(value);
}

export function getDirectorNodeDisplayLabel(input: {
  label?: string | null;
  nodeKey?: string | null;
  fallback?: string;
}): string {
  const label = input.label?.trim() ?? "";
  const nodeKey = input.nodeKey?.trim() ?? "";
  const mappedLabel = label ? DIRECTOR_NODE_DISPLAY_LABELS[label] : null;
  if (mappedLabel) {
    return mappedLabel;
  }
  const mappedNode = nodeKey ? DIRECTOR_NODE_DISPLAY_LABELS[nodeKey] : null;
  if (mappedNode) {
    return mappedNode;
  }
  if (label && !looksLikeDirectorInternalKey(label)) {
    return label;
  }
  return input.fallback ?? "AI 推进步骤";
}

export type DirectorEventType =
  | "run_started"
  | "run_resumed"
  | "node_started"
  | "node_heartbeat"
  | "node_completed"
  | "node_failed"
  | "artifact_indexed"
  | "workspace_analyzed"
  | "run_cancelled"
  | "policy_changed"
  | "approval_required"
  | "quality_issue_found"
  | "quality_loop_assessed"
  | "repair_ticket_created"
  | "replan_run_created"
  | "pending_review_auto_promotion"
  | "circuit_breaker_opened"
  | "circuit_breaker_reset"
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
  gateType: "none" | "approval" | "blocked_scope";
  reason: string;
  mayOverwriteUserContent: boolean;
  affectedArtifacts: string[];
  riskTags: Array<
    | "suggest_only"
    | "protected_user_content"
    | "default_approval"
    | "expensive_review"
    | "downstream_recompute"
    | "large_scope_auto_run"
    | "quality_repair"
    | "quality_manual_repair"
    | "quality_blocked_scope"
    | "continue_with_risk"
  >;
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
  usage?: DirectorLlmUsageSummary | null;
}

export type DirectorAutopilotRecoveryDecision =
  | "continue"
  | "auto_repair_chapter"
  | "auto_rewrite_chapter"
  | "auto_replan_window"
  | "auto_resume_from_checkpoint"
  | "defer_and_continue"
  | "requires_manual_recovery";

export interface DirectorRuntimeProgressBreakdown {
  planningProgress: number;
  chapterProgress: number;
  qualityProgress: number;
  activeJobProgress: number;
  planningPercent: number;
  chapterExecutionPercent: number;
  qualityRepairPercent: number;
  totalPercent: number;
  completedSteps: number;
  totalSteps: number;
  draftedChapters: number;
  continuableChapters: number;
  totalChapters: number;
  pendingRepairChapters: number;
  explanation: string;
}

export interface DirectorRuntimeVisibleRiskBadge {
  label: string;
  level: "info" | "warning" | "danger";
  source?: "status" | "artifact" | "event" | "policy";
}

export interface DirectorRuntimeQualityDebtSummary {
  deferredChapterCount: number;
  deferredChapterOrders: number[];
  latestReason?: string | null;
}

export interface DirectorRuntimeQualityBudgetSummary {
  currentChapterId?: string | null;
  currentChapterOrder?: number | null;
  latestSignatureKey?: string | null;
  latestIssueSignature?: string | null;
  latestReason?: string | null;
  patchRepairUsed: number;
  chapterRewriteUsed: number;
  windowReplanUsed: number;
  deferredCount: number;
  nextAction: DirectorQualityLoopBudgetNextAction;
  nextActionLabel: string;
  explanation: string;
}

export interface DirectorOutlineFactSummary {
  beatSheetReady: boolean;
  chapterListReady: boolean;
  beatChapterListReady?: boolean;
  volumeChapterListComplete?: boolean;
  chapterDetailReady: boolean;
  plannedChapterCount: number;
  selectedChapterCount: number;
  completedDetailSteps: number;
  totalDetailSteps: number;
  syncedChapterCount: number;
}

export interface DirectorChapterExecutionFactSummary {
  totalChapters: number;
  draftedChapterCount: number;
  reviewedChapterCount: number;
  approvedChapterCount: number;
  committedChapterCount: number;
  completedChapters: number;
  needsRepairChapters: number;
  ratio: number;
  expectedChapterCount?: number | null;
}

export interface DirectorRepairFactSummary {
  draftedChapterCount: number;
  reviewedChapterCount: number;
  committedChapterCount: number;
  needsRepairChapters: number;
  payoffArtifactCount: number;
  characterResourceArtifactCount: number;
}

export interface DirectorTaskFactSummaryStep {
  stepId: string;
  label: string;
  stage: string;
  completed: boolean;
  completenessRatio: number;
  evidence?: Record<string, unknown>;
  nextAction?: string | null;
}

export interface DirectorTaskFactSummary {
  allStepsCompleted: boolean;
  completedStepCount: number;
  totalStepCount: number;
  currentFactStepId?: string | null;
  currentFactStepLabel?: string | null;
  currentFactEvidence?: Record<string, unknown> | null;
  hasNovelProject: boolean;
  hasStoryMacro: boolean;
  hasBookContract: boolean;
  characterCount: number;
  hasVolumeStrategy: boolean;
  volumeCount: number;
  outlineFacts: DirectorOutlineFactSummary;
  chapterExecutionFacts: DirectorChapterExecutionFactSummary;
  repairFacts: DirectorRepairFactSummary;
  steps: DirectorTaskFactSummaryStep[];
}

export type ChapterExecutionProgressStage =
  | "execution_contract_ready"
  | "context_package_ready"
  | "draft_started"
  | "draft_saved"
  | "audit_completed"
  | "repair_completed_or_not_needed"
  | "runtime_package_saved"
  | "chapter_artifacts_synced"
  | "chapter_state_committed"
  | "reviewable_or_approved";

export interface DirectorChapterExecutionProgressItem {
  chapterId: string;
  chapterOrder: number;
  status: string;
  currentStage: ChapterExecutionProgressStage;
  completedStages: ChapterExecutionProgressStage[];
  missingStages: ChapterExecutionProgressStage[];
  recoverable: boolean;
  nextAction: string;
}

export interface DirectorChapterExecutionProgressSummary {
  totalChapters: number;
  draftedChapterCount: number;
  approvedChapterCount: number;
  completedChapters: number;
  needsRepairChapters: number;
  activeChapterId?: string | null;
  activeChapterOrder?: number | null;
  currentChapterId?: string | null;
  currentChapterOrder?: number | null;
  currentStage?: ChapterExecutionProgressStage | null;
  recoverableRange?: {
    startOrder: number | null;
    endOrder: number | null;
  };
  ratio: number;
  chapters?: DirectorChapterExecutionProgressItem[];
}

export interface DirectorRuntimeProjection {
  runId: string;
  novelId?: string | null;
  status: DirectorRuntimeProjectionStatus;
  runtimeId?: string | null;
  runtimeStatus?: string | null;
  currentAction?: string | null;
  waitingReason?: string | null;
  activeExecution?: {
    executionId: string;
    stepType: string;
    resourceClass?: string | null;
    workerId?: string | null;
    slotId?: string | null;
    status: string;
    startedAt?: string | null;
    leaseExpiresAt?: string | null;
  } | null;
  resourceClass?: string | null;
  checkpointSummary?: string | null;
  nextAutomaticAction?: string | null;
  workerHealth?: DirectorWorkerHealthSummary | null;
  currentNodeKey?: string | null;
  currentLabel?: string | null;
  currentFactStepId?: string | null;
  currentFactStepLabel?: string | null;
  currentFactEvidence?: Record<string, unknown> | null;
  factSummary?: DirectorTaskFactSummary | null;
  headline?: string | null;
  detail?: string | null;
  lastEventSummary?: string | null;
  requiresUserAction: boolean;
  blockedReason?: string | null;
  blockingReason?: string | null;
  nextActionLabel?: string | null;
  recommendedAction?: DirectorNextAction | null;
  recoveryDecision?: DirectorAutopilotRecoveryDecision;
  isAutopilotRecoverable?: boolean;
  scopeSummary?: string | null;
  progressSummary?: string | null;
  progressBreakdown?: DirectorRuntimeProgressBreakdown;
  chapterExecutionProgress?: DirectorChapterExecutionProgressSummary | null;
  visibleRiskBadges?: DirectorRuntimeVisibleRiskBadge[];
  rootCauseCode?: "none" | "draft_generation_failed" | "draft_obligation_unmet" | "draft_repair_exhausted" | "replan_required" | null;
  blockingObligations?: Array<{
    kind: "must_hit_now" | "must_preserve" | "payoff_touch" | "character_appearance" | "goal_change" | "forbidden_crossing";
    summary: string;
    evidence?: string | null;
  }>;
  qualityDebtSummary?: DirectorRuntimeQualityDebtSummary | null;
  qualityBudgetSummary?: DirectorRuntimeQualityBudgetSummary | null;
  policyMode: DirectorPolicyMode;
  updatedAt: string;
  recentEvents: DirectorRuntimeProjectionEvent[];
  usageSummary?: DirectorLlmUsageSummary | null;
  recentUsage?: DirectorLlmUsageRecordSummary[];
  stepUsage?: DirectorStepUsageSummary[];
  promptUsage?: DirectorPromptUsageSummary[];
  circuitBreaker?: DirectorCircuitBreakerState | null;
}

export interface DirectorRuntimeEventHistoryResponse {
  events: DirectorRuntimeProjectionEvent[];
  totalCount: number;
  limit: number;
}

export type DirectorBookAutomationStatus =
  | "idle"
  | "queued"
  | "running"
  | "waiting_approval"
  | "waiting_recovery"
  | "blocked"
  | "failed"
  | "cancelled"
  | "completed";

export type DirectorBookAutomationDisplayState =
  | "processing"
  | "needs_confirmation"
  | "paused"
  | "needs_attention"
  | "completed"
  | "idle";

export type DirectorBookAutomationActionType =
  | "open_novel"
  | "open_details"
  | "continue"
  | "auto_execute_range"
  | "confirm_candidate"
  | "open_chapter"
  | "open_quality_repair"
  | "retry"
  | "cancel";

export interface DirectorBookAutomationActionTarget {
  novelId?: string | null;
  taskId?: string | null;
  chapterId?: string | null;
  tab?: "basic" | "story_macro" | "outline" | "structured" | "chapter" | "pipeline" | "character" | "history" | null;
  href?: string | null;
}

export interface DirectorBookAutomationAction {
  type: DirectorBookAutomationActionType;
  label: string;
  target: DirectorBookAutomationActionTarget;
  commandPayload?: {
    taskId?: string | null;
    continuationMode?: "resume" | "auto_execute_range" | null;
  } | null;
  emphasis?: "primary" | "secondary" | "destructive";
}

export interface DirectorBookAutomationFocusNovel {
  id: string;
  title: string;
  href: string;
}

export type DirectorBookAutomationTimelineItemType =
  | "task"
  | "command"
  | "step"
  | "event"
  | "approval"
  | "usage";

export interface DirectorBookAutomationTimelineItem {
  id: string;
  type: DirectorBookAutomationTimelineItemType;
  title: string;
  detail?: string | null;
  status?: string | null;
  taskId?: string | null;
  runId?: string | null;
  nodeKey?: string | null;
  commandType?: DirectorRunCommandType | string | null;
  artifactType?: DirectorArtifactType | string | null;
  severity?: DirectorEvent["severity"];
  durationMs?: number | null;
  usage?: DirectorLlmUsageSummary | null;
  attributionStatus?: DirectorUsageAttributionStatus | string | null;
  occurredAt: string;
}

export interface DirectorBookAutomationTaskSummary {
  id: string;
  title: string;
  status: string;
  progress: number;
  currentStage?: string | null;
  currentItemKey?: string | null;
  currentItemLabel?: string | null;
  checkpointType?: string | null;
  checkpointSummary?: string | null;
  pendingManualRecovery: boolean;
  lastError?: string | null;
  updatedAt: string;
}

export interface DirectorBookAutomationArtifactSummary {
  activeCount: number;
  staleCount: number;
  protectedUserContentCount: number;
  repairTicketCount: number;
  dependencyCount?: number;
  affectedChapterCount?: number;
  affectedChapterIds?: string[];
  byType?: DirectorBookAutomationArtifactTypeSummary[];
  recentArtifacts?: DirectorBookAutomationRecentArtifact[];
  recentStaleArtifacts?: DirectorBookAutomationRecentArtifact[];
  recentRepairArtifacts?: DirectorBookAutomationRecentArtifact[];
  recentVersionedArtifacts?: DirectorBookAutomationRecentArtifact[];
}

export interface DirectorBookAutomationArtifactTypeSummary {
  artifactType: DirectorArtifactType | string;
  totalCount: number;
  activeCount: number;
  staleCount: number;
  protectedUserContentCount: number;
  dependencyCount: number;
  latestUpdatedAt?: string | null;
}

export interface DirectorBookAutomationRecentArtifact {
  id: string;
  artifactType: DirectorArtifactType | string;
  targetType: DirectorArtifactTargetType | string;
  targetId?: string | null;
  status: DirectorArtifactStatus | string;
  source?: DirectorArtifactSource | string | null;
  version?: number | null;
  protectedUserContent?: boolean | null;
  dependencyCount: number;
  contentHash?: string | null;
  updatedAt?: string | null;
}

export type DirectorWorkerDerivedState =
  | "idle"
  | "queued_waiting_worker"
  | "leased_starting"
  | "running_step"
  | "waiting_gate"
  | "auto_recovering"
  | "cancelled"
  | "failed_recoverable"
  | "failed_hard"
  | "succeeded";

export type DirectorWorkerNextAction =
  | "none"
  | "wait_for_worker"
  | "wait_for_lease_start"
  | "continue_running"
  | "recover_stale_command"
  | "requires_user_action";

export interface DirectorWorkerHealthSummary {
  derivedState: DirectorWorkerDerivedState;
  message?: string | null;
  queuedCommandCount: number;
  leasedCommandCount: number;
  runningCommandCount: number;
  staleCommandCount: number;
  oldestQueuedAt?: string | null;
  oldestQueuedWaitMs?: number | null;
  currentCommandId?: string | null;
  currentCommandType?: DirectorRunCommandType | string | null;
  currentWorkerId?: string | null;
  currentSlotId?: string | null;
  currentExecutionId?: string | null;
  currentExecutionStatus?: string | null;
  currentLeaseExpiresAt?: string | null;
  blockedReason?: string | null;
  lastErrorMessage?: string | null;
  nextAction?: DirectorWorkerNextAction;
  lastCommandAt?: string | null;
}

export interface DirectorBookAutomationProjection {
  novelId: string;
  focusNovel: DirectorBookAutomationFocusNovel;
  latestTask?: DirectorBookAutomationTaskSummary | null;
  latestRunId?: string | null;
  status: DirectorBookAutomationStatus;
  displayState: DirectorBookAutomationDisplayState;
  runMode?: string | null;
  policyMode?: DirectorPolicyMode | null;
  headline: string;
  userHeadline: string;
  detail?: string | null;
  userReason?: string | null;
  currentStage?: string | null;
  currentLabel?: string | null;
  requiresUserAction: boolean;
  blockedReason?: string | null;
  nextActionLabel?: string | null;
  primaryAction?: DirectorBookAutomationAction | null;
  secondaryActions?: DirectorBookAutomationAction[];
  automationSummary?: string | null;
  progressSummary?: string | null;
  artifactSummary: DirectorBookAutomationArtifactSummary;
  usageSummary?: DirectorLlmUsageSummary | null;
  recentUsage?: DirectorLlmUsageRecordSummary[];
  stepUsage?: DirectorStepUsageSummary[];
  promptUsage?: DirectorPromptUsageSummary[];
  circuitBreaker?: DirectorCircuitBreakerState | null;
  workerHealth?: DirectorWorkerHealthSummary | null;
  activeCommandCount: number;
  pendingCommandCount: number;
  autoApprovalRecordCount: number;
  latestEventAt?: string | null;
  updatedAt: string;
  dashboardView?: DirectorDashboardView | null;
  runtimeProjection?: DirectorRuntimeProjection | null;
  timeline: DirectorBookAutomationTimelineItem[];
}

export interface DirectorBookAutomationProjectionResponse {
  projection: DirectorBookAutomationProjection;
}

export interface DirectorRuntimeSnapshotResponse {
  snapshot: DirectorRuntimeSnapshot | null;
  projection?: DirectorRuntimeProjection | null;
}

export interface DirectorTaskShell {
  id: string;
  novelId?: string | null;
  status: string;
  currentStage?: string | null;
  currentItemKey?: string | null;
  currentItemLabel?: string | null;
  progress?: number | null;
  checkpointType?: string | null;
  checkpointSummary?: string | null;
  lastError?: string | null;
  pendingManualRecovery?: boolean | null;
  cancelRequestedAt?: string | null;
}

export type DirectorDisplayStageKey =
  | "project_setup"
  | "story_planning"
  | "character_setup"
  | "volume_strategy"
  | "structured_outline"
  | "chapter_execution"
  | "quality_repair";

export type DirectorDisplayMode =
  | "idle"
  | "running"
  | "waiting"
  | "needs_recovery"
  | "failed"
  | "completed";

export type DirectorDisplayStepStatus =
  | "pending"
  | "running"
  | "completed"
  | "attention";

export interface DirectorDisplayStep {
  key: DirectorDisplayStageKey;
  label: string;
  status: DirectorDisplayStepStatus;
  isCurrent: boolean;
}

export interface DirectorDisplayState {
  stageKey: DirectorDisplayStageKey;
  stageLabel: string;
  stepIndex: number;
  totalSteps: number;
  mode: DirectorDisplayMode;
  headline: string;
  description: string;
  currentAction: string;
  checkpointLabel: string;
  progressPercent: number;
  nextActionLabel?: string | null;
  currentFactStepId?: string | null;
  currentFactStepLabel?: string | null;
  currentFactDescription?: string | null;
  requiresUserAction: boolean;
  isLiveRunning: boolean;
  needsRecovery: boolean;
  steps: DirectorDisplayStep[];
}

export type DirectorDashboardMode =
  | "idle"
  | "queued"
  | "running"
  | "waiting_user"
  | "recovering"
  | "failed"
  | "completed";

export type DirectorDashboardProgressSource =
  | "task_live"
  | "worker_live"
  | "chapter_facts"
  | "checkpoint"
  | "runtime_projection"
  | "fallback";

export type DirectorDashboardActionType =
  | "confirm_and_continue"
  | "background_continue"
  | "open_task_center"
  | "resume_from_checkpoint"
  | "retry";

export interface DirectorDashboardAction {
  type: DirectorDashboardActionType;
  label: string;
  emphasis: "primary" | "secondary" | "destructive";
}

export interface DirectorDashboardDiagnostic {
  code: string;
  label: string;
  detail?: string | null;
  level: "info" | "warning" | "danger";
  source: "task" | "projection" | "facts" | "worker" | "artifact";
}

export interface DirectorDashboardSourceTrace {
  taskStatus?: string | null;
  projectionStatus?: DirectorRuntimeProjectionStatus | null;
  commandStatus?: string | null;
  activeStepStatus?: string | null;
  checkpointType?: string | null;
  progressSource: DirectorDashboardProgressSource;
}

export interface DirectorDashboardView {
  mode: DirectorDashboardMode;
  statusLabel: string;
  headline: string;
  description: string;
  currentAction: string | null;
  progressPercent: number;
  progressSource: DirectorDashboardProgressSource;
  requiresUserAction: boolean;
  userActionReason?: string | null;
  primaryAction?: DirectorDashboardAction | null;
  secondaryActions: DirectorDashboardAction[];
  stageKey: DirectorDisplayStageKey;
  stageLabel: string;
  stepIndex: number;
  totalSteps: number;
  steps: DirectorDisplayStep[];
  diagnostics: DirectorDashboardDiagnostic[];
  sourceTrace: DirectorDashboardSourceTrace;
}

export interface DirectorTaskSnapshot {
  task: DirectorTaskShell;
  run: {
    id: string;
    novelId?: string | null;
    entrypoint?: string | null;
  } | null;
  activeStep: {
    idempotencyKey: string;
    nodeKey: string;
    label: string;
    status: string;
  } | null;
  latestCommand: {
    id: string;
    commandType: string;
    status: string;
  } | null;
  runtime: DirectorRuntimeSnapshot | null;
  projection: DirectorRuntimeProjection | null;
  recentEvents: DirectorEvent[];
  artifacts: DirectorArtifactRef[];
  currentFactStepId?: string | null;
  currentFactStepLabel?: string | null;
  currentFactEvidence?: Record<string, unknown> | null;
  factSummary?: DirectorTaskFactSummary | null;
  chapterProgress?: DirectorChapterExecutionProgressSummary | null;
  displayState: DirectorDisplayState;
  dashboardView: DirectorDashboardView;
  nextActions: string[];
}

export interface DirectorTaskSnapshotResponse {
  snapshot: DirectorTaskSnapshot | null;
}

export interface DirectorTaskFactInspectionStep {
  stepId: string;
  label: string;
  stage: string;
  targetType: DirectorArtifactTargetType;
  ready: boolean;
  completed: boolean;
  completenessRatio: number;
  nextAction?: string | null;
  resumeFrom?: string | null;
  blockers: DirectorStepBlocker[];
  evidence?: Record<string, unknown>;
  producedArtifacts?: DirectorArtifactRef[];
  progress?: {
    status: string;
    ratio: number;
    label: string;
    nextAction?: string | null;
    evidence?: Record<string, unknown>;
  } | null;
  inspectError?: string | null;
  isCurrentFactStep?: boolean;
  isActiveRuntimeStep?: boolean;
}

export interface DirectorTaskFactInspection {
  taskId: string;
  novelId?: string | null;
  currentFactStepId?: string | null;
  currentFactStepLabel?: string | null;
  currentFactEvidence?: Record<string, unknown> | null;
  factSummary?: DirectorTaskFactSummary | null;
  steps: DirectorTaskFactInspectionStep[];
}

export interface DirectorTaskFactInspectionResponse {
  inspection: DirectorTaskFactInspection | null;
}

export const DIRECTOR_RUN_COMMAND_TYPES = [
  "generate_candidates",
  "refine_candidates",
  "patch_candidate",
  "refine_titles",
  "confirm_candidate",
  "continue",
  "resume_from_checkpoint",
  "retry",
  "takeover",
  "approve_gate",
  "policy_update",
  "workspace_analysis",
  "manual_edit_impact",
  "calibrate_step",
  "accept_manual_changes_and_continue",
  "repair_chapter_titles",
  "cancel",
] as const;

export type DirectorRunCommandType = typeof DIRECTOR_RUN_COMMAND_TYPES[number];

export const DIRECTOR_RUN_COMMAND_STATUSES = [
  "queued",
  "leased",
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "stale",
] as const;

export type DirectorRunCommandStatus = typeof DIRECTOR_RUN_COMMAND_STATUSES[number];

export interface DirectorCommandAcceptedResponse {
  commandId: string;
  taskId: string;
  novelId?: string | null;
  commandType: DirectorRunCommandType;
  status: DirectorRunCommandStatus;
  leaseExpiresAt?: string | null;
  runtimeId?: string | null;
  runtimeStatus?: string | null;
  projectionUrl?: string | null;
}

export interface DirectorCommandResultResponse<T = unknown> {
  commandId: string;
  taskId: string;
  commandType: DirectorRunCommandType | string;
  status: DirectorRunCommandStatus | string;
  result?: T | null;
  errorMessage?: string | null;
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
