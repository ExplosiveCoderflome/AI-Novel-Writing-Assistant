import type {
  DirectorAutoExecutionState,
  DirectorCircuitBreakerReason,
  DirectorCircuitBreakerState,
} from "@ai-novel/shared/types/novelDirector";

export const DIRECTOR_CIRCUIT_BREAKER_THRESHOLDS = {
  modelFailureOpenAt: 3,
  // A chapter with one normal repair cycle costs ~55-60k tokens (write + accept×2 + patch
  // + timeline + artifact_delta). 80k allows up to two repair cycles before triggering.
  // Anything beyond two repairs per chapter is genuinely abnormal and warrants a pause.
  chapterTotalTokenLimit: 80_000,
  singleStepTotalTokenLimit: 150_000,
  usageAnomalyOpenAt: 2,
} as const;

export function isDirectorCircuitBreakerOpen(
  state: DirectorCircuitBreakerState | null | undefined,
): state is DirectorCircuitBreakerState & { status: "open" } {
  return state?.status === "open";
}

export function buildClosedDirectorCircuitBreakerState(
  previous?: DirectorCircuitBreakerState | null,
): DirectorCircuitBreakerState {
  return {
    status: "closed",
    resetAt: new Date().toISOString(),
    patchFailureCount: previous?.patchFailureCount ?? 0,
    replanLoopCount: previous?.replanLoopCount ?? 0,
    modelFailureCount: previous?.modelFailureCount ?? 0,
    usageAnomalyCount: previous?.usageAnomalyCount ?? 0,
  };
}

function recoveryActionFor(reason: DirectorCircuitBreakerReason): DirectorCircuitBreakerState["recoveryAction"] {
  if (reason === "model_unavailable" || reason === "service_unavailable") {
    return "switch_model";
  }
  if (reason === "protected_user_content") {
    return "confirm_protected_content";
  }
  if (reason === "auto_repair_exhausted") {
    return "manual_repair";
  }
  return "resume_after_review";
}

export function openDirectorCircuitBreaker(input: {
  reason: DirectorCircuitBreakerReason;
  message: string;
  previous?: DirectorCircuitBreakerState | null;
  chapterId?: string | null;
  chapterOrder?: number | null;
  nodeKey?: string | null;
  patchFailureCount?: number;
  replanLoopCount?: number;
  modelFailureCount?: number;
  usageAnomalyCount?: number;
  lastUsageRecordId?: string | null;
}): DirectorCircuitBreakerState {
  const now = new Date().toISOString();
  return {
    status: "open",
    reason: input.reason,
    message: input.message,
    openedAt: now,
    chapterId: input.chapterId ?? null,
    chapterOrder: input.chapterOrder ?? null,
    nodeKey: input.nodeKey ?? null,
    failureCount: Math.max(
      input.patchFailureCount ?? 0,
      input.replanLoopCount ?? 0,
      input.modelFailureCount ?? 0,
      input.usageAnomalyCount ?? 0,
      input.previous?.failureCount ?? 0,
    ),
    patchFailureCount: input.patchFailureCount ?? input.previous?.patchFailureCount ?? 0,
    replanLoopCount: input.replanLoopCount ?? input.previous?.replanLoopCount ?? 0,
    modelFailureCount: input.modelFailureCount ?? input.previous?.modelFailureCount ?? 0,
    usageAnomalyCount: input.usageAnomalyCount ?? input.previous?.usageAnomalyCount ?? 0,
    lastUsageRecordId: input.lastUsageRecordId ?? input.previous?.lastUsageRecordId ?? null,
    lastEventAt: now,
    recoveryAction: recoveryActionFor(input.reason),
  };
}

export function recordModelFailureSignal(input: {
  previous?: DirectorCircuitBreakerState | null;
  reason: Extract<DirectorCircuitBreakerReason, "model_unavailable" | "service_unavailable">;
  message: string;
  nodeKey?: string | null;
}): DirectorCircuitBreakerState {
  const previousCount = input.previous?.reason === input.reason
    ? input.previous?.modelFailureCount ?? 0
    : 0;
  const modelFailureCount = previousCount + 1;
  if (modelFailureCount >= DIRECTOR_CIRCUIT_BREAKER_THRESHOLDS.modelFailureOpenAt) {
    return openDirectorCircuitBreaker({
      reason: input.reason,
      message: input.message,
      previous: input.previous,
      nodeKey: input.nodeKey,
      modelFailureCount,
    });
  }
  return {
    status: "closed",
    reason: input.reason,
    message: input.message,
    nodeKey: input.nodeKey ?? null,
    patchFailureCount: input.previous?.patchFailureCount ?? 0,
    replanLoopCount: input.previous?.replanLoopCount ?? 0,
    modelFailureCount,
    usageAnomalyCount: input.previous?.usageAnomalyCount ?? 0,
    lastUsageRecordId: input.previous?.lastUsageRecordId ?? null,
    lastEventAt: new Date().toISOString(),
  };
}

export function recordUsageAnomalySignal(input: {
  previous?: DirectorCircuitBreakerState | null;
  usageRecordId?: string | null;
  totalTokens: number;
  nodeKey?: string | null;
}): DirectorCircuitBreakerState | null {
  if (input.totalTokens < DIRECTOR_CIRCUIT_BREAKER_THRESHOLDS.singleStepTotalTokenLimit) {
    return null;
  }
  const previousCount = input.previous?.reason === "usage_anomaly"
    && (!input.usageRecordId || input.previous.lastUsageRecordId !== input.usageRecordId)
    ? input.previous?.usageAnomalyCount ?? 0
    : 0;
  if (input.usageRecordId && input.previous?.lastUsageRecordId === input.usageRecordId) {
    return input.previous ?? null;
  }
  const usageAnomalyCount = previousCount + 1;
  const message = `单步骤 AI 用量达到 ${input.totalTokens} Tokens，已暂停以避免继续异常消耗。`;
  if (usageAnomalyCount >= DIRECTOR_CIRCUIT_BREAKER_THRESHOLDS.usageAnomalyOpenAt) {
    return openDirectorCircuitBreaker({
      reason: "usage_anomaly",
      message,
      previous: input.previous,
      nodeKey: input.nodeKey,
      usageAnomalyCount,
      lastUsageRecordId: input.usageRecordId ?? null,
    });
  }
  return {
    status: "closed",
    reason: "usage_anomaly",
    message,
    nodeKey: input.nodeKey ?? null,
    patchFailureCount: input.previous?.patchFailureCount ?? 0,
    replanLoopCount: input.previous?.replanLoopCount ?? 0,
    modelFailureCount: input.previous?.modelFailureCount ?? 0,
    usageAnomalyCount,
    lastUsageRecordId: input.usageRecordId ?? null,
    lastEventAt: new Date().toISOString(),
  };
}

export function recordChapterUsageBudgetExceededSignal(input: {
  previous?: DirectorCircuitBreakerState | null;
  usageRecordId?: string | null;
  totalTokens: number;
  chapterId?: string | null;
  chapterOrder?: number | null;
  nodeKey?: string | null;
}): DirectorCircuitBreakerState | null {
  if (input.totalTokens < DIRECTOR_CIRCUIT_BREAKER_THRESHOLDS.chapterTotalTokenLimit) {
    return null;
  }
  if (input.usageRecordId && input.previous?.lastUsageRecordId === input.usageRecordId) {
    return input.previous ?? null;
  }
  return openDirectorCircuitBreaker({
    reason: "usage_anomaly",
    message: `单章 AI 用量达到 ${input.totalTokens} Tokens，已暂停以避免继续异常消耗。`,
    previous: input.previous,
    chapterId: input.chapterId,
    chapterOrder: input.chapterOrder,
    nodeKey: input.nodeKey ?? "chapter_execution_node",
    usageAnomalyCount: Math.max(
      DIRECTOR_CIRCUIT_BREAKER_THRESHOLDS.usageAnomalyOpenAt,
      (input.previous?.usageAnomalyCount ?? 0) + 1,
    ),
    lastUsageRecordId: input.usageRecordId ?? null,
  });
}

export function withCircuitBreakerState(
  autoExecution: DirectorAutoExecutionState,
  state: DirectorCircuitBreakerState | null | undefined,
): DirectorAutoExecutionState {
  return {
    ...autoExecution,
    circuitBreaker: state ?? null,
  };
}
