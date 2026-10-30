import type { StructuredFailureReason, StructuredResponseEvidence } from "@ai-novel/shared/types/structuredDiagnostics";
import { extractLlmTokenUsage, mergeStreamTokenUsage } from "../usage";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}
function token(value: unknown): string | null {
  return typeof value === "string" && /^[a-zA-Z0-9_.:-]{1,100}$/.test(value) ? value : null;
}
function status(value: unknown): number | null {
  return typeof value === "number" && value >= 100 && value <= 599 ? value : null;
}

export function emptyResponseEvidence(maxTokens?: number): StructuredResponseEvidence {
  return { failureReason: null, finishReason: null, refused: false, contentChars: 0, reasoningChars: 0,
    httpStatus: null, providerCode: null, retryAfterMs: null, durationMs: 0,
    maxTokens: maxTokens ?? null, tokenUsage: null, errorChain: [] };
}

export function observeStructuredChunk(evidence: StructuredResponseEvidence, chunk: unknown): void {
  const source = record(chunk);
  const metadata = record(source.response_metadata);
  const extra = record(source.additional_kwargs);
  evidence.finishReason = token(metadata.finish_reason ?? metadata.stop_reason ?? extra.finish_reason) ?? evidence.finishReason;
  evidence.refused ||= Boolean(extra.refusal || metadata.refusal || metadata.blocked);
  const usage = extractLlmTokenUsage(chunk);
  evidence.tokenUsage = mergeStreamTokenUsage(evidence.tokenUsage, usage);
}

export function classifyResponseEvidence(
  evidence: StructuredResponseEvidence, error?: unknown, category?: string, cancelled = false,
): StructuredFailureReason | null {
  if (cancelled) return "cancelled";
  const seen = new Set<unknown>();
  let current = error;
  while (current && !seen.has(current) && seen.size < 6) {
    seen.add(current);
    const item = record(current);
    const code = token(item.code ?? record(item.error).code);
    const httpStatus = status(item.status ?? item.statusCode);
    evidence.errorChain.push({ name: token(item.name) ?? "Error", code, status: httpStatus });
    evidence.httpStatus ??= httpStatus;
    evidence.providerCode ??= code;
    const headers = item.headers as { get?: (key: string) => unknown } | undefined;
    const retryAfter = typeof headers?.get === "function" ? headers.get("retry-after") : record(headers)["retry-after"];
    if (typeof retryAfter === "string" || typeof retryAfter === "number") {
      const seconds = Number(retryAfter);
      const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(String(retryAfter)) - Date.now();
      if (Number.isFinite(delay) && delay >= 0) evidence.retryAfterMs ??= Math.ceil(delay);
    }
    current = item.cause;
  }
  if (evidence.refused || evidence.finishReason === "content_filter" || evidence.finishReason === "refusal") return "blocked";
  if (evidence.httpStatus === 429) return "rate_limited";
  if (evidence.errorChain.some((item) => ["ETIMEDOUT", "ESOCKETTIMEDOUT"].includes(item.code ?? "")
    || ["TimeoutError", "APITimeoutError"].includes(item.name))) return "timeout";
  if (evidence.errorChain.some((item) => ["ECONNRESET", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ECONNABORTED"].includes(item.code ?? "")
    || item.name === "APIConnectionError")) return "network";
  if (evidence.finishReason === "length" || evidence.finishReason === "max_tokens") {
    return evidence.contentChars === 0 && evidence.reasoningChars > 0 ? "reasoning_budget_exhausted" : "output_budget_exhausted";
  }
  if (category === "schema_mismatch") return "schema_validation";
  if (category === "malformed_json" || category === "incomplete_json" || category === "thinking_pollution") return "invalid_json";
  if (evidence.contentChars === 0 && !error) return "empty_response";
  return error ? "unknown" : null;
}

export function terminalResponseReason(reason?: StructuredFailureReason | null): boolean {
  return reason === "blocked" || reason === "cancelled" || reason === "reasoning_budget_exhausted"
    || reason === "output_budget_exhausted" || reason === "empty_response";
}
