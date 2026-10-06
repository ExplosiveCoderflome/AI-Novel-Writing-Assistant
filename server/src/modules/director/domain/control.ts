import type { ArtifactType, RunControl, RunPause, RunStatus } from "./types";

export type RunEvent =
  | { type: "start" }
  | { type: "step_started"; stepId: string }
  | { type: "step_finished" }
  | { type: "open_gate"; gateId: string; artifactTypes: readonly ArtifactType[] }
  | { type: "resolve_gate" }
  | { type: "pause"; pause: RunPause }
  | { type: "resume" }
  | { type: "complete" }
  | { type: "fail"; reason: string }
  | { type: "cancel" };

export type RunEventType = RunEvent["type"];

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: RunStatus,
    readonly eventType: RunEventType,
  ) {
    super(`invalid run transition: ${from} --${eventType}-->`);
    this.name = "InvalidTransitionError";
  }
}

export class VersionConflictError extends Error {
  constructor(
    readonly expected: number,
    readonly actual: number,
  ) {
    super(`run control version conflict: expected ${expected}, actual ${actual}`);
    this.name = "VersionConflictError";
  }
}

const TRANSITIONS: Record<RunStatus, Partial<Record<RunEventType, RunStatus>>> = {
  queued: { start: "running", cancel: "cancelled" },
  running: {
    step_started: "running",
    step_finished: "running",
    open_gate: "waiting_gate",
    pause: "paused",
    complete: "completed",
    fail: "failed",
    cancel: "cancelled",
  },
  waiting_gate: { resolve_gate: "running", fail: "failed", cancel: "cancelled" },
  paused: { resume: "running", cancel: "cancelled" },
  completed: {},
  failed: {},
  cancelled: {},
};

export const RUN_STATUSES: readonly RunStatus[] = [
  "queued",
  "running",
  "waiting_gate",
  "paused",
  "completed",
  "failed",
  "cancelled",
];

export const RUN_EVENT_TYPES: readonly RunEventType[] = [
  "start",
  "step_started",
  "step_finished",
  "open_gate",
  "resolve_gate",
  "pause",
  "resume",
  "complete",
  "fail",
  "cancel",
];

export function initialControl(): RunControl {
  return {
    version: 0,
    status: "queued",
    pause: null,
    gate: null,
    cursorStepId: null,
    failureReason: null,
  };
}

export function isTerminalStatus(status: RunStatus): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

export function applyEvent(
  control: RunControl,
  event: RunEvent,
  expectedVersion?: number,
): RunControl {
  if (expectedVersion !== undefined && expectedVersion !== control.version) {
    throw new VersionConflictError(expectedVersion, control.version);
  }
  const nextStatus = TRANSITIONS[control.status][event.type];
  if (!nextStatus) {
    throw new InvalidTransitionError(control.status, event.type);
  }

  const next: RunControl = {
    ...control,
    version: control.version + 1,
    status: nextStatus,
  };

  switch (event.type) {
    case "step_started":
      next.cursorStepId = event.stepId;
      break;
    case "step_finished":
      next.cursorStepId = null;
      break;
    case "open_gate":
      next.gate = { id: event.gateId, artifactTypes: [...event.artifactTypes] };
      next.cursorStepId = null;
      break;
    case "resolve_gate":
      next.gate = null;
      break;
    case "pause":
      next.pause = { ...event.pause };
      next.cursorStepId = null;
      break;
    case "resume":
      next.pause = null;
      break;
    case "fail":
      next.failureReason = event.reason;
      next.cursorStepId = null;
      next.gate = null;
      break;
    case "complete":
    case "cancel":
      next.cursorStepId = null;
      next.gate = null;
      break;
    default:
      break;
  }
  return next;
}
