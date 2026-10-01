import { randomUUID } from "node:crypto";
import os from "node:os";
import type { DirectorWorkerRuntime } from "./ports";

const DEFAULT_LEASE_MS = 30_000;

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
    enabled: () => env.DIRECTOR_NEXT_ENABLED === "1" || env.DIRECTOR_NEXT_ENABLED === "true",
  };
}
