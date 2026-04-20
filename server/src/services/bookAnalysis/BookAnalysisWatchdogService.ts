import { prisma } from "../../db/prisma";
import { isMissingTableError } from "./bookAnalysis.utils";

const BOOK_ANALYSIS_WATCHDOG_INTERVAL_MS = 15_000;
const BOOK_ANALYSIS_STALE_TIMEOUT_MS = 120_000;

export class BookAnalysisWatchdogService {
  private watchdogTimer: NodeJS.Timeout | null = null;

  constructor(private readonly enqueueFullAnalysis: (analysisId: string) => void) {}

  startWatchdog(): void {
    if (this.watchdogTimer) {
      return;
    }
    this.watchdogTimer = setInterval(() => {
      void this.recoverTimedOutAnalyses().catch((error) => {
        console.warn("Failed to recover timed out book analyses.", error);
      });
    }, BOOK_ANALYSIS_WATCHDOG_INTERVAL_MS);
  }

  async markPendingAnalysesForManualRecovery(): Promise<void> {
    try {
      const rows = await prisma.bookAnalysis.findMany({
        where: {
          status: {
            in: ["queued", "running"],
          },
          pendingManualRecovery: false,
        },
        select: { id: true, status: true },
      });
      if (rows.length === 0) {
        return;
      }
      const runningIds = rows.filter((item) => item.status === "running").map((item) => item.id);
      if (runningIds.length > 0) {
        await prisma.bookAnalysis.updateMany({
          where: {
            id: { in: runningIds },
          },
          data: {
            status: "queued",
            pendingManualRecovery: true,
            lastError: "服务重启后任务已暂停，等待手动恢复。",
            heartbeatAt: null,
            currentStage: null,
            currentItemKey: null,
            currentItemLabel: null,
            cancelRequestedAt: null,
          },
        });
      }
      const queuedIds = rows.filter((item) => item.status === "queued").map((item) => item.id);
      if (queuedIds.length > 0) {
        await prisma.bookAnalysis.updateMany({
          where: {
            id: { in: queuedIds },
          },
          data: {
            pendingManualRecovery: true,
            lastError: "服务重启后任务已暂停，等待手动恢复。",
            heartbeatAt: null,
            cancelRequestedAt: null,
          },
        });
      }
    } catch (error) {
      if (isMissingTableError(error)) {
        return;
      }
      throw error;
    }
  }

  async recoverTimedOutAnalyses(): Promise<void> {
    const cutoff = new Date(Date.now() - BOOK_ANALYSIS_STALE_TIMEOUT_MS);
    const rows = await prisma.bookAnalysis.findMany({
      where: {
        status: "running",
        pendingManualRecovery: false,
        OR: [
          { heartbeatAt: { lt: cutoff } },
          { heartbeatAt: null, updatedAt: { lt: cutoff } },
        ],
      },
      select: {
        id: true,
        attemptCount: true,
        maxAttempts: true,
      },
    });

    for (const row of rows) {
      if (row.attemptCount < row.maxAttempts) {
        await prisma.$transaction(async (tx) => {
          await tx.bookAnalysis.update({
            where: { id: row.id },
            data: {
              status: "queued",
              lastError: null,
              heartbeatAt: null,
              currentStage: null,
              currentItemKey: null,
              currentItemLabel: null,
              cancelRequestedAt: null,
              attemptCount: { increment: 1 },
            },
          });
          await tx.bookAnalysisSection.updateMany({
            where: {
              analysisId: row.id,
              frozen: false,
            },
            data: {
              status: "idle",
            },
          });
        });
        this.enqueueFullAnalysis(row.id);
        continue;
      }

      await prisma.bookAnalysis.update({
        where: { id: row.id },
        data: {
          status: "failed",
          progress: 1,
          lastError: "任务心跳超时",
          heartbeatAt: null,
          currentStage: null,
          currentItemKey: null,
          currentItemLabel: null,
          cancelRequestedAt: null,
        },
      });
    }
  }
}
