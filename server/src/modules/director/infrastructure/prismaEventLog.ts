import type { PrismaClient } from "@prisma/client";
import { prisma } from "../../../db/prisma";
import type { EventLog } from "../application/ports";

export class PrismaEventLog implements EventLog {
  constructor(private readonly db: PrismaClient = prisma) {}

  async append(input: {
    runId: string;
    type: string;
    payload: unknown;
    promptVersion?: string;
    model?: string;
  }): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const latest = await tx.directorNextEvent.findFirst({
        where: { runId: input.runId },
        orderBy: { seq: "desc" },
        select: { seq: true },
      });
      const seq = (latest?.seq ?? 0) + 1;
      await tx.directorNextEvent.create({
        data: {
          id: `${input.runId}:${seq}`,
          runId: input.runId,
          seq,
          type: input.type,
          payloadJson: JSON.stringify(input.payload ?? null),
          promptVersion: input.promptVersion,
          model: input.model,
        },
      });
    });
  }

  async list(runId: string): Promise<Array<{
    seq: number;
    type: string;
    payload: unknown;
    createdAt: Date;
  }>> {
    const rows = await this.db.directorNextEvent.findMany({
      where: { runId },
      orderBy: { seq: "asc" },
      select: { seq: true, type: true, payloadJson: true, createdAt: true },
    });
    return rows.map((row) => ({
      seq: row.seq,
      type: row.type,
      payload: JSON.parse(row.payloadJson) as unknown,
      createdAt: row.createdAt,
    }));
  }
}
