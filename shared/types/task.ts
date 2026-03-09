export type TaskKind = "book_analysis" | "novel_pipeline" | "image_generation";

export type TaskStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

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
}

export interface UnifiedTaskDetail extends UnifiedTaskSummary {
  provider?: string | null;
  model?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  retryCountLabel: string;
  meta: Record<string, unknown>;
  steps: UnifiedTaskStep[];
}

export interface UnifiedTaskListResponse {
  items: UnifiedTaskSummary[];
  nextCursor?: string | null;
}
