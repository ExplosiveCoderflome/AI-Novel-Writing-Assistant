import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../../../db/prisma";
import {
  applyEvent,
  initialControl,
  VersionConflictError,
  type RunEvent,
} from "../domain/control";
import type {
  RunContract,
  RunControl,
  RunPause,
} from "../domain";
import type { RunRepository } from "../application/ports";

const ACTIVE_STATUSES = ["queued", "running", "waiting_gate", "paused"] as const;

function parseJson<T>(value: string | null): T | null {
  if (!value) {
    return null;
  }
  return JSON.parse(value) as T;
}

function controlFromRow(row: {
  version: number;
  status: string;
  pauseJson: string | null;
  gateJson: string | null;
  cursorStepId: string | null;
  failureReason: string | null;
}): RunControl {
  return {
    version: row.version,
    status: row.status as RunControl["status"],
    pause: parseJson<RunPause>(row.pauseJson),
    gate: parseJson<RunControl["gate"]>(row.gateJson),
    cursorStepId: row.cursorStepId,
    failureReason: row.failureReason,
  };
}

function controlUpdate(control: RunControl): Prisma.DirectorNextRunControlUpdateInput {
  return {
    version: control.version,
    status: control.status,
    pauseJson: control.pause ? JSON.stringify(control.pause) : null,
    gateJson: control.gate ? JSON.stringify(control.gate) : null,
    cursorStepId: control.cursorStepId,
    failureReason: control.failureReason,
  };
}

export class PrismaRunRepository implements RunRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async open(contract: RunContract): Promise<RunControl> {
    const control = initialControl();
    await this.db.$transaction(async (tx) => {
      await tx.directorNextRun.create({
        data: {
          id: contract.runId,
          novelId: contract.novelId,
          driver: contract.driver,
          planVersion: contract.planVersion,
          contractJson: JSON.stringify(contract),
        },
      });
      await tx.directorNextRunControl.create({
        data: {
          runId: contract.runId,
          novelId: contract.novelId,
          version: control.version,
          status: control.status,
          pauseJson: null,
          gateJson: null,
          cursorStepId: control.cursorStepId,
          failureReason: control.failureReason,
        },
      });
    });
    return control;
  }

  async getContract(runId: string): Promise<RunContract | null> {
    const row = await this.db.directorNextRun.findUnique({
      where: { id: runId },
      select: { contractJson: true },
    });
    return row ? parseJson<RunContract>(row.contractJson) : null;
  }

  async getControl(runId: string): Promise<RunControl | null> {
    const row = await this.db.directorNextRunControl.findUnique({ where: { runId } });
    return row ? controlFromRow(row) : null;
  }

  async findActiveRunIdByNovel(novelId: string): Promise<string | null> {
    const row = await this.db.directorNextRunControl.findFirst({
      where: { novelId, status: { in: [...ACTIVE_STATUSES] } },
      select: { runId: true },
      orderBy: { updatedAt: "desc" },
    });
    return row?.runId ?? null;
  }

  async listRunIds(options: { needsAttention?: boolean; novelId?: string; limit: number }): Promise<string[]> {
    const rows = await this.db.directorNextRun.findMany({
      where: {
        ...(options.novelId ? { novelId: options.novelId } : {}),
        ...(options.needsAttention ? { control: { is: { status: { in: ["paused", "waiting_gate", "failed"] } } } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(options.limit, 1), 100),
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  async transition(runId: string, event: RunEvent, expectedVersion: number): Promise<RunControl> {
    return this.db.$transaction(async (tx) => {
      const row = await tx.directorNextRunControl.findUnique({ where: { runId } });
      if (!row) {
        throw new Error(`director next run control not found: ${runId}`);
      }
      const current = controlFromRow(row);
      const next = applyEvent(current, event, expectedVersion);
      const result = await tx.directorNextRunControl.updateMany({
        where: { runId, version: expectedVersion },
        data: controlUpdate(next),
      });
      if (result.count !== 1) {
        throw new VersionConflictError(expectedVersion, current.version);
      }
      return next;
    });
  }

  async acquireLease(
    runId: string,
    owner: string,
    leaseExpiresAt: Date,
    now: Date,
  ): Promise<boolean> {
    const result = await this.db.directorNextRunControl.updateMany({
      where: {
        runId,
        status: { in: [...ACTIVE_STATUSES] },
        OR: [
          { leaseOwner: null },
          { leaseOwner: owner },
          { leaseExpiresAt: null },
          { leaseExpiresAt: { lt: now } },
        ],
      },
      data: { leaseOwner: owner, leaseExpiresAt, heartbeatAt: now },
    });
    return result.count === 1;
  }

  async heartbeat(
    runId: string,
    owner: string,
    leaseExpiresAt: Date,
    now: Date,
  ): Promise<boolean> {
    const result = await this.db.directorNextRunControl.updateMany({
      where: {
        runId,
        leaseOwner: owner,
        status: { in: [...ACTIVE_STATUSES] },
        OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { gt: now } }],
      },
      data: { leaseExpiresAt, heartbeatAt: now },
    });
    return result.count === 1;
  }

  async listLeaseCandidates(now: Date, limit: number): Promise<string[]> {
    const rows = await this.db.directorNextRunControl.findMany({
      where: {
        status: { in: ["queued", "running", "waiting_gate"] },
        OR: [
          { leaseOwner: null },
          { leaseExpiresAt: null },
          { leaseExpiresAt: { lt: now } },
        ],
      },
      select: { runId: true },
      orderBy: { updatedAt: "asc" },
      take: limit,
    });
    return rows.map((row) => row.runId);
  }

  async listExpiredLeases(now: Date): Promise<string[]> {
    const rows = await this.db.directorNextRunControl.findMany({
      where: {
        status: { in: [...ACTIVE_STATUSES] },
        leaseExpiresAt: { lt: now },
      },
      select: { runId: true },
      orderBy: { leaseExpiresAt: "asc" },
    });
    return rows.map((row) => row.runId);
  }
}
