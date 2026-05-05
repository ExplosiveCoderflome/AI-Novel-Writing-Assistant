import { prisma } from "../../../db/prisma";
import type { DirectorExecutionLogLevel } from "@ai-novel/shared/types/directorExecutionLog";

const MAX_LOGS_PER_TASK = 200;

class DirectorExecutionLogger {
  async log(
    taskId: string,
    level: DirectorExecutionLogLevel,
    stage: string,
    message: string,
    meta?: Record<string, unknown> | null,
  ): Promise<void> {
    try {
      await prisma.directorExecutionLog.create({
        data: {
          taskId,
          level,
          stage,
          message,
          detail: meta ? JSON.stringify(meta) : undefined,
        },
      });
      await this.enforceLogLimit(taskId);
    } catch (error) {
      console.error("[DirectorExecutionLogger] 写入日志失败:", error);
    }
  }

  async info(taskId: string, stage: string, message: string, meta?: Record<string, unknown> | null): Promise<void> {
    return this.log(taskId, "info", stage, message, meta);
  }

  async success(taskId: string, stage: string, message: string, meta?: Record<string, unknown> | null): Promise<void> {
    return this.log(taskId, "success", stage, message, meta);
  }

  async warn(taskId: string, stage: string, message: string, meta?: Record<string, unknown> | null): Promise<void> {
    return this.log(taskId, "warn", stage, message, meta);
  }

  async error(taskId: string, stage: string, message: string, meta?: Record<string, unknown> | null): Promise<void> {
    return this.log(taskId, "error", stage, message, meta);
  }

  async getByTaskId(
    taskId: string,
    options: { limit?: number; offset?: number } = {},
  ): Promise<{
    logs: Array<{
      id: string;
      taskId: string;
      novelId: string | null;
      level: string;
      stage: string;
      message: string;
      detail: unknown;
      durationMs: number | null;
      createdAt: Date;
    }>;
    total: number;
    hasMore: boolean;
  }> {
    const limit = Math.min(options.limit ?? 50, 200);
    const offset = options.offset ?? 0;

    const [logs, total] = await Promise.all([
      prisma.directorExecutionLog.findMany({
        where: { taskId },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.directorExecutionLog.count({ where: { taskId } }),
    ]);

    return {
      logs: logs.map((log) => ({
        ...log,
        detail: log.detail ? JSON.parse(log.detail as string) : null,
      })),
      total,
      hasMore: offset + limit < total,
    };
  }

  async cleanupOldLogs(olderThanDays: number = 30): Promise<number> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - olderThanDays);
    const result = await prisma.directorExecutionLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    return result.count;
  }

  private async enforceLogLimit(taskId: string): Promise<void> {
    const count = await prisma.directorExecutionLog.count({ where: { taskId } });
    if (count > MAX_LOGS_PER_TASK) {
      const oldest = await prisma.directorExecutionLog.findMany({
        where: { taskId },
        orderBy: { createdAt: "asc" },
        take: count - MAX_LOGS_PER_TASK,
        select: { id: true },
      });
      if (oldest.length > 0) {
        await prisma.directorExecutionLog.deleteMany({
          where: { id: { in: oldest.map((o) => o.id) } },
        });
      }
    }
  }
}

export const directorExecutionLogger = new DirectorExecutionLogger();
