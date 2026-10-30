export type StructuredFailureReason =
  | "empty_response" | "reasoning_budget_exhausted" | "output_budget_exhausted"
  | "blocked" | "rate_limited" | "network" | "timeout" | "cancelled"
  | "invalid_json" | "schema_validation" | "business_validation" | "unknown";

export interface StructuredResponseEvidence {
  failureReason: StructuredFailureReason | null;
  finishReason: string | null;
  refused: boolean;
  contentChars: number;
  reasoningChars: number;
  httpStatus: number | null;
  providerCode: string | null;
  retryAfterMs: number | null;
  durationMs: number;
  maxTokens: number | null;
  tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number; reasoningTokens?: number } | null;
  errorChain: Array<{ name: string; code: string | null; status: number | null }>;
}

export interface StructuredDiagnosticSummary {
  id: string;
  reason: StructuredFailureReason | null;
  message: string;
  provider: string | null;
  model: string | null;
  strategy: string;
  attempts: number;
  retryAt: string | null;
  response: StructuredResponseEvidence;
}
