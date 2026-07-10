import { prisma } from "../../db/prisma";
import { ragConfig } from "../../config/rag";

const DEFAULT_CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;

export class RagRetrievalTraceRetention {
  private timer: NodeJS.Timeout | null = null;

  start(intervalMs = DEFAULT_CLEANUP_INTERVAL_MS): void {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => {
      void this.clearExpiredTraces().catch((error) => {
        console.warn("[rag] failed to clean retrieval traces", error);
      });
    }, intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (!this.timer) {
      return;
    }
    clearInterval(this.timer);
    this.timer = null;
  }

  async clearExpiredTraces(now = new Date()): Promise<{ deletedCount: number; cutoff: Date }> {
    const cutoff = new Date(now.getTime() - ragConfig.retrievalTraceRetentionDays * 24 * 60 * 60 * 1000);
    const result = await prisma.ragRetrievalTrace.deleteMany({
      where: {
        createdAt: {
          lt: cutoff,
        },
      },
    });
    return {
      deletedCount: result.count,
      cutoff,
    };
  }
}
