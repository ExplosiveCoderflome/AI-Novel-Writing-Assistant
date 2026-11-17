import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { resolveLLMClientOptions } from "../../../../llm/factory";
import { runWithInvocationChain } from "../../../../llm/compatibility";
import {
  extractStructuredOutputErrorCategory,
  StructuredOutputError,
} from "../../../../llm/structuredOutput";
import type { selectContextBlocks } from "../../../../prompting/core/contextSelection";
import { runStructuredPrompt } from "../../../../prompting/core/promptRunner";
import type {
  PromptAsset,
  PromptExecutionOptions,
  PromptRunResult,
} from "../../../../prompting/core/promptTypes";
import { resolveDirectorCandidatesOutputTokenBudget } from "../../../../prompting/prompts/novel/promptBudgetProfiles";

// Book-level candidate calls carry several full direction drafts. Deep thinking
// shares the output budget with the drafts, so a thinking model can burn the
// whole budget before producing any draft text. Candidate calls therefore run
// with thinking off, on a budget that is never below the count-scaled floor,
// and get exactly one automatic retry with a doubled budget when the output
// budget is exhausted anyway (for example when the endpoint ignores the
// thinking switch). Any other failure surfaces unchanged.
const CANDIDATE_BUDGET_RETRY_CEILING = 32_768;

export function isBudgetExhaustedStructuredError(error: unknown): boolean {
  const category = error instanceof StructuredOutputError
    ? error.category
    : extractStructuredOutputErrorCategory(
      error instanceof Error ? error.message : String(error ?? ""),
    );
  return category === "reasoning_budget_exhausted"
    || category === "output_budget_exhausted";
}

export interface CandidateStructuredCallDependencies {
  invoke?: typeof runStructuredPrompt;
  resolveRoute?: (
    taskType: "planner",
    override?: { provider?: LLMProvider; model?: string },
  ) => Promise<{ routeMaxTokens?: number; endpointMaxTokens?: number; reasoningReserveTokens?: number }>;
}

export async function runCandidateStructuredCall<I, O>(input: {
  asset: PromptAsset<I, O>;
  promptInput: I;
  contextBlocks?: Parameters<typeof selectContextBlocks>[0];
  options?: PromptExecutionOptions;
  candidateCount: number;
}, dependencies: CandidateStructuredCallDependencies = {}): Promise<PromptRunResult<O>> {
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
  const route = await resolveRoute("planner", {
    provider: input.options?.provider,
    model: input.options?.model,
  });
  const automaticMaxTokens = resolveDirectorCandidatesOutputTokenBudget(input.candidateCount);
  const configuredMaxTokens = input.options?.maxTokens ?? route.routeMaxTokens;
  const endpointMaxTokens = route.endpointMaxTokens ?? Number.POSITIVE_INFINITY;
  const reasoningReserve = route.reasoningReserveTokens ?? 0;
  const baseMaxTokens = Math.min(configuredMaxTokens ?? automaticMaxTokens + reasoningReserve, endpointMaxTokens);
  const retryMaxTokens = Math.min(CANDIDATE_BUDGET_RETRY_CEILING, endpointMaxTokens, baseMaxTokens * 2);
  const call = (budget: number) => invoke({
    asset: input.asset,
    promptInput: input.promptInput,
    contextBlocks: input.contextBlocks,
    options: { ...input.options, reasoningEnabled: false, automaticMaxTokens: budget },
  });
  return runWithInvocationChain(async () => {
    try {
      return await call(automaticMaxTokens);
    } catch (error) {
      if (configuredMaxTokens != null || retryMaxTokens <= baseMaxTokens || !canRetryCandidateBudget(error)) throw error;
      return call(retryMaxTokens - reasoningReserve);
    }
  });
}

function canRetryCandidateBudget(error: unknown): boolean {
  if (!isBudgetExhaustedStructuredError(error)) return false;
  if (!(error instanceof StructuredOutputError)) return false;
  const response = error.diagnostics.response;
  const used = response?.tokenUsage?.completionTokens;
  if (used != null && response?.maxTokens != null) return used >= response.maxTokens;
  return error.category === "reasoning_budget_exhausted" || response?.finishReason === "max_tokens";
}
