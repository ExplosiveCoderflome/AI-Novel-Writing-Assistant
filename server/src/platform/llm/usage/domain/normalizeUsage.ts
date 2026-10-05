import { summarizeUsage } from "./summarizeUsage";
import { tokenCount, unknownCache, type LlmTokenUsageSnapshot, type UsageDecodeOptions } from "./types";
import type { LlmInputCacheUsage } from "@ai-novel/shared/types/llmUsage";

type Obj = Record<string, any>;
function object(value: unknown): Obj { return value && typeof value === "object" ? value as Obj : {}; }
function first(...values: unknown[]): unknown { return values.find(value => value !== undefined && value !== null); }

function base(u: Obj, nativeAnthropic: boolean): LlmTokenUsageSnapshot | null {
  let promptTokens = tokenCount(first(u.prompt_tokens, u.promptTokens, u.input_tokens, u.inputTokens, u.promptTokenCount)) ?? 0;
  if (nativeAnthropic) promptTokens += (tokenCount(u.cache_read_input_tokens) ?? 0) + (tokenCount(u.cache_creation_input_tokens) ?? 0);
  const completionTokens = tokenCount(first(u.completion_tokens, u.completionTokens, u.output_tokens, u.outputTokens, u.candidatesTokenCount)) ?? 0;
  const reasoningTokens = tokenCount(first(u.completion_tokens_details?.reasoning_tokens, u.output_token_details?.reasoning, u.outputTokenDetails?.reasoning, u.thoughtsTokenCount));
  const totalTokens = Math.max(tokenCount(first(u.total_tokens, u.totalTokens, u.totalTokenCount)) ?? 0, promptTokens + completionTokens);
  if (!totalTokens) return null;
  return { promptTokens, completionTokens, totalTokens, ...(reasoningTokens !== null ? { reasoningTokens } : {}) };
}

function cache(u: Obj, total: number): LlmInputCacheUsage {
  // Only fields actually supplied by the provider establish a cache observation.
  const reads = [u.prompt_cache_hit_tokens, u.prompt_tokens_details?.cached_tokens,
    u.input_tokens_details?.cached_tokens, u.input_token_details?.cache_read,
    u.cached_tokens, u.cachedContentTokenCount, u.cache_read_input_tokens].filter(v => v !== undefined && v !== null);
  const writes = [u.cache_creation_input_tokens, u.input_token_details?.cache_creation,
    u.input_tokens_details?.cache_write_tokens, u.prompt_tokens_details?.cache_creation_input_tokens].filter(v => v !== undefined && v !== null);
  const missRaw = u.prompt_cache_miss_tokens;
  if (!reads.length) return unknownCache();
  if ([...reads,...writes,...(missRaw !== undefined && missRaw !== null ? [missRaw] : [])].some(v => tokenCount(v) === null)) return unknownCache("invalid");
  const read = reads[0] as number;
  const write = writes.length ? writes[0] as number : null;
  if (reads.some(v => v !== read) || writes.some(v => v !== write) || read > total
    || (missRaw != null && read + missRaw !== total) || (write !== null && write > total - read)) return unknownCache("invalid");
  return { cacheHitTokens: read, cacheMissTokens: total - read, cacheWriteTokens: write, cacheUsageStatus: "reported" };
}

export function extractLlmTokenUsage(output: unknown, options: UsageDecodeOptions = {}): LlmTokenUsageSnapshot | null {
  if (Array.isArray(output)) return summarizeUsage(output.map(item => extractLlmTokenUsage(item, options)));
  const c = object(output);
  const sources = [
    { u: object(c.usage_metadata), sdk: true }, { u: object(c.usageMetadata), sdk: options.protocol !== "gemini-native" },
    { u: object(c.response_metadata?.usage), sdk: false }, { u: object(c.response_metadata?.tokenUsage), sdk: true },
    { u: object(c.responseMetadata?.usage), sdk: false }, { u: object(c.responseMetadata?.tokenUsage), sdk: true },
    { u: object(c.llmOutput?.tokenUsage), sdk: true },
  ];
  const candidates = sources.map(({u,sdk}) => ({ u, usage: base(u, !sdk && (options.protocol === "anthropic" || "cache_read_input_tokens" in u || "cache_creation_input_tokens" in u)) }));
  const usage = candidates.find(c => c.usage)?.usage;
  if (!usage) return null;
  const caches = candidates.map(c => cache(c.u, usage.promptTokens)).filter(c => c.cacheUsageStatus !== "unavailable");
  const reported = caches.filter(c => c.cacheUsageStatus === "reported");
  const mismatch = reported.some(c => c.cacheHitTokens !== reported[0]?.cacheHitTokens || c.cacheMissTokens !== reported[0]?.cacheMissTokens);
  const writes = reported.map(c => c.cacheWriteTokens).filter(v => v !== null);
  usage.inputCache = caches.some(c => c.cacheUsageStatus === "invalid") || mismatch || writes.some(v => v !== writes[0])
    ? unknownCache("invalid") : reported.length ? { ...reported[0], cacheWriteTokens: writes[0] ?? null } : unknownCache();
  return usage;
}
