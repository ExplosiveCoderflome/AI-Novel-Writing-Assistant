import type { LLMProvider } from "@ai-novel/shared/types/llm";
import type { TaskType } from "./modelRouter";
import type { PromptInvocationMeta } from "../prompting/core/promptTypes";
import { appendLlmRepairSessionLog } from "./sessionLogFile";

interface StructuredRepairLogInput {
  event: "repair_start" | "repair_done" | "repair_error";
  label: string;
  repairAttempt: number;
  provider?: LLMProvider;
  model?: string;
  taskType?: TaskType;
  promptMeta?: PromptInvocationMeta;
  validationError?: string;
  repairSystem?: string;
  repairHuman?: string;
  rawOutput?: string;
  latencyMs?: number;
  error?: unknown;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

function buildPromptMeta(promptMeta?: PromptInvocationMeta): Record<string, unknown> | null {
  if (!promptMeta) {
    return null;
  }

  return {
    promptId: promptMeta.promptId,
    promptVersion: promptMeta.promptVersion,
    taskType: promptMeta.taskType,
    estimatedInputTokens: promptMeta.estimatedInputTokens,
    repairUsed: promptMeta.repairUsed,
    repairAttempts: promptMeta.repairAttempts,
    semanticRetryUsed: promptMeta.semanticRetryUsed,
    semanticRetryAttempts: promptMeta.semanticRetryAttempts,
    contextBlockIds: promptMeta.contextBlockIds,
    droppedContextBlockIds: promptMeta.droppedContextBlockIds,
    summarizedContextBlockIds: promptMeta.summarizedContextBlockIds,
  };
}

export function logStructuredRepairSession(input: StructuredRepairLogInput): void {
  appendLlmRepairSessionLog({
    timestamp: new Date().toISOString(),
    event: input.event,
    label: input.label,
    repairAttempt: input.repairAttempt,
    provider: input.provider ?? "default",
    model: input.model ?? "default",
    taskType: input.taskType ?? "planner",
    latencyMs: input.latencyMs ?? null,
    promptMeta: buildPromptMeta(input.promptMeta),
    validationError: input.validationError ?? null,
    repairSystem: input.repairSystem ?? null,
    repairHuman: input.repairHuman ?? null,
    repairOutput: typeof input.rawOutput === "string" ? input.rawOutput : null,
    repairError: input.error instanceof Error
      ? {
        name: input.error.name,
        message: input.error.message,
        stack: input.error.stack ?? null,
      }
      : input.error != null
        ? safeStringify(input.error)
        : null,
  });
}
