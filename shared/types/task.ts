import type { ResourceRef } from "./agent";
import type {
  NovelWorkflowCheckpoint,
  NovelWorkflowResumeTarget,
} from "./novelWorkflow";

export type TaskKind =
  | "book_analysis"
  | "novel_pipeline"
  | "knowledge_document"
  | "image_generation"
  | "agent_run"
  | "novel_workflow"
  | "style_extraction";

export type TaskStatus = "queued" | "running" | "waiting_approval" | "succeeded" | "failed" | "cancelled";

export interface TaskTokenUsageSummary {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  llmCallCount: number;
  lastRecordedAt?: string | null;
}

export interface TaskLlmInvocationDiagnostic {
  id: string;
  taskId?: string | null;
  novelId?: string | null;
  promptId?: string | null;
  promptVersion?: string | null;
  stage?: string | null;
  itemKey?: string | null;
  provider: string;
  model: string;
  baseUrlHost?: string | null;
  requestProtocol?: string | null;
  strategy?: string | null;
  status: string;
  errorCategory?: string | null;
  errorMessage?: string | null;
  upstreamRequestId?: string | null;
  estimatedInputTokens?: number | null;
  renderedPromptChars?: number | null;
  messageChars?: number | null;
  rawChars?: number | null;
  latencyMs?: number | null;
  warningCode?: string | null;
  createdAt: string;
}

export interface UnifiedTaskStep {
  key: string;
  label: string;
  status: "idle" | "running" | "succeeded" | "failed" | "cancelled";
  startedAt?: string | null;
  updatedAt?: string | null;
}

export interface UnifiedTaskSummary {
  id: string;
  kind: TaskKind;
  title: string;
  status: TaskStatus;
  progress: number;
  currentStage?: string | null;
  currentItemKey?: string | null;
  currentItemLabel?: string | null;
  executionScopeLabel?: string | null;
  displayStatus?: string | null;
  blockingReason?: string | null;
  resumeAction?: string | null;
  lastHealthyStage?: string | null;
  attemptCount: number;
  maxAttempts: number;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
  heartbeatAt?: string | null;
  ownerId: string;
  ownerLabel: string;
  sourceRoute: string;
  checkpointType?: NovelWorkflowCheckpoint | null;
  checkpointSummary?: string | null;
  resumeTarget?: NovelWorkflowResumeTarget | null;
  nextActionLabel?: string | null;
  noticeCode?: string | null;
  noticeSummary?: string | null;
  failureCode?: string | null;
  failureSummary?: string | null;
  recoveryHint?: string | null;
  tokenUsage?: TaskTokenUsageSummary | null;
  sourceResource?: ResourceRef | null;
  targetResources?: ResourceRef[];
}

export interface UnifiedTaskDetail extends UnifiedTaskSummary {
  provider?: string | null;
  model?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  retryCountLabel: string;
  meta: Record<string, unknown>;
  steps: UnifiedTaskStep[];
  failureDetails?: string | null;
  recentLlmDiagnostic?: TaskLlmInvocationDiagnostic | null;
}

export interface UnifiedTaskListResponse {
  items: UnifiedTaskSummary[];
  nextCursor?: string | null;
}

export interface TaskOverviewSummary {
  queuedCount: number;
  runningCount: number;
  failedCount: number;
  cancelledCount: number;
  waitingApprovalCount: number;
  recoveryCandidateCount: number;
}

export interface RecoverableTaskSummary {
  id: string;
  kind: Extract<TaskKind, "book_analysis" | "novel_pipeline" | "image_generation" | "novel_workflow" | "style_extraction">;
  title: string;
  ownerLabel: string;
  status: Extract<TaskStatus, "queued" | "running">;
  currentStage?: string | null;
  currentItemLabel?: string | null;
  resumeAction?: string | null;
  sourceRoute: string;
  recoveryHint?: string | null;
}

export interface RecoverableTaskListResponse {
  items: RecoverableTaskSummary[];
}
