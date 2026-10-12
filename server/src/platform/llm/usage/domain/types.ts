import type { LlmInputCacheUsage } from "@ai-novel/shared/types/llmUsage";
export type UsageProtocol = "openai-compatible" | "anthropic" | "gemini-native";
export interface UsageDecodeOptions {
    protocol?: UsageProtocol;
}
export interface LlmTokenUsageSnapshot {
    promptTokens: number;
    completionTokens: number;
    reasoningTokens?: number;
    totalTokens: number;
    inputCache?: LlmInputCacheUsage | null;
}
export function unknownCache(status: "unavailable" | "invalid" = "unavailable"): LlmInputCacheUsage {
    return { cacheHitTokens: null, cacheMissTokens: null, cacheWriteTokens: null, cacheUsageStatus: status };
}
export function tokenCount(value: unknown): number | null {
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
