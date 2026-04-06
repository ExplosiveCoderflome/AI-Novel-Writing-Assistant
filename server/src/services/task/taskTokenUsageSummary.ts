import type { TaskTokenUsageSummary } from "@ai-novel/shared/types/task";

export function toTaskTokenUsageSummary(input: {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  llmCallCount: number;
  lastTokenRecordedAt?: Date | null;
}): TaskTokenUsageSummary | null {
  const promptTokens = Math.max(0, Math.round(input.promptTokens));
  const completionTokens = Math.max(0, Math.round(input.completionTokens));
  const totalTokens = Math.max(0, Math.round(input.totalTokens));
  const llmCallCount = Math.max(0, Math.round(input.llmCallCount));
  if (promptTokens === 0 && completionTokens === 0 && totalTokens === 0 && llmCallCount === 0) {
    return null;
  }
  return {
    promptTokens,
    completionTokens,
    totalTokens,
    llmCallCount,
    lastRecordedAt: input.lastTokenRecordedAt?.toISOString() ?? null,
  };
}
