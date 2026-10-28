/**
 * Structured-output failures whose outcome is KNOWN: the model answered, but the
 * output could not be used (unparsable, incomplete, schema-violating, polluted by
 * reasoning, or lacking native JSON support). The model port performed no durable
 * write for such a call, so releasing its claim and retrying is safe.
 *
 * Everything else stays unknown: transport_error means the request may or may not
 * have executed, and any other error may hide a side effect. Claims for those
 * outcomes must remain claimed, exactly as before.
 *
 * The check reads the public `category` contract of StructuredOutputError
 * (server/src/llm/structuredOutput.ts) without importing the LLM layer, so the
 * production module keeps its dependency direction. The category values are the
 * same ones the rest of the codebase already matches on directly.
 */
const RETRYABLE_STRUCTURED_OUTPUT_CATEGORIES = new Set([
  "malformed_json",
  "schema_mismatch",
  "incomplete_json",
  "thinking_pollution",
  "unsupported_native_json",
]);

export function isRetryableModelOutputError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const category = (error as { category?: unknown }).category;
  return typeof category === "string" && RETRYABLE_STRUCTURED_OUTPUT_CATEGORIES.has(category);
}

/**
 * A semantic (post-validation) rejection is the same kind of known outcome:
 * the model answered, the output was fully received, assessed and rejected
 * (for example a contract that duplicates the previous chapter), and the
 * model port performed no durable write for the call. Releasing its claim
 * and retrying is safe.
 *
 * The check reads the public `promptQualityFailureKind` marker the prompt
 * runner attaches (server/src/prompting/core/promptRunner.ts) without
 * importing the prompting layer. Only the explicit `post_validate_failed`
 * mark counts: transport and other failures are never marked this way.
 */
export function isKnownPromptQualityFailure(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  return (error as { promptQualityFailureKind?: unknown }).promptQualityFailureKind === "post_validate_failed";
}
