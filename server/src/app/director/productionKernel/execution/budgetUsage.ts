import type { LlmTokenUsageSnapshot } from "../../../../platform/llm/usage";

export interface KernelUsageAccounting {
  rawTokens: number;
  promptTokens: number;
  completionTokens: number;
  cacheHitTokens: number;
  unclassifiedTokens: number;
  usedTokens: number;
}
function count(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function accounting(rawTokens: number, promptTokens: number, completionTokens: number, cacheHitTokens: number): KernelUsageAccounting {
  const unclassifiedTokens = Math.max(0, rawTokens - promptTokens - completionTokens);
  const usedTokens = promptTokens - cacheHitTokens + completionTokens + unclassifiedTokens;
  if (![rawTokens, promptTokens, completionTokens, cacheHitTokens, unclassifiedTokens, usedTokens].every(count)
    || cacheHitTokens > promptTokens) throw new Error("Invalid kernel usage accounting");
  return { rawTokens, promptTokens, completionTokens, cacheHitTokens, unclassifiedTokens, usedTokens };
}

/** Preserve the native uncached-input metric; unknown components never create an uncharged remainder. */
export function accountKernelUsage(usage: LlmTokenUsageSnapshot | null): KernelUsageAccounting | null {
  if (!usage) return null;
  if (!count(usage.totalTokens) || (usage.promptTokens !== undefined && !count(usage.promptTokens))
    || (usage.completionTokens !== undefined && !count(usage.completionTokens))) throw new Error("Invalid observed token usage");
  const prompt = usage.promptTokens ?? 0, completion = usage.completionTokens ?? 0;
  const cache = usage.inputCache;
  const hit = cache?.cacheUsageStatus === "reported" && count(cache.cacheHitTokens) && cache.cacheHitTokens <= prompt
    ? cache.cacheHitTokens : 0;
  return accounting(usage.totalTokens, prompt, completion, hit);
}

export function readKernelUsageAccounting(rawTokens: number, value?: KernelUsageAccounting): KernelUsageAccounting {
  if (!value) return accounting(rawTokens, 0, 0, 0);
  const expected = accounting(value.rawTokens, value.promptTokens, value.completionTokens, value.cacheHitTokens);
  if (value.rawTokens !== rawTokens || value.unclassifiedTokens !== expected.unclassifiedTokens || value.usedTokens !== expected.usedTokens) {
    throw new Error("Corrupt kernel usage accounting");
  }
  return expected;
}
