import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../../../db/prisma";
import {
  applyEvent,
  initialControl,
  VersionConflictError,
  type RunEvent,
} from "../domain/control";
import type { RunContract, RunControl, RunPause } from "../domain";
import type {
  CommandHandoffInput,
  CommandOpenRunInput,
  CommandRepository,
  CommandTransitionInput,
  DirectorCommandRecord,
} from "../application/ports";

function parseJson<T>(value: string | null): T | null {
  return value ? JSON.parse(value) as T : null;
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

function controlCreate(runId: string, novelId: string, control: RunControl): Prisma.DirectorNextRunControlUncheckedCreateInput {
  return {
    runId,
    novelId,
    version: control.version,
    status: control.status,
    pauseJson: control.pause ? JSON.stringify(control.pause) : null,
    gateJson: control.gate ? JSON.stringify(control.gate) : null,
    cursorStepId: control.cursorStepId,
    failureReason: control.failureReason,
  };
}

function commandResult(runId: string, control: RunControl, commandId: string): { runId: string; controlVersion: number; commandId: string } {
  return { runId, controlVersion: control.version, commandId };
}

function fromRow(row: {
  id: string;
  idempotencyKey: string;
  runId: string;
  type: string;
  payloadJson: string;
  resultJson: string | null;
}): DirectorCommandRecord {
  return {
    id: row.id,
    idempotencyKey: row.idempotencyKey,
    runId: row.runId,
    type: row.type as DirectorCommandRecord["type"],
    payload: JSON.parse(row.payloadJson) as unknown,
    result: row.resultJson ? JSON.parse(row.resultJson) as unknown : null,
  };
}

export class PrismaCommandRepository implements CommandRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async find(idempotencyKey: string): Promise<DirectorCommandRecord | null> {
    const row = await this.db.directorNextCommand.findUnique({ where: { idempotencyKey } });
    return row ? fromRow(row) : null;
  }

  async openRun(input: CommandOpenRunInput): Promise<{ runId: string; control: RunControl; commandId: string; replayed: boolean }> {
    return this.db.$transaction(async (tx) => {
      const existing = await tx.directorNextCommand.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (existing) {
        const controlRow = await tx.directorNextRunControl.findUnique({ where: { runId: existing.runId } });
        if (!controlRow) throw new Error(`director command run not found: ${existing.runId}`);
        return { runId: existing.runId, control: controlFromRow(controlRow), commandId: existing.id, replayed: true };
      }
      await tx.directorNextRun.create({
        data: {
          id: input.contract.runId,
          novelId: input.contract.novelId,
          driver: input.contract.driver,
          planVersion: input.contract.planVersion,
          contractJson: JSON.stringify(input.contract),
        },
      });
      const control = initialControl();
      await tx.directorNextRunControl.create({ data: controlCreate(input.runId, input.contract.novelId, control) });
      const result = commandResult(input.runId, control, input.id);
      await tx.directorNextCommand.create({
        data: {
          id: input.id,
          idempotencyKey: input.idempotencyKey,
          runId: input.runId,
          type: input.type,
          payloadJson: JSON.stringify(input.payload ?? null),
          resultJson: JSON.stringify(result),
        },
      });
      return { runId: input.runId, control, commandId: input.id, replayed: false };
    });
  }

  async transition(input: CommandTransitionInput): Promise<{ runId: string; control: RunControl; commandId: string; replayed: boolean }> {
    return this.db.$transaction(async (tx) => {
      const existing = await tx.directorNextCommand.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (existing) return this.replay(tx, existing);
      const row = await tx.directorNextRunControl.findUnique({ where: { runId: input.runId } });
      if (!row) throw new Error(`director next run control not found: ${input.runId}`);
      const current = controlFromRow(row);
      const next = applyEvent(current, input.event, input.expectedVersion);
      const updated = await tx.directorNextRunControl.updateMany({
        where: { runId: input.runId, version: input.expectedVersion },
        data: controlUpdate(next),
      });
      if (updated.count !== 1) throw new VersionConflictError(input.expectedVersion, current.version);
      const result = commandResult(input.runId, next, input.id);
      await tx.directorNextCommand.create({
        data: {
          id: input.id,
          idempotencyKey: input.idempotencyKey,
          runId: input.runId,
          type: input.type,
          payloadJson: JSON.stringify(input.payload ?? null),
          resultJson: JSON.stringify(result),
        },
      });
      return { runId: input.runId, control: next, commandId: input.id, replayed: false };
    });
  }

  async handoff(input: CommandHandoffInput): Promise<{ runId: string; control: RunControl; commandId: string; replayed: boolean }> {
    return this.db.$transaction(async (tx) => {
      const existing = await tx.directorNextCommand.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
      if (existing) return this.replay(tx, existing);
      const oldRow = await tx.directorNextRunControl.findUnique({ where: { runId: input.oldRunId } });
      if (!oldRow) throw new Error(`director next run control not found: ${input.oldRunId}`);
      const oldControl = controlFromRow(oldRow);
      const cancelled = applyEvent(oldControl, { type: "cancel" }, input.oldExpectedVersion);
      const updated = await tx.directorNextRunControl.updateMany({
        where: { runId: input.oldRunId, version: input.oldExpectedVersion },
        data: controlUpdate(cancelled),
      });
      if (updated.count !== 1) throw new VersionConflictError(input.oldExpectedVersion, oldControl.version);
      await tx.directorNextRun.create({
        data: {
          id: input.newContract.runId,
          novelId: input.newContract.novelId,
          driver: input.newContract.driver,
          planVersion: input.newContract.planVersion,
          contractJson: JSON.stringify(input.newContract),
        },
      });
      const next = initialControl();
      await tx.directorNextRunControl.create({ data: controlCreate(input.newRunId, input.newContract.novelId, next) });
      const result = commandResult(input.newRunId, next, input.id);
      await tx.directorNextCommand.create({
        data: {
          id: input.id,
          idempotencyKey: input.idempotencyKey,
          runId: input.newRunId,
          type: input.type,
          payloadJson: JSON.stringify(input.payload ?? null),
          resultJson: JSON.stringify(result),
        },
      });
      return { runId: input.newRunId, control: next, commandId: input.id, replayed: false };
    });
  }

  private async replay(tx: Prisma.TransactionClient, row: {
    id: string;
    runId: string;
  }): Promise<{ runId: string; control: RunControl; commandId: string; replayed: boolean }> {
    const controlRow = await tx.directorNextRunControl.findUnique({ where: { runId: row.runId } });
    if (!controlRow) throw new Error(`director command run not found: ${row.runId}`);
    return { runId: row.runId, control: controlFromRow(controlRow), commandId: row.id, replayed: true };
  }
}
