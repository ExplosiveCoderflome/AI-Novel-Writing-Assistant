import type {
  AutoDirectorAction,
  AutoDirectorEvent,
  AutoDirectorEventType,
  AutoDirectorFollowUpItem,
  AutoDirectorFollowUpReason,
  AutoDirectorMutationActionCode,
} from "@ai-novel/shared/types/autoDirectorFollowUp";
import type { NovelWorkflowCheckpoint } from "@ai-novel/shared/types/novelWorkflow";
import type { TaskStatus } from "@ai-novel/shared/types/task";
import { resolveAutoDirectorFollowUpReason } from "./autoDirectorFollowUpReasonResolver";

export interface AutoDirectorEventWorkflowSnapshot {
  id: string;
  novelId: string | null;
  status: TaskStatus;
  progress?: number | null;
  currentStage: string | null;
  checkpointType: NovelWorkflowCheckpoint | null;
  checkpointSummary?: string | null;
  currentItemLabel?: string | null;
  pendingManualRecovery: boolean;
  updatedAt: Date;
  seedPayloadJson?: string | null;
  novel?: {
    title?: string | null;
  } | null;
}

export interface AutoDirectorDerivedFollowUpState {
  taskId: string;
  novelId: string | null;
  novelTitle: string;
  summary: string;
  reason: AutoDirectorFollowUpReason | null;
  reasonLabel: string | null;
  availableMutationActions: AutoDirectorMutationActionCode[];
  stage: string | null;
  checkpointType: NovelWorkflowCheckpoint | null;
  checkpointSummary: string | null;
  progressBucket: number | null;
  executionScopeLabel: string | null;
}

function parseExecutionScopeLabel(seedPayloadJson: string | null | undefined): string | null {
  if (!seedPayloadJson?.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(seedPayloadJson) as {
      autoExecution?: {
        scopeLabel?: unknown;
      };
    };
    const scopeLabel = parsed.autoExecution?.scopeLabel;
    return typeof scopeLabel === "string" && scopeLabel.trim() ? scopeLabel.trim() : null;
  } catch {
    return null;
  }
}

function getNovelTitle(row: Pick<AutoDirectorEventWorkflowSnapshot, "novel" | "id">): string {
  const title = row.novel?.title;
  return typeof title === "string" && title.trim() ? title.trim() : row.id;
}

function summarizeActions(actions: AutoDirectorAction[]): AutoDirectorMutationActionCode[] {
  return actions
    .filter((action): action is AutoDirectorAction & { kind: "mutation" } => action.kind === "mutation")
    .map((action) => action.code as AutoDirectorMutationActionCode);
}

function resolveProgressBucket(progress: number | null | undefined): number | null {
  if (typeof progress !== "number" || Number.isNaN(progress)) {
    return null;
  }
  const normalized = Math.max(0, Math.min(progress, 0.999999));
  return Math.floor(normalized * 10);
}

export function deriveAutoDirectorFollowUpState(
  row: AutoDirectorEventWorkflowSnapshot | null,
): AutoDirectorDerivedFollowUpState | null {
  if (!row) {
    return null;
  }
  const resolved = resolveAutoDirectorFollowUpReason({
    status: row.status,
    checkpointType: row.checkpointType,
    pendingManualRecovery: row.pendingManualRecovery,
    executionScopeLabel: parseExecutionScopeLabel(row.seedPayloadJson),
  });
  if (!resolved) {
    const executionScopeLabel = parseExecutionScopeLabel(row.seedPayloadJson);
    return {
      taskId: row.id,
      novelId: row.novelId,
      novelTitle: getNovelTitle(row),
      summary: row.checkpointSummary?.trim() || row.currentItemLabel?.trim() || "自动导演状态已更新",
      reason: null,
      reasonLabel: null,
      availableMutationActions: [],
      stage: row.currentStage,
      checkpointType: row.checkpointType,
      checkpointSummary: row.checkpointSummary ?? null,
      progressBucket: resolveProgressBucket(row.progress),
      executionScopeLabel,
    };
  }

  const summary = row.checkpointSummary?.trim() || row.currentItemLabel?.trim() || resolved.reasonLabel;
  const executionScopeLabel = parseExecutionScopeLabel(row.seedPayloadJson);
  return {
    taskId: row.id,
    novelId: row.novelId,
    novelTitle: getNovelTitle(row),
    summary,
    reason: resolved.reason,
    reasonLabel: resolved.reasonLabel,
    availableMutationActions: summarizeActions(resolved.availableActions),
    stage: row.currentStage,
    checkpointType: row.checkpointType,
    checkpointSummary: row.checkpointSummary ?? null,
    progressBucket: resolveProgressBucket(row.progress),
    executionScopeLabel,
  };
}

export function detectAutoDirectorEventType(input: {
  before: AutoDirectorDerivedFollowUpState | null;
  after: AutoDirectorDerivedFollowUpState | null;
  afterStatus: TaskStatus | null;
}): AutoDirectorEventType | null {
  if (!input.after) {
    return null;
  }
  if (input.afterStatus === "succeeded") {
    return "auto_director.completed";
  }
  if (input.after.reason && !input.before?.reason) {
    if (input.after.reason === "runtime_failed" || input.after.reason === "manual_recovery_required") {
      return "auto_director.exception";
    }
    return "auto_director.approval_required";
  }
  if (!input.after.reason && input.before?.reason) {
    return "auto_director.recovered";
  }
  if (input.after.reason === "runtime_failed" || input.after.reason === "manual_recovery_required") {
    if (input.before?.reason !== input.after.reason || input.before.summary !== input.after.summary) {
      return "auto_director.exception";
    }
  }
  if (input.after.reason && input.before?.reason && (
    input.before.reason !== input.after.reason
    || input.before.summary !== input.after.summary
    || input.before.checkpointType !== input.after.checkpointType
    || input.before.stage !== input.after.stage
    || input.before.progressBucket !== input.after.progressBucket
    || input.before.executionScopeLabel !== input.after.executionScopeLabel
  )) {
    return "auto_director.progress_changed";
  }
  return null;
}

export function buildAutoDirectorEvent(input: {
  eventType: AutoDirectorEventType;
  after: AutoDirectorDerivedFollowUpState;
  occurredAt: Date;
}): AutoDirectorEvent {
  return {
    eventId: `${input.after.taskId}:${input.eventType}:${input.occurredAt.toISOString()}`,
    eventType: input.eventType,
    taskId: input.after.taskId,
    novelId: input.after.novelId,
    reason: input.after.reason,
    actionCandidates: input.after.availableMutationActions,
    summary: input.after.summary,
    progressBucket: input.after.progressBucket,
    stage: input.after.stage,
    checkpointType: input.after.checkpointType,
    occurredAt: input.occurredAt.toISOString(),
  };
}

export function projectDerivedStateToFollowUpItem(
  item: AutoDirectorFollowUpItem,
): AutoDirectorDerivedFollowUpState {
  return {
    taskId: item.taskId,
    novelId: item.novelId,
    novelTitle: item.novelTitle,
    summary: item.followUpSummary,
    reason: item.reason,
    reasonLabel: item.reasonLabel,
    availableMutationActions: item.availableActions
      .filter((action): action is typeof action & { kind: "mutation" } => action.kind === "mutation")
      .map((action) => action.code as AutoDirectorMutationActionCode),
    stage: item.currentStage,
    checkpointType: item.checkpointType,
    checkpointSummary: item.followUpSummary,
    progressBucket: null,
    executionScopeLabel: item.executionScope,
  };
}
