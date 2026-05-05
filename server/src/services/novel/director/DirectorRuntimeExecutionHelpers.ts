import crypto from "node:crypto";

export const ACTIVE_EXECUTION_STATUSES = ["leased", "running"] as const;
export const TERMINAL_RUNTIME_STATUSES = ["cancelled", "failed_hard", "completed"] as const;

export interface LegacyDirectorCommandRef {
  id: string;
  taskId: string;
  novelId: string | null;
  commandType: string;
  idempotencyKey: string;
  payloadJson: string | null;
  runAfter?: Date | null;
  createdAt?: Date;
}

export interface RuntimeLeaseInput {
  workerId: string;
  slotId: string;
  leaseMs: number;
}

export interface RuntimeExecutionLease {
  runtimeId: string;
  runtimeCommandId: string;
  executionId: string;
  legacyCommandId: string | null;
  taskId: string | null;
  novelId: string | null;
  commandType: string;
  stepType: string;
  resourceClass: string;
}

export function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableJson(entryValue)}`).join(",")}}`;
}

export function hashPayload(value: unknown): string {
  return crypto.createHash("sha1").update(stableJson(value)).digest("hex").slice(0, 16);
}

export function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "P2002");
}

export function isDirectorRuntimeTableUnavailable(error: unknown): boolean {
  return Boolean(
    error
      && typeof error === "object"
      && "code" in error
      && ((error as { code?: unknown }).code === "P2021" || (error as { code?: unknown }).code === "P2022"),
  );
}

export function commandPriority(commandType: string): number {
  if (commandType === "cancel") {
    return 100;
  }
  if (commandType === "policy_update" || commandType === "approve_gate") {
    return 90;
  }
  if (commandType === "confirm_candidate") {
    return 85;
  }
  if (
    commandType === "generate_candidates"
    || commandType === "refine_candidates"
    || commandType === "patch_candidate"
    || commandType === "refine_titles"
  ) {
    return 82;
  }
  if (commandType === "resume_from_checkpoint" || commandType === "retry") {
    return 80;
  }
  if (commandType === "takeover" || commandType === "continue") {
    return 65;
  }
  if (commandType === "repair_chapter_titles") {
    return 60;
  }
  return 50;
}

export function stepTypeForCommand(commandType: string): string {
  if (
    commandType === "generate_candidates"
    || commandType === "refine_candidates"
    || commandType === "patch_candidate"
    || commandType === "refine_titles"
  ) {
    return "candidate_selection";
  }
  if (commandType === "confirm_candidate") {
    return "create_project_from_candidate";
  }
  if (commandType === "approve_gate") {
    return "approve_gate";
  }
  if (commandType === "policy_update") {
    return "policy_update";
  }
  if (commandType === "workspace_analysis") {
    return "workspace_analysis";
  }
  if (commandType === "manual_edit_impact") {
    return "manual_edit_impact";
  }
  if (commandType === "repair_chapter_titles") {
    return "repair_chapter";
  }
  if (commandType === "takeover") {
    return "resume_from_checkpoint";
  }
  if (commandType === "continue" || commandType === "resume_from_checkpoint" || commandType === "retry") {
    return "resume_from_checkpoint";
  }
  if (commandType === "cancel") {
    return "cancel_runtime";
  }
  return commandType;
}

export function resourceClassForCommand(commandType: string): string {
  if (
    commandType === "generate_candidates"
    || commandType === "refine_candidates"
    || commandType === "patch_candidate"
    || commandType === "refine_titles"
  ) {
    return "planner";
  }
  if (commandType === "repair_chapter_titles") {
    return "repair";
  }
  if (commandType === "workspace_analysis" || commandType === "manual_edit_impact") {
    return "state_resolution";
  }
  if (commandType === "policy_update" || commandType === "approve_gate") {
    return "state_resolution";
  }
  if (commandType === "confirm_candidate") {
    return "state_resolution";
  }
  if (commandType === "takeover" || commandType === "continue" || commandType === "resume_from_checkpoint" || commandType === "retry") {
    return "writer";
  }
  return "state_resolution";
}

export function runtimeStatusForTaskStatus(input: {
  taskStatus?: string | null;
  pendingManualRecovery?: boolean | null;
  cancelRequestedAt?: Date | null;
}): string {
  if (input.cancelRequestedAt || input.taskStatus === "cancelled") {
    return "cancelled";
  }
  if (input.pendingManualRecovery || input.taskStatus === "failed") {
    return "failed_recoverable";
  }
  if (input.taskStatus === "waiting_approval") {
    return "waiting_gate";
  }
  if (input.taskStatus === "succeeded") {
    return "completed";
  }
  if (input.taskStatus === "running") {
    return "running";
  }
  if (input.taskStatus === "queued") {
    return "waiting_worker";
  }
  return "waiting_worker";
}

export function buildRuntimeEventId(runtimeId: string, type: string): string {
  return `${runtimeId}:${type}:${crypto.randomUUID()}`;
}
