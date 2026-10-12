import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "../../../db/prisma";
import type { QualityDebtRef } from "../domain";
import type { QualityDebtRepository } from "../application/ports";

export class PrismaQualityDebtRepository implements QualityDebtRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async record(input: {
    novelId: string;
    runId: string;
    chapterOrder: number;
    code: string;
    action: string;
  }): Promise<void> {
    await this.db.directorNextQualityDebt.create({
      data: {
        id: randomUUID(),
        novelId: input.novelId,
        runId: input.runId,
        chapterOrder: input.chapterOrder,
        code: input.code,
        action: input.action,
      },
    });
  }

  async listByNovel(novelId: string): Promise<QualityDebtRef[]> {
    const rows = await this.db.directorNextQualityDebt.findMany({
      where: { novelId },
      orderBy: [{ chapterOrder: "asc" }, { createdAt: "asc" }],
      select: { chapterOrder: true, code: true },
    });
    return rows.map((row) => ({
      chapterOrder: row.chapterOrder,
      code: row.code,
    }));
  }
}
