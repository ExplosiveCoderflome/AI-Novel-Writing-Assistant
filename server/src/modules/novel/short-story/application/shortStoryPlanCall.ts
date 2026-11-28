import { randomUUID } from "node:crypto";
import { DEFAULT_MODEL_OUTPUT_TOKENS } from "@ai-novel/shared/types/llm";
import type { StructuredResponseEvidence } from "@ai-novel/shared/types/structuredDiagnostics";
import { runWithInvocationChain } from "../../../../llm/compatibility";
import { StructuredOutputError } from "../../../../llm/structuredOutput";
import { AppError } from "../../../../middleware/errorHandler";
import { describeShortStoryPlanBudgetFailure } from "../../../../platform/llm/diagnostics/StructuredDiagnosticStore";
import { runStructuredPrompt } from "../../../../prompting/core/promptRunner";
import type { PromptExecutionOptions } from "../../../../prompting/core/promptTypes";
import {
  shortStoryPlanPrompt,
  type ShortStoryPlanPromptInput,
} from "../../../../prompting/prompts/shortStory/shortStory.prompts";

const PLAN_RETRY_CEILING = 48 * 1024;

function initialPlanBudget(input: ShortStoryPlanPromptInput): number {
  // Estimate the amount of plan detail without deciding the story's segment count.
  const segments = input.requiredSegmentCount ?? Math.ceil(input.targetWordCount / 3750);
  return DEFAULT_MODEL_OUTPUT_TOKENS + Math.max(0, Math.min(8, segments) - 4) * 2048;
}

function retryPlanBudget(response: StructuredResponseEvidence): number | undefined {
  const trace = response.budgetTrace;
  const limit = response.maxTokens;
  if (trace?.source !== "automatic" || limit == null) return undefined;

  const used = response.tokenUsage?.completionTokens;
  if (used == null ? response.finishReason !== "max_tokens" : used < limit) return undefined;

  const retryLimit = Math.min(limit * 2, PLAN_RETRY_CEILING, trace.endpointMaxTokens ?? Infinity);
  if (retryLimit <= limit) return undefined;
  // The factory adds the mandatory reasoning reserve to the automatic text allowance.
  return retryLimit - (trace.reasoningReserveTokens ?? 0);
}

export function runShortStoryPlan(input: {
  promptInput: ShortStoryPlanPromptInput;
  options: PromptExecutionOptions;
  beforeRetry?: () => Promise<void>;
}) {
  const structuredDiagnosticContext = { invocationId: randomUUID(), nextAttempt: 0 };
  let automaticMaxTokens = initialPlanBudget(input.promptInput);
  return runWithInvocationChain(async () => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await runStructuredPrompt({
          asset: shortStoryPlanPrompt,
          promptInput: input.promptInput,
          options: {
            ...input.options, automaticMaxTokens, reasoningEnabled: false, structuredDiagnosticContext,
          },
        });
      } catch (error) {
        if (!(error instanceof StructuredOutputError)) throw error;
        const response = error.diagnostics.response;
        const message = response && describeShortStoryPlanBudgetFailure(response);
        if (!message || !response) throw error;

        const nextBudget = attempt === 0 && !error.diagnostics.fallbackUsed && !input.options.signal?.aborted
          ? retryPlanBudget(response) : undefined;
        if (nextBudget == null) throw new AppError(message, 502);
        await input.beforeRetry?.();
        automaticMaxTokens = nextBudget;
      }
    }
  });
}
