/** Approximate full-request safety budget; not a claim about an unknown gateway's tokenizer/window. */
export function estimatePromptTokens(text: string): number {
  return text.length ? Math.ceil(Buffer.byteLength(text, "utf8") / 3) : 0;
}

export class PromptInputBudgetError extends Error {
  readonly code = "LLM_INPUT_BUDGET_EXCEEDED";
  readonly retryable = false;
  constructor(readonly inputTokens: number, readonly reservedOutputTokens: number, readonly windowTokens: number) {
    super(`完整请求估算 ${inputTokens} tokens，输出预留 ${reservedOutputTokens} tokens，超过本地安全预算 ${windowTokens} tokens。请分段处理来源或缩小生成范围。`);
  }
}

export function assertPromptBudget(text: string, maxOutputTokens = 8192, schemaText = "", capabilities?: {
  contextWindowTokens: number | null; maxInputTokens: number | null; budgetSharing: "unknown" | "shared" | "separate";
}): number {
  const inputTokens = estimatePromptTokens(text + schemaText) + 256;
  const configured = Number(process.env.AI_NOVEL_CONTEXT_WINDOW_TOKENS);
  const windowTokens = capabilities?.contextWindowTokens ?? (Number.isSafeInteger(configured) && configured > 0 ? configured : undefined);
  const explicitInput = capabilities?.maxInputTokens ?? Number(process.env.AI_NOVEL_MAX_INPUT_TOKENS);
  const outputTokens = Number.isFinite(maxOutputTokens) && maxOutputTokens > 0 ? maxOutputTokens : 8192;
  if (Number.isSafeInteger(explicitInput) && explicitInput > 0 && inputTokens > explicitInput) {
    throw new PromptInputBudgetError(inputTokens, 0, explicitInput);
  }
  // Reasoning capacity is metadata, never added to generated tokens. Unknown sharing is not inferred.
  const generatedReserve = capabilities?.budgetSharing === "shared" ? outputTokens : 0;
  if (windowTokens !== undefined && inputTokens + generatedReserve > windowTokens) {
    throw new PromptInputBudgetError(inputTokens, generatedReserve, windowTokens);
  }
  return inputTokens;
}
