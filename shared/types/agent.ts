export type AgentRunStatus =
  | "queued"
  | "running"
  | "waiting_approval"
  | "succeeded"
  | "failed"
  | "cancelled";

export type DomainAgentName =
  | "Coordinator"
  | "NovelAgent"
  | "BookAnalysisAgent"
  | "KnowledgeAgent"
  | "WorldAgent"
  | "FormulaAgent"
  | "CharacterAgent";

export type ResourceScope =
  | "global"
  | "novel"
  | "chapter"
  | "book_analysis"
  | "knowledge_document"
  | "world"
  | "writing_formula"
  | "base_character"
  | "creative_decision"
  | "snapshot"
  | "generation_job"
  | "agent_run"
  | "task";

export type ToolCategory = "read" | "inspect" | "mutate" | "run";

export type AgentStepType =
  | "planning"
  | "tool_call"
  | "tool_result"
  | "reasoning"
  | "write"
  | "approval"
  | "answer";

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

export interface ResourceRef {
  type: ResourceScope;
  id: string;
  label?: string | null;
  route?: string | null;
}

export interface AgentCatalogAgent {
  name: DomainAgentName;
  title: string;
  description: string;
  resourceScopes: ResourceScope[];
}

export interface CapabilityDefinition {
  name: string;
  title: string;
  description: string;
  category: ToolCategory;
  riskLevel: AgentPlanRiskLevel;
  domainAgent: DomainAgentName;
  resourceScopes: ResourceScope[];
  approvalRequired: boolean;
  uiKind?: string;
  followupActions?: string[];
  inputSchemaSummary: string[];
}

export interface AgentCatalog {
  agents: AgentCatalogAgent[];
  tools: CapabilityDefinition[];
  approvalPolicySummary: string[];
}

export interface FailureDiagnostic {
  failureCode?: string | null;
  failureSummary?: string | null;
  failureDetails?: string | null;
  recoveryHint?: string | null;
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
  chapterId?: string | null;
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
  diagnostics?: FailureDiagnostic;
  sourceResource?: ResourceRef | null;
  targetResources?: ResourceRef[];
}
