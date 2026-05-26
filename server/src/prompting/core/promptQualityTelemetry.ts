import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { TaskType } from "../../llm/modelRouter";
import type { LlmTokenUsageSnapshot } from "../../llm/usageTracking";
import type { PromptMode } from "./promptTypes";

export type PromptQualityEventName =
  | "completed"
  | "failed"
  | "semantic_retry_start"
  | "semantic_retry_done"
  | "semantic_retry_recovered";

export type PromptQualityFailureKind =
  | "llm_error"
  | "schema_repair_failed"
  | "post_validate_failed"
  | "empty_output"
  | "unknown";

export interface PromptQualityEvent {
  event: PromptQualityEventName;
  promptId: string;
  promptVersion: string;
  taskType: TaskType;
  mode: PromptMode;
  provider?: LLMProvider;
  model?: string;
  stage?: string;
  entrypoint?: string;
  latencyMs?: number;
  estimatedInputTokens?: number;
  renderedPromptChars?: number;
  outputChars?: number;
  repairUsed?: boolean;
  repairAttempts?: number;
  semanticRetryUsed?: boolean;
  semanticRetryAttempts?: number;
  postValidateFailureRecovered?: boolean;
  emptyOutput?: boolean;
  failureKind?: PromptQualityFailureKind;
  tokenUsage?: LlmTokenUsageSnapshot | null;
}

export interface PromptQualitySnapshotEntry {
  key: string;
  promptId: string;
  promptVersion: string;
  taskType: TaskType;
  mode: PromptMode;
  provider: string;
  model: string;
  stage: string;
  entrypoint: string;
  callCount: number;
  completedCount: number;
  failedCount: number;
  emptyOutputCount: number;
  repairRunCount: number;
  repairAttempts: number;
  semanticRetryRunCount: number;
  semanticRetryAttempts: number;
  semanticRetryStartCount: number;
  semanticRetryDoneCount: number;
  semanticRetryRecoveredCount: number;
  postValidateFailureRecoveryCount: number;
  totalLatencyMs: number;
  averageLatencyMs: number;
  totalEstimatedInputTokens: number;
  totalRenderedPromptChars: number;
  totalOutputChars: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  failuresByKind: Record<PromptQualityFailureKind, number>;
}

interface MutablePromptQualityAggregate extends PromptQualitySnapshotEntry {
  latencySamples: number;
}

function normalizeDimension(value: string | undefined): string {
  return value?.trim() || "default";
}

function buildKey(event: PromptQualityEvent): string {
  return [
    event.promptId,
    event.promptVersion,
    event.taskType,
    event.mode,
    normalizeDimension(event.provider),
    normalizeDimension(event.model),
    normalizeDimension(event.stage),
    normalizeDimension(event.entrypoint),
  ].join("|");
}

function createAggregate(event: PromptQualityEvent, key: string): MutablePromptQualityAggregate {
  return {
    key,
    promptId: event.promptId,
    promptVersion: event.promptVersion,
    taskType: event.taskType,
    mode: event.mode,
    provider: normalizeDimension(event.provider),
    model: normalizeDimension(event.model),
    stage: normalizeDimension(event.stage),
    entrypoint: normalizeDimension(event.entrypoint),
    callCount: 0,
    completedCount: 0,
    failedCount: 0,
    emptyOutputCount: 0,
    repairRunCount: 0,
    repairAttempts: 0,
    semanticRetryRunCount: 0,
    semanticRetryAttempts: 0,
    semanticRetryStartCount: 0,
    semanticRetryDoneCount: 0,
    semanticRetryRecoveredCount: 0,
    postValidateFailureRecoveryCount: 0,
    totalLatencyMs: 0,
    averageLatencyMs: 0,
    totalEstimatedInputTokens: 0,
    totalRenderedPromptChars: 0,
    totalOutputChars: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    failuresByKind: {
      llm_error: 0,
      schema_repair_failed: 0,
      post_validate_failed: 0,
      empty_output: 0,
      unknown: 0,
    },
    latencySamples: 0,
  };
}

const promptQualityAggregates = new Map<string, MutablePromptQualityAggregate>();

function applyNumericMetric(current: number, value: number | undefined): number {
  return current + (typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0);
}

function applyTokenUsage(aggregate: MutablePromptQualityAggregate, usage: LlmTokenUsageSnapshot | null | undefined): void {
  if (!usage) {
    return;
  }
  aggregate.promptTokens += usage.promptTokens;
  aggregate.completionTokens += usage.completionTokens;
  aggregate.totalTokens += usage.totalTokens;
}

export function recordPromptQualityEvent(event: PromptQualityEvent): void {
  try {
    const key = buildKey(event);
    const aggregate = promptQualityAggregates.get(key) ?? createAggregate(event, key);
    promptQualityAggregates.set(key, aggregate);

    if (event.event === "completed" || event.event === "failed") {
      aggregate.callCount += 1;
      aggregate.totalEstimatedInputTokens = applyNumericMetric(aggregate.totalEstimatedInputTokens, event.estimatedInputTokens);
      aggregate.totalRenderedPromptChars = applyNumericMetric(aggregate.totalRenderedPromptChars, event.renderedPromptChars);
      aggregate.totalOutputChars = applyNumericMetric(aggregate.totalOutputChars, event.outputChars);
      applyTokenUsage(aggregate, event.tokenUsage);
      if (typeof event.latencyMs === "number" && Number.isFinite(event.latencyMs)) {
        aggregate.totalLatencyMs += Math.max(0, Math.round(event.latencyMs));
        aggregate.latencySamples += 1;
        aggregate.averageLatencyMs = Math.round(aggregate.totalLatencyMs / aggregate.latencySamples);
      }
      if (event.repairUsed) {
        aggregate.repairRunCount += 1;
      }
      aggregate.repairAttempts = applyNumericMetric(aggregate.repairAttempts, event.repairAttempts);
      if (event.semanticRetryUsed) {
        aggregate.semanticRetryRunCount += 1;
      }
      aggregate.semanticRetryAttempts = applyNumericMetric(aggregate.semanticRetryAttempts, event.semanticRetryAttempts);
      if (event.postValidateFailureRecovered) {
        aggregate.postValidateFailureRecoveryCount += 1;
      }
      if (event.emptyOutput) {
        aggregate.emptyOutputCount += 1;
      }
    }

    if (event.event === "completed") {
      aggregate.completedCount += 1;
    } else if (event.event === "failed") {
      aggregate.failedCount += 1;
      aggregate.failuresByKind[event.failureKind ?? "unknown"] += 1;
    } else if (event.event === "semantic_retry_start") {
      aggregate.semanticRetryStartCount += 1;
    } else if (event.event === "semantic_retry_done") {
      aggregate.semanticRetryDoneCount += 1;
    } else if (event.event === "semantic_retry_recovered") {
      aggregate.semanticRetryRecoveredCount += 1;
    }
  } catch {
    // Telemetry must never affect prompt execution.
  }
}

export function getPromptQualitySnapshot(): PromptQualitySnapshotEntry[] {
  return Array.from(promptQualityAggregates.values())
    .map(({ latencySamples: _latencySamples, ...entry }) => ({ ...entry }))
    .sort((left, right) => left.key.localeCompare(right.key));
}

export function resetPromptQualityTelemetryForTests(): void {
  promptQualityAggregates.clear();
}
