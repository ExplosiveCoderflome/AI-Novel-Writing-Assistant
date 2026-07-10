import type { BookAnalysisStatus } from "@ai-novel/shared/types/bookAnalysis";

export function resolveLiveBookAnalysisStatus(input: {
  status: BookAnalysisStatus;
  currentStage?: string | null;
  heartbeatAt?: Date | string | null;
}): BookAnalysisStatus {
  if (input.status !== "queued") {
    return input.status;
  }

  const hasCurrentStage = typeof input.currentStage === "string" && input.currentStage.trim().length > 0;
  const hasHeartbeat = Boolean(input.heartbeatAt);

  return hasCurrentStage || hasHeartbeat ? "running" : input.status;
}
