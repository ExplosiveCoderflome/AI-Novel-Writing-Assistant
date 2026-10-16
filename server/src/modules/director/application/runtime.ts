import { randomUUID } from "node:crypto";
import os from "node:os";
import type { DirectorWorkerRuntime, EventLog } from "./ports";
import type { RunContract } from "../domain";
import { recoveryBoundarySeq } from "./revision/regeneration";

const DEFAULT_LEASE_MS = 30_000;

/** Progress starts a new rejection series; unrelated stages do not share the allowance. */
export function actionRejectionsSinceProgress(events: Awaited<ReturnType<EventLog["list"]>>) {
  const boundary = events.filter(event => ["stop_signal_cleared", "step_finished", "gate_regeneration_requested"].includes(event.type)).at(-1)?.seq ?? 0;
  return events.filter(event => event.type === "action_rejected" && event.seq > boundary);
}

/** Production snapshots allow zero or one automatic retry; kernel-only runs predate that snapshot. */
export function automaticRecoveryBudget(contract: RunContract): number {
  const policy = contract.issuePolicy.pipelinePolicy;
  if (!policy) return 1;
  const budget = policy.maxAutomaticRetries;
  return Number.isSafeInteger(budget) && budget >= 0 && budget <= 1 ? budget : 0;
}

/** Successful stages release their retry allowance; explicit recovery starts a new series. */
export function executionRecoveryFailures(events: Awaited<ReturnType<EventLog["list"]>>, stepId: string | null) {
  const finished = events.filter(event => {
    const payload = event.payload as {stepId?: unknown} | null;
    return event.type === "step_finished" && typeof payload?.stepId === "string" && payload.stepId.trim();
  }).at(-1)?.seq ?? 0;
  const boundary = Math.max(recoveryBoundarySeq(events), finished);
  return events.filter(event => {
    if (event.type !== "execution_failure" || event.seq <= boundary) return false;
    const failedStep = (event.payload as {stepId?: unknown} | null)?.stepId;
    if (failedStep === null) return stepId === null;
    // Old failure rows have no stage identity: retain them within the saved boundary.
    return typeof failedStep !== "string" || !failedStep.trim() || failedStep === stepId;
  });
}

function resolveLeaseMs(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function createDirectorRuntime(options: {
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  idFactory?: () => string;
  workerId?: string;
  leaseMs?: number;
} = {}): DirectorWorkerRuntime {
  const env = options.env ?? process.env;
  const now = options.now ?? (() => new Date());
  const idFactory = options.idFactory ?? randomUUID;
  const leaseMs = options.leaseMs ?? resolveLeaseMs(env.DIRECTOR_NEXT_LEASE_MS, DEFAULT_LEASE_MS);
  const workerId = options.workerId ?? env.DIRECTOR_NEXT_WORKER_ID?.trim() ?? `${os.hostname()}:${process.pid}:${idFactory()}`;
  return {
    nextId: idFactory,
    workerId: () => workerId,
    now,
    leaseExpiresAt: (value) => new Date(value.getTime() + leaseMs),
    enabled: () => env.DIRECTOR_NEXT_ENABLED === undefined
      || env.DIRECTOR_NEXT_ENABLED === "1"
      || env.DIRECTOR_NEXT_ENABLED === "true",
  };
}
