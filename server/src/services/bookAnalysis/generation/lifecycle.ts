import { prisma } from "../../../db/prisma";
import type { BookAnalysisProgressUpdate } from "../shared/bookAnalysis.types";
import { AsyncLocalStorage } from "node:async_hooks";

const activeAnalyses = new Map<string, AbortController>();
const analysisExecution = new AsyncLocalStorage<AbortSignal>();

export function analysisSignal(): AbortSignal | undefined {
  return analysisExecution.getStore();
}

export function abortAnalysis(analysisId: string): void {
  activeAnalyses.get(analysisId)?.abort(new AnalysisCancelledError());
}

export function isAnalysisCancelled(error: unknown): boolean {
  return error instanceof AnalysisCancelledError || analysisSignal()?.aborted === true;
}

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
  if (analysisSignal()?.aborted) return;
  await prisma.bookAnalysis.update({
    where: { id: analysisId, status: { in: ["queued", "running"] }, cancelRequestedAt: null },
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
  const controller = new AbortController();
  activeAnalyses.set(analysisId, controller);
  // Persisted cancellation is authoritative even when the command arrives in another process.
  const cancellationTimer = setInterval(() => {
    void ensureNotCancelled(analysisId).catch(error => {
      if (error instanceof AnalysisCancelledError) controller.abort(error);
    });
  }, 500);
  cancellationTimer.unref?.();
  const timer = setInterval(() => {
    void touchAnalysisHeartbeat(analysisId).catch(() => {});
  }, BOOK_ANALYSIS_HEARTBEAT_INTERVAL_MS);
  timer.unref?.();

  try {
    return await analysisExecution.run(controller.signal, run);
  } finally {
    clearInterval(timer);
    clearInterval(cancellationTimer);
    if (activeAnalyses.get(analysisId) === controller) activeAnalyses.delete(analysisId);
  }
}

export async function ensureNotCancelled(analysisId: string): Promise<void> {
  analysisSignal()?.throwIfAborted();
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
      pendingManualRecovery: false,
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
