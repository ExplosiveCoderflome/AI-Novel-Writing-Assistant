import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { DEFAULT_MODEL_OUTPUT_TOKENS } from "@ai-novel/shared/types/llm";
import { resolveLLMClientOptions } from "../../../../llm/factory";
import { runWithInvocationChain } from "../../../../llm/compatibility";
import {
  extractStructuredOutputErrorCategory,
  StructuredOutputError,
  type StructuredOutputErrorCategory,
} from "../../../../llm/structuredOutput";
import { runStructuredPrompt } from "../../../../prompting/core/promptRunner";
import type {
  PromptAsset,
  PromptExecutionOptions,
  PromptRunResult,
} from "../../../../prompting/core/promptTypes";

// Outline proposal calls carry a whole batch of edits in one structured
// response. A large request (for example asking for 120 chapters in one edit)
// can exhaust the planner route's output budget mid-response. Proposal calls
// therefore get exactly one automatic retry with a doubled budget and thinking
// off when the output budget is exhausted; the first attempt keeps the route's
// configured behavior untouched, and any other failure surfaces unchanged.
const OUTLINE_PROPOSAL_BUDGET_RETRY_CEILING = 32_768;

export interface OutlineProposalStructuredCallDependencies {
  invoke?: typeof runStructuredPrompt;
  resolveRoute?: (
    taskType: "planner",
    override?: { provider?: LLMProvider; model?: string },
  ) => Promise<{ routeMaxTokens?: number; endpointMaxTokens?: number; reasoningReserveTokens?: number }>;
}

export async function runOutlineProposalStructuredCall<I, O>(input: {
  asset: PromptAsset<I, O>;
  promptInput: I;
  options?: PromptExecutionOptions;
}, dependencies: OutlineProposalStructuredCallDependencies = {}): Promise<PromptRunResult<O>> {
  const invoke = dependencies.invoke ?? runStructuredPrompt;
  const resolveRoute = dependencies.resolveRoute
    ?? (async (taskType: "planner", override?: { provider?: LLMProvider; model?: string }) => {
      const resolved = await resolveLLMClientOptions(override?.provider, { taskType, model: override?.model });
      return {
        routeMaxTokens: resolved.budgetTrace?.routeMaxTokens ?? undefined,
        endpointMaxTokens: resolved.budgetTrace?.endpointMaxTokens ?? undefined,
        reasoningReserveTokens: resolved.budgetTrace?.reasoningReserveTokens,
      };
    });
  const call = (overrides?: PromptExecutionOptions) => invoke({
    asset: input.asset,
    promptInput: input.promptInput,
    options: { ...input.options, ...overrides },
  });
  return runWithInvocationChain(async () => {
    try {
      return await call();
    } catch (error) {
      if (!canRetryOutlineProposalBudget(error)) throw error;
      let routeInfo: { routeMaxTokens?: number; endpointMaxTokens?: number; reasoningReserveTokens?: number };
      try {
        routeInfo = await resolveRoute("planner", {
          provider: input.options?.provider,
          model: input.options?.model,
        });
      } catch {
        throw error;
      }
      const configuredMaxTokens = input.options?.maxTokens ?? routeInfo.routeMaxTokens;
      if (configuredMaxTokens != null) throw error;
      const endpointMaxTokens = routeInfo.endpointMaxTokens ?? Number.POSITIVE_INFINITY;
      const reasoningReserve = routeInfo.reasoningReserveTokens ?? 0;
      const effectiveMaxTokens = error instanceof StructuredOutputError
        ? error.diagnostics.response?.maxTokens ?? DEFAULT_MODEL_OUTPUT_TOKENS
        : DEFAULT_MODEL_OUTPUT_TOKENS;
      const retryMaxTokens = Math.min(OUTLINE_PROPOSAL_BUDGET_RETRY_CEILING, endpointMaxTokens, effectiveMaxTokens * 2);
      if (retryMaxTokens <= effectiveMaxTokens) throw error;
      return call({ reasoningEnabled: false, automaticMaxTokens: retryMaxTokens - reasoningReserve });
    }
  });
}

function isBudgetExhaustedCategory(category: StructuredOutputErrorCategory | null): boolean {
  return category === "reasoning_budget_exhausted" || category === "output_budget_exhausted";
}

function canRetryOutlineProposalBudget(error: unknown): boolean {
  const category = error instanceof StructuredOutputError
    ? error.category
    : extractStructuredOutputErrorCategory(
      error instanceof Error ? error.message : String(error ?? ""),
    );
  if (!isBudgetExhaustedCategory(category)) return false;
  if (!(error instanceof StructuredOutputError)) return false;
  const response = error.diagnostics.response;
  const used = response?.tokenUsage?.completionTokens;
  if (used != null && response?.maxTokens != null) return used >= response.maxTokens;
  // "length" is the standard OpenAI finish reason for max-tokens truncation;
  // several endpoints report it instead of "max_tokens".
  return error.category === "reasoning_budget_exhausted"
    || response?.finishReason === "max_tokens"
    || response?.finishReason === "length";
}
