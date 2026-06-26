import { prisma } from "../../../db/prisma";
import type { BookAnalysisProgressUpdate } from "../bookAnalysis.types";

const BOOK_ANALYSIS_HEARTBEAT_INTERVAL_MS = 20_000;

export class AnalysisCancelledError extends Error {
  constructor() {
    super("BOOK_ANALYSIS_CANCELLED");
  }
}

export async function updateAnalysisProgress(
  analysisId: string,
  update: BookAnalysisProgressUpdate,
): Promise<void> {
  await prisma.bookAnalysis.update({
    where: { id: analysisId },
    data: {
      status: "running",
      progress: update.progress,
      heartbeatAt: new Date(),
      currentStage: update.stage,
      currentItemKey: update.itemKey ?? null,
      currentItemLabel: update.itemLabel ?? null,
    },
  });
}

async function touchAnalysisHeartbeat(analysisId: string): Promise<void> {
  await prisma.bookAnalysis.updateMany({
    where: {
      id: analysisId,
      status: {
        in: ["queued", "running"],
      },
    },
    data: {
      status: "running",
      heartbeatAt: new Date(),
    },
  });
}

export async function withAnalysisHeartbeat<T>(analysisId: string, run: () => Promise<T>): Promise<T> {
  const timer = setInterval(() => {
    void touchAnalysisHeartbeat(analysisId).catch(() => {});
  }, BOOK_ANALYSIS_HEARTBEAT_INTERVAL_MS);
  timer.unref?.();

  try {
    return await run();
  } finally {
    clearInterval(timer);
  }
}

export async function ensureNotCancelled(analysisId: string): Promise<void> {
  const row = await prisma.bookAnalysis.findUnique({
    where: { id: analysisId },
    select: {
      status: true,
      cancelRequestedAt: true,
    },
  });
  if (!row || row.status === "cancelled" || row.cancelRequestedAt) {
    throw new AnalysisCancelledError();
  }
}

export async function markSucceeded(analysisId: string, summary?: string | null): Promise<void> {
  await prisma.bookAnalysis.update({
    where: { id: analysisId },
    data: {
      status: "succeeded",
      progress: 1,
      summary: summary ?? undefined,
      heartbeatAt: null,
      currentStage: null,
      currentItemKey: null,
      currentItemLabel: null,
      cancelRequestedAt: null,
    },
  });
}

export async function markFailed(analysisId: string, lastError: string): Promise<void> {
  await prisma.bookAnalysis.update({
    where: { id: analysisId },
    data: {
      status: "failed",
      progress: 1,
      lastError,
      heartbeatAt: null,
      currentStage: null,
      currentItemKey: null,
      currentItemLabel: null,
      cancelRequestedAt: null,
    },
  });
}

export async function markCancelled(analysisId: string, progress?: number): Promise<void> {
  await prisma.bookAnalysis.update({
    where: { id: analysisId },
    data: {
      status: "cancelled",
      progress: progress ?? undefined,
      lastError: null,
      heartbeatAt: null,
      currentStage: null,
      currentItemKey: null,
      currentItemLabel: null,
      cancelRequestedAt: null,
    },
  });
}
