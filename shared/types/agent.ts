export type AgentRunStatus =
  | "queued"
  | "running"
  | "waiting_approval"
  | "succeeded"
  | "failed"
  | "cancelled";

export type AgentStepType =
  | "planning"
  | "tool_call"
  | "tool_result"
  | "reasoning"
  | "write"
  | "approval";

export type AgentStepStatus = "pending" | "running" | "succeeded" | "failed" | "cancelled";

export type AgentApprovalStatus = "pending" | "approved" | "rejected" | "expired";

export type AgentPlanRiskLevel = "low" | "medium" | "high";

export type AgentToolErrorCode =
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "PERMISSION_DENIED"
  | "APPROVAL_REQUIRED"
  | "CONFLICT"
  | "TIMEOUT"
  | "INTERNAL";

export interface AgentPlanContextNeed {
  key: string;
  required: boolean;
  reason?: string;
}

export interface AgentPlanAction {
  agent: "Planner" | "Writer" | "Reviewer" | "Continuity" | "Repair";
  tool: string;
  reason: string;
  idempotencyKey: string;
  input: Record<string, unknown>;
}

export interface AgentPlan {
  goal: string;
  contextNeeds: AgentPlanContextNeed[];
  actions: AgentPlanAction[];
  riskLevel: AgentPlanRiskLevel;
  requiresApproval: boolean;
  confidence: number;
}

export interface AgentRunMetrics {
  stepCount: number;
  successCount: number;
  failureCount: number;
  approvalCount: number;
  pendingApprovalCount: number;
  totalDurationMs: number;
  avgStepDurationMs: number;
  totalCostUsd?: number;
  toolFailureByCode?: Partial<Record<AgentToolErrorCode, number>>;
}

export interface ReplayRequest {
  fromStepId: string;
  mode?: "continue" | "dry_run";
  note?: string;
}

export interface AgentRun {
  id: string;
  novelId?: string | null;
  sessionId: string;
  goal: string;
  entryAgent: string;
  status: AgentRunStatus;
  currentStep?: string | null;
  currentAgent?: string | null;
  error?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  metadataJson?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentStep {
  id: string;
  runId: string;
  seq: number;
  agentName: string;
  stepType: AgentStepType;
  status: AgentStepStatus;
  parentStepId?: string | null;
  idempotencyKey?: string | null;
  inputJson?: string | null;
  outputJson?: string | null;
  error?: string | null;
  errorCode?: AgentToolErrorCode | null;
  provider?: string | null;
  model?: string | null;
  tokenUsageJson?: string | null;
  costUsd?: number | null;
  durationMs?: number | null;
  createdAt: string;
}

export interface AgentApproval {
  id: string;
  runId: string;
  stepId?: string | null;
  approvalType: string;
  targetType: string;
  targetId: string;
  diffSummary: string;
  status: AgentApprovalStatus;
  expiresAt?: string | null;
  decisionNote?: string | null;
  decider?: string | null;
  decidedAt?: string | null;
  payloadJson?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentRunDetail {
  run: AgentRun;
  steps: AgentStep[];
  approvals: AgentApproval[];
  metrics?: AgentRunMetrics;
}
