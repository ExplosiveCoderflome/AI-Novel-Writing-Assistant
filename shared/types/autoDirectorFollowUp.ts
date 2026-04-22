import type { NovelWorkflowCheckpoint } from "./novelWorkflow";
import type { TaskStatus, UnifiedTaskDetail } from "./task";

export const AUTO_DIRECTOR_FOLLOW_UP_REASONS = [
  "manual_recovery_required",
  "runtime_failed",
  "candidate_selection_required",
  "replan_required",
  "runtime_cancelled",
  "front10_execution_pending",
  "quality_repair_pending",
] as const;

export type AutoDirectorFollowUpReason = (typeof AUTO_DIRECTOR_FOLLOW_UP_REASONS)[number];

export type AutoDirectorFollowUpPriority = "P0" | "P1" | "P2";

export type AutoDirectorActionRiskLevel = "low" | "medium" | "high";

export type AutoDirectorMutationActionCode =
  | "continue_auto_execution"
  | "continue_generic"
  | "retry_with_task_model"
  | "retry_with_route_model";

export type AutoDirectorNavigationActionCode =
  | "go_replan"
  | "go_candidate_selection"
  | "open_detail"
  | "open_follow_up_center";

export type AutoDirectorActionCode = AutoDirectorMutationActionCode | AutoDirectorNavigationActionCode;

export interface AutoDirectorAction {
  code: AutoDirectorActionCode;
  kind: "mutation" | "navigation";
  label: string;
  riskLevel: AutoDirectorActionRiskLevel;
  requiresConfirm: boolean;
  executorActionCode?: AutoDirectorMutationActionCode;
  targetUrl?: string;
  deepLink?: string;
}

export interface AutoDirectorChannelCapabilities {
  dingtalk: boolean;
  wecom: boolean;
}

export interface AutoDirectorFollowUpResolverInput {
  status: TaskStatus;
  checkpointType?: NovelWorkflowCheckpoint | null;
  pendingManualRecovery?: boolean;
  executionScopeLabel?: string | null;
}

export interface AutoDirectorResolvedFollowUpReason {
  reason: AutoDirectorFollowUpReason;
  reasonLabel: string;
  priority: AutoDirectorFollowUpPriority;
  availableActions: AutoDirectorAction[];
  batchActionCodes: AutoDirectorMutationActionCode[];
  supportsBatch: boolean;
  channelCapabilities: AutoDirectorChannelCapabilities;
}

export const AUTO_DIRECTOR_CHANNEL_TYPES = ["dingtalk", "wecom"] as const;

export type AutoDirectorChannelType = (typeof AUTO_DIRECTOR_CHANNEL_TYPES)[number];

export type AutoDirectorCountersByReason = Record<AutoDirectorFollowUpReason, number>;

export interface AutoDirectorFollowUpItem {
  taskId: string;
  novelId: string | null;
  novelTitle: string;
  taskTitle: string;
  lane: "auto_director";
  status: TaskStatus;
  currentStage: string | null;
  checkpointType: NovelWorkflowCheckpoint | null;
  reason: AutoDirectorFollowUpReason;
  reasonLabel: string;
  priority: AutoDirectorFollowUpPriority;
  followUpSummary: string;
  blockingReason: string | null;
  executionScope: string | null;
  currentModel: string | null;
  availableActions: AutoDirectorAction[];
  batchActionCodes: AutoDirectorMutationActionCode[];
  supportsBatch: boolean;
  channelCapabilities: AutoDirectorChannelCapabilities;
  pendingManualRecovery: boolean;
  lastMilestoneAt: string | null;
  updatedAt: string;
}

export interface AutoDirectorFollowUpMilestone {
  label: string;
  at: string;
  status: TaskStatus;
  summary?: string | null;
}

export interface AutoDirectorFollowUpDetail {
  taskId: string;
  checkpointSummary: string | null;
  blockingReason: string | null;
  currentModel: string | null;
  riskNote: string | null;
  originDetailUrl: string;
  replanUrl: string | null;
  candidateSelectionUrl: string | null;
  availableActions: AutoDirectorAction[];
  milestones: AutoDirectorFollowUpMilestone[];
  task: UnifiedTaskDetail;
}

export interface AutoDirectorFollowUpOverview {
  totalCount: number;
  countersByReason: AutoDirectorCountersByReason;
}

export interface AutoDirectorFollowUpSummaryCounters {
  recoveredToday: number;
  completedToday: number;
}

export interface AutoDirectorFollowUpAvailableFilters {
  reasons: AutoDirectorFollowUpReason[];
  statuses: TaskStatus[];
  channelTypes: AutoDirectorChannelType[];
}

export interface AutoDirectorFollowUpPagination {
  page: number;
  pageSize: number;
  total: number;
}

export interface AutoDirectorFollowUpListResponse {
  items: AutoDirectorFollowUpItem[];
  countersByReason: AutoDirectorCountersByReason;
  summaryCounters: AutoDirectorFollowUpSummaryCounters;
  availableFilters: AutoDirectorFollowUpAvailableFilters;
  pagination: AutoDirectorFollowUpPagination;
}

export interface AutoDirectorFollowUpListInput {
  reason?: AutoDirectorFollowUpReason;
  status?: TaskStatus;
  novelId?: string;
  supportsBatch?: boolean;
  channelType?: AutoDirectorChannelType;
  page?: number;
  pageSize?: number;
}

export interface AutoDirectorActionRequest {
  taskId: string;
  actionCode: AutoDirectorMutationActionCode;
  source: "web" | "dingtalk" | "wecom";
  operatorId: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}

export const AUTO_DIRECTOR_ACTION_RESULT_CODES = [
  "executed",
  "already_processed",
  "state_changed",
  "forbidden",
  "failed",
] as const;

export type AutoDirectorActionResultCode = (typeof AUTO_DIRECTOR_ACTION_RESULT_CODES)[number];

export interface AutoDirectorActionExecutionResult {
  taskId: string;
  actionCode: AutoDirectorMutationActionCode;
  code: AutoDirectorActionResultCode;
  message: string;
  task?: UnifiedTaskDetail | null;
}

export interface AutoDirectorBatchActionRequest {
  actionCode: AutoDirectorMutationActionCode;
  taskIds: string[];
  source: "web" | "dingtalk" | "wecom";
  operatorId: string;
  batchRequestKey: string;
  metadata?: Record<string, unknown>;
}

export const AUTO_DIRECTOR_BATCH_RESULT_CODES = [
  "success",
  "partial_success",
  "failed",
  "skipped",
] as const;

export type AutoDirectorBatchResultCode = (typeof AUTO_DIRECTOR_BATCH_RESULT_CODES)[number];

export interface AutoDirectorBatchActionExecutionResult {
  code: AutoDirectorBatchResultCode;
  successCount: number;
  failureCount: number;
  skippedCount: number;
  itemResults: AutoDirectorActionExecutionResult[];
}
