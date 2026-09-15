import type {
  PipelineCostGuardPolicy,
  PipelineCostMode,
  PipelinePayload,
  PipelinePrefetchMode,
} from "../novelCoreShared";

export const PIPELINE_COST_GUARD_ERROR_CODE = "PIPELINE_COST_GUARD_EXCEEDED";

export class PipelineCostGuardExceededError extends Error {
  readonly code = PIPELINE_COST_GUARD_ERROR_CODE;

  constructor(
    message: string,
    readonly details: {
      scope: "job" | "chapter";
      metric: "tokens" | "llm_calls";
      current: number;
      limit: number;
    },
  ) {
    super(message);
    this.name = "PipelineCostGuardExceededError";
  }
}

export function isPipelineCostGuardExceededError(error: unknown): error is PipelineCostGuardExceededError {
  return error instanceof PipelineCostGuardExceededError
    || (
      typeof error === "object"
      && error !== null
      && "code" in error
      && (error as { code?: unknown }).code === PIPELINE_COST_GUARD_ERROR_CODE
    );
}

function readPositiveEnvInteger(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw?.trim()) {
    return undefined;
  }
  const value = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function readCostModeFromEnv(): PipelineCostMode | undefined {
  const raw = process.env.AI_NOVEL_PIPELINE_COST_MODE?.trim().toLowerCase();
  return raw === "economy" || raw === "balanced" || raw === "unlimited" ? raw : undefined;
}

function normalizeCostMode(value: PipelineCostMode | null | undefined): PipelineCostMode {
  return value ?? readCostModeFromEnv() ?? "economy";
}

function normalizePositiveInteger(value: number | null | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  const normalized = Math.floor(value);
  return normalized > 0 ? normalized : undefined;
}

function normalizeWarningRatio(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0.8;
  }
  return Math.max(0.1, Math.min(0.99, value));
}

function mergePolicy(
  base: Required<PipelineCostGuardPolicy>,
  override: PipelineCostGuardPolicy | null | undefined,
): Required<PipelineCostGuardPolicy> {
  return {
    maxJobTotalTokens: normalizePositiveInteger(override?.maxJobTotalTokens) ?? base.maxJobTotalTokens,
    maxJobLlmCalls: normalizePositiveInteger(override?.maxJobLlmCalls) ?? base.maxJobLlmCalls,
    maxChapterTotalTokens: normalizePositiveInteger(override?.maxChapterTotalTokens) ?? base.maxChapterTotalTokens,
    maxChapterLlmCalls: normalizePositiveInteger(override?.maxChapterLlmCalls) ?? base.maxChapterLlmCalls,
    warningRatio: normalizeWarningRatio(override?.warningRatio ?? base.warningRatio),
  };
}

function buildBasePolicy(mode: PipelineCostMode, chapterCount: number): Required<PipelineCostGuardPolicy> | null {
  const chapters = Math.max(1, Math.floor(chapterCount));
  if (mode === "unlimited") {
    return null;
  }
  if (mode === "balanced") {
    return {
      maxJobTotalTokens: readPositiveEnvInteger("AI_NOVEL_MAX_JOB_TOKENS") ?? 90_000 * chapters,
      maxJobLlmCalls: readPositiveEnvInteger("AI_NOVEL_MAX_JOB_LLM_CALLS") ?? 10 * chapters,
      maxChapterTotalTokens: readPositiveEnvInteger("AI_NOVEL_MAX_CHAPTER_TOKENS") ?? 75_000,
      maxChapterLlmCalls: readPositiveEnvInteger("AI_NOVEL_MAX_CHAPTER_LLM_CALLS") ?? 9,
      warningRatio: 0.8,
    };
  }
  return {
    maxJobTotalTokens: readPositiveEnvInteger("AI_NOVEL_MAX_JOB_TOKENS") ?? 60_000 * chapters,
    maxJobLlmCalls: readPositiveEnvInteger("AI_NOVEL_MAX_JOB_LLM_CALLS") ?? 7 * chapters,
    maxChapterTotalTokens: readPositiveEnvInteger("AI_NOVEL_MAX_CHAPTER_TOKENS") ?? 55_000,
    maxChapterLlmCalls: readPositiveEnvInteger("AI_NOVEL_MAX_CHAPTER_LLM_CALLS") ?? 6,
    warningRatio: 0.8,
  };
}

export function resolvePipelineCostMode(value: PipelineCostMode | null | undefined): PipelineCostMode {
  return normalizeCostMode(value);
}

export function resolvePipelinePrefetchMode(input: {
  costMode: PipelineCostMode;
  prefetchMode?: PipelinePrefetchMode | null;
}): PipelinePrefetchMode {
  if (input.prefetchMode) {
    return input.prefetchMode;
  }
  return input.costMode === "economy" ? "disabled" : "enabled";
}

export function resolvePipelineCostGuardPolicy(input: {
  costMode?: PipelineCostMode | null;
  chapterCount: number;
  costGuard?: PipelineCostGuardPolicy | null;
}): Required<PipelineCostGuardPolicy> | null {
  const mode = normalizeCostMode(input.costMode);
  const base = buildBasePolicy(mode, input.chapterCount);
  return base ? mergePolicy(base, input.costGuard) : null;
}

export function buildPipelineBudgetContext(input: {
  policy: Required<PipelineCostGuardPolicy> | null;
  jobBaseline?: {
    totalTokens?: number | null;
    llmCallCount?: number | null;
  } | null;
  chapterBaseline?: {
    totalTokens?: number | null;
    llmCallCount?: number | null;
  } | null;
}) {
  if (!input.policy) {
    return undefined;
  }
  return {
    maxJobTotalTokens: input.policy.maxJobTotalTokens,
    maxJobLlmCalls: input.policy.maxJobLlmCalls,
    maxChapterTotalTokens: input.policy.maxChapterTotalTokens,
    maxChapterLlmCalls: input.policy.maxChapterLlmCalls,
    warningRatio: input.policy.warningRatio,
    jobBaselineTotalTokens: Math.max(0, Math.round(input.jobBaseline?.totalTokens ?? 0)),
    jobBaselineLlmCallCount: Math.max(0, Math.round(input.jobBaseline?.llmCallCount ?? 0)),
    chapterBaselineTotalTokens: Math.max(0, Math.round(input.chapterBaseline?.totalTokens ?? 0)),
    chapterBaselineLlmCallCount: Math.max(0, Math.round(input.chapterBaseline?.llmCallCount ?? 0)),
  };
}

export function buildCostGuardPayloadPatch(input: {
  payload: PipelinePayload;
  costMode: PipelineCostMode;
  prefetchMode: PipelinePrefetchMode;
  costGuard: Required<PipelineCostGuardPolicy> | null;
}): PipelinePayload {
  return {
    ...input.payload,
    costMode: input.costMode,
    prefetchMode: input.prefetchMode,
    ...(input.costGuard ? { costGuard: input.costGuard } : {}),
  };
}
