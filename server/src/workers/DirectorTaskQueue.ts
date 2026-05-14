import os from "node:os";
import { prisma } from "../db/prisma";
import { DirectorCommandService } from "../services/novel/director/DirectorCommandService";
import { resourceClassForCommand } from "../services/novel/director/DirectorCommandServiceHelpers";
import { taskDispatcher } from "./TaskDispatcher";

const ACTIVE_COMMAND_STATUSES = ["leased", "running"] as const;

function resolveNumberEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function resolveDefaultSlots(): number {
  return Math.max(4, os.cpus().length);
}

class ResourceGate {
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly limit: number) {}

  async acquire(): Promise<void> {
    if (this.limit <= 0) return;
    if (this.active < this.limit) {
      this.active += 1;
      return;
    }
    await new Promise<void>((resolve) => {
      this.waiters.push(resolve);
    });
  }

  release(): void {
    if (this.limit <= 0) return;
    this.active = Math.max(0, this.active - 1);
    const next = this.waiters.shift();
    if (next) {
      this.active += 1;
      next();
    }
  }
}

const PER_NOVEL_RESOURCE_LIMITS: Record<string, number> = {
  planner: 2,
  writer: 2,
  repair: 2,
  state_resolution: 2,
};

export interface DirectorTaskQueueOptions {
  workerId?: string;
  leaseMs?: number;
  staleScanMs?: number;
  executionSlots?: number;
  pollMs?: number;
}

export interface LeasedTask {
  command: NonNullable<Awaited<ReturnType<typeof prisma.directorRunCommand.findUnique>>>;
}

export class DirectorTaskQueue {
  readonly workerId: string;
  readonly leaseMs: number;
  readonly staleScanMs: number;
  readonly executionSlots: number;
  readonly pollMs: number;

  private readonly gates = new Map<string, ResourceGate>();
  private readonly commandService: DirectorCommandService;
  private lastStaleScan = 0;

  constructor(
    options: DirectorTaskQueueOptions = {},
    commandService = new DirectorCommandService(),
  ) {
    this.workerId = options.workerId
      ?? process.env.DIRECTOR_WORKER_ID?.trim()
      ?? `director-worker-${os.hostname()}-${process.pid}`;
    this.leaseMs = resolveNumberEnv("DIRECTOR_WORKER_LEASE_MS", options.leaseMs ?? 120_000);
    this.staleScanMs = resolveNumberEnv("DIRECTOR_WORKER_STALE_SCAN_MS", options.staleScanMs ?? 30_000);
    this.executionSlots = resolveNumberEnv("DIRECTOR_WORKER_EXECUTION_SLOTS", options.executionSlots ?? resolveDefaultSlots());
    this.pollMs = resolveNumberEnv("DIRECTOR_WORKER_POLL_MS", options.pollMs ?? 5_000);
    this.commandService = commandService;
  }

  async leaseNext(slotId: string): Promise<LeasedTask | null> {
    await this.maybeScanStale();
    const now = new Date();
    const leaseOwner = `${this.workerId}:${slotId}`;
    const leaseExpiresAt = new Date(now.getTime() + this.leaseMs);
    const candidate = await prisma.directorRunCommand.findFirst({
      where: {
        status: "queued",
        runAfter: { lte: now },
      },
      orderBy: [{ runAfter: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    });
    if (!candidate) {
      return null;
    }
    const claimed = await prisma.directorRunCommand.updateMany({
      where: {
        id: candidate.id,
        status: "queued",
      },
      data: {
        status: "leased",
        leaseOwner,
        leaseExpiresAt,
        attempt: { increment: 1 },
      },
    });
    if (claimed.count !== 1) {
      return null;
    }
    const command = await prisma.directorRunCommand.findUnique({
      where: { id: candidate.id },
    });
    return command ? { command } : null;
  }

  async acquireResourceGate(novelId: string | null | undefined, commandType: string): Promise<void> {
    const resourceClass = resourceClassForCommand(commandType);
    const key = `${novelId?.trim() || "_global"}:${resourceClass}`;
    let gate = this.gates.get(key);
    if (!gate) {
      const envName = `DIRECTOR_WORKER_RESOURCE_${resourceClass.toUpperCase()}_LIMIT`;
      gate = new ResourceGate(resolveNumberEnv(envName, PER_NOVEL_RESOURCE_LIMITS[resourceClass] ?? 2));
      this.gates.set(key, gate);
    }
    await gate.acquire();
  }

  releaseResourceGate(novelId: string | null | undefined, commandType: string): void {
    const resourceClass = resourceClassForCommand(commandType);
    const key = `${novelId?.trim() || "_global"}:${resourceClass}`;
    this.gates.get(key)?.release();
  }

  startLeaseRenewal(commandId: string, slotId: string): () => void {
    const renew = () => {
      void this.commandService.renewLease(commandId, `${this.workerId}:${slotId}`, this.leaseMs).catch((error) => {
        console.warn(`[task-queue] failed to renew command lease commandId=${commandId}`, error);
      });
    };
    renew();
    const timer = setInterval(renew, Math.max(100, Math.floor(this.leaseMs / 3)));
    return () => clearInterval(timer);
  }

  async markRunning(commandId: string, slotId: string): Promise<void> {
    await this.commandService.markCommandRunning(commandId, `${this.workerId}:${slotId}`, this.leaseMs);
  }

  async completeTask(commandId: string, slotId: string): Promise<void> {
    await this.commandService.markCommandSucceeded(commandId, `${this.workerId}:${slotId}`);
    const command = await this.commandService.getCommandById(commandId);
    taskDispatcher.notify({ taskId: command?.taskId });
  }

  async cancelTask(commandId: string, slotId: string): Promise<void> {
    await this.commandService.markCommandCancelled(commandId, `${this.workerId}:${slotId}`);
  }

  async failTask(commandId: string, slotId: string, error: unknown): Promise<void> {
    await this.commandService.markCommandFailed(commandId, `${this.workerId}:${slotId}`, error);
  }

  async waitForWork(): Promise<void> {
    await taskDispatcher.waitForSignal(this.pollMs);
  }

  private async maybeScanStale(): Promise<void> {
    const now = Date.now();
    if (now - this.lastStaleScan < this.staleScanMs) {
      return;
    }
    this.lastStaleScan = now;
    const recovered = await this.commandService.recoverStaleLeases(new Date());
    if (recovered > 0) {
      taskDispatcher.notify();
    }
  }
}
