export type ArtifactType = string;

export type ArtifactStatus = "draft" | "confirmed" | "user_edited" | "stale";

export interface ArtifactRef {
  type: ArtifactType;
  /** Scope is part of identity. A book, volume, and chapter must never share a latest lookup. */
  scope: string;
  version: number;
  status: ArtifactStatus;
  protectedUserContent: boolean;
}

export interface QualityDebtRef {
  chapterOrder: number;
  code: string;
}

export interface StepDefinition {
  id: string;
  label: string;
  requires: readonly ArtifactType[];
  produces: ArtifactType;
  needs: readonly string[];
  gateable: boolean;
  overwrites: readonly ArtifactType[];
}

export interface PlanDefinition {
  version: string;
  externalArtifacts: readonly ArtifactType[];
  steps: readonly StepDefinition[];
}

export type Driver = "auto" | "assisted";

export type IssuePolicyMode = "completion_first" | "quality_first";

export interface IssuePolicySnapshot {
  mode: IssuePolicyMode;
  version: string;
  pipelinePolicy?: {maxAutomaticRetries: number; issueActions: Readonly<Record<string, string>>};
}

export interface ModelConfigSnapshot {
  route: string;
  model: string;
  version: string;
}

export interface ChapterRange {
  from: number;
  to: number;
}

export interface RunContract {
  runId: string;
  novelId: string;
  driver: Driver;
  planVersion: string;
  scope: string;
  stepIdsInScope: readonly string[] | null;
  chapterRange: ChapterRange | null;
  issuePolicy: IssuePolicySnapshot;
  modelConfig: ModelConfigSnapshot;
  tokenBudget: number | null;
  rejectionBudget: number;
  /** Optional only for already-persisted kernel test runs; production requires a launch snapshot. */
  launchInput?: RunLaunchInput;
}

export interface RunLaunchInput {
  storyInput: string;
  estimatedChapterCount: number;
  temperature?: number;
  worldMode: "generate" | "reuse" | "skip";
  targetVolumeId?: string | null;
  targetMode?: "opening" | "selected_volume";
  provider?: string;
  model?: string;
  executionRange?: ChapterRange;
  issuePolicyMode?: IssuePolicyMode;
}

export type RunStatus =
  | "queued"
  | "running"
  | "waiting_gate"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

export type PauseKind = "manual_recovery" | "replan" | "safety";

export interface RunPause {
  kind: PauseKind;
  reason: string;
}

export interface RunGate {
  id: string;
  artifactTypes: readonly ArtifactType[];
}

export interface RunControl {
  version: number;
  status: RunStatus;
  pause: RunPause | null;
  gate: RunGate | null;
  cursorStepId: string | null;
  failureReason: string | null;
}

export type StopSignalKind =
  | "replan"
  | "safety"
  | "data_integrity"
  | "no_usable_content"
  | "manual_recovery";

export type StopSignalAction =
  | "stop_for_replan"
  | "pause_for_manual"
  | "fail_task";

export interface StopSignal {
  kind: StopSignalKind;
  reason: string;
  action?: StopSignalAction;
}

export interface FactsSnapshot {
  artifacts: readonly ArtifactRef[];
  debts: readonly QualityDebtRef[];
  stopSignal: StopSignal | null;
}

export type Action =
  | { kind: "run_step"; stepId: string }
  | { kind: "open_gate"; gateId: string; artifactTypes: readonly ArtifactType[] }
  | { kind: "record_debt"; chapterOrder: number; code: string }
  | { kind: "pause"; pause: RunPause }
  | { kind: "complete" }
  | { kind: "fail"; reason: string };

export interface OrchestratorInput {
  plan: PlanDefinition;
  contract: RunContract;
  facts: FactsSnapshot;
}

export interface Orchestrator {
  next(input: OrchestratorInput): Action;
}

