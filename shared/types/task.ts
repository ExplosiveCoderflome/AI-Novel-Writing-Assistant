import type { ResourceRef } from "./agent";
import type {
  NovelWorkflowCheckpoint,
  NovelWorkflowResumeTarget,
} from "./novelWorkflow";

export type TaskKind = "book_analysis" | "novel_pipeline" | "knowledge_document" | "image_generation" | "agent_run" | "novel_workflow";

export type TaskStatus = "queued" | "running" | "waiting_approval" | "succeeded" | "failed" | "cancelled";

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
  failureCode?: string | null;
  failureSummary?: string | null;
  recoveryHint?: string | null;
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
}

export interface UnifiedTaskListResponse {
  items: UnifiedTaskSummary[];
  nextCursor?: string | null;
}
