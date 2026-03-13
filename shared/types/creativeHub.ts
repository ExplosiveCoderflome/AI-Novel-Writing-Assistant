import type { FailureDiagnostic } from "./agent";

export type CreativeHubThreadStatus = "idle" | "busy" | "interrupted" | "error";

export interface CreativeHubResourceBinding {
  novelId?: string | null;
  chapterId?: string | null;
  worldId?: string | null;
  taskId?: string | null;
  bookAnalysisId?: string | null;
  formulaId?: string | null;
  baseCharacterId?: string | null;
  knowledgeDocumentIds?: string[];
}

export interface CreativeHubToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  partial_json?: string;
}

export interface CreativeHubMessage {
  id?: string;
  type: "system" | "human" | "ai" | "tool";
  content: string | Record<string, unknown>[];
  name?: string;
  tool_call_id?: string;
  status?: "success" | "error";
  tool_calls?: CreativeHubToolCall[];
  additional_kwargs?: Record<string, unknown>;
}

export interface CreativeHubInterrupt {
  id: string;
  runId?: string | null;
  approvalId?: string | null;
  title: string;
  summary: string;
  targetType?: string | null;
  targetId?: string | null;
  resumable?: boolean;
  metadata?: Record<string, unknown> | null;
  createdAt?: string | null;
}

export interface CreativeHubCheckpointRef {
  checkpointId: string;
  parentCheckpointId?: string | null;
  runId?: string | null;
  messageCount: number;
  preview?: string | null;
  createdAt: string;
}

export interface CreativeHubProductionStage {
  key: string;
  label: string;
  status: "pending" | "completed" | "running" | "blocked";
  detail?: string | null;
}

export interface CreativeHubProductionStatus {
  novelId: string;
  worldId?: string | null;
  title: string;
  chapterCount: number;
  targetChapterCount: number;
  assetStages: CreativeHubProductionStage[];
  pipelineJobId?: string | null;
  pipelineStatus?: string | null;
  currentStage: string;
  failureSummary?: string | null;
  recoveryHint?: string | null;
  assetsReady: boolean;
  pipelineReady: boolean;
  summary: string;
}

export interface CreativeHubThreadMetadata {
  productionStatus?: CreativeHubProductionStatus | null;
  [key: string]: unknown;
}

export interface CreativeHubThread {
  id: string;
  title: string;
  archived: boolean;
  status: CreativeHubThreadStatus;
  latestRunId?: string | null;
  latestError?: string | null;
  resourceBindings: CreativeHubResourceBinding;
  createdAt: string;
  updatedAt: string;
}

export interface CreativeHubThreadState {
  thread: CreativeHubThread;
  messages: CreativeHubMessage[];
  interrupts: CreativeHubInterrupt[];
  currentCheckpointId?: string | null;
  diagnostics?: FailureDiagnostic;
  metadata?: CreativeHubThreadMetadata | null;
}

export interface CreativeHubThreadHistoryItem extends CreativeHubCheckpointRef {
  messages: CreativeHubMessage[];
  interrupts: CreativeHubInterrupt[];
}
