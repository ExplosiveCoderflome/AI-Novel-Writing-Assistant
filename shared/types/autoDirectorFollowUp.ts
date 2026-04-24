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
  | "open_detail";

export type AutoDirectorActionCode =
  | AutoDirectorMutationActionCode
  | AutoDirectorNavigationActionCode;

export interface AutoDirectorAction {
  code: AutoDirectorActionCode;
  kind: "mutation" | "navigation";
  label: string;
  riskLevel: AutoDirectorActionRiskLevel;
  requiresConfirm: boolean;
  targetUrl?: string;
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
}

export interface AutoDirectorFollowUpDetail {
  taskId: string;
  reason: AutoDirectorFollowUpReason;
  reasonLabel: string;
  priority: AutoDirectorFollowUpPriority;
  checkpointType: NovelWorkflowCheckpoint | null;
  checkpointSummary: string | null;
  followUpSummary: string;
  blockingReason: string | null;
  executionScope: string | null;
  currentModel: string | null;
  pendingManualRecovery: boolean;
  availableActions: AutoDirectorAction[];
  batchActionCodes: AutoDirectorMutationActionCode[];
  supportsBatch: boolean;
  task: UnifiedTaskDetail;
}

export interface AutoDirectorActionRequest {
  taskId: string;
  actionCode: AutoDirectorMutationActionCode;
  source: "web";
  operatorId: string;
  idempotencyKey: string;
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
