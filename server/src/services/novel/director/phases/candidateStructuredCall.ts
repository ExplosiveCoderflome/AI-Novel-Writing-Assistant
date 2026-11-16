import type { LLMProvider } from "@ai-novel/shared/types/llm";
import { DEFAULT_MODEL_OUTPUT_TOKENS } from "@ai-novel/shared/types/llm";
import { resolveModel } from "../../../../llm/modelRouter";
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
  ) => Promise<{ maxTokens?: number }>;
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
    ?? ((taskType: "planner", override?: { provider?: LLMProvider; model?: string }) => resolveModel(taskType, override));
  const route = await resolveRoute("planner", {
    provider: input.options?.provider,
    model: input.options?.model,
  });
  const baseMaxTokens = Math.max(
    route.maxTokens ?? DEFAULT_MODEL_OUTPUT_TOKENS,
    resolveDirectorCandidatesOutputTokenBudget(input.candidateCount),
  );
  const retryMaxTokens = Math.min(CANDIDATE_BUDGET_RETRY_CEILING, baseMaxTokens * 2);

  let attempt = 0;
  for (;;) {
    try {
      return await invoke({
        asset: input.asset,
        promptInput: input.promptInput,
        contextBlocks: input.contextBlocks,
        options: {
          ...input.options,
          reasoningEnabled: false,
          maxTokens: attempt === 0 ? baseMaxTokens : retryMaxTokens,
        },
      });
    } catch (error) {
      attempt += 1;
      if (
        attempt > 1
        || retryMaxTokens <= baseMaxTokens
        || !isBudgetExhaustedStructuredError(error)
      ) {
        throw error;
      }
    }
  }
}
