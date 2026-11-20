import type { StructuredResponseEvidence } from "@ai-novel/shared/types/structuredDiagnostics";
import { runWithInvocationChain } from "../../../llm/compatibility";
import { StructuredOutputError } from "../../../llm/structuredOutput";
import { AppError } from "../../../middleware/errorHandler";
import { currentModelRequestBudget } from "../../../platform/llm/retries";
import { runStructuredPrompt } from "../../../prompting/core/promptRunner";
import type { PromptExecutionOptions } from "../../../prompting/core/promptTypes";
import type { NovelThemeWorldGenerationPromptInput } from "../../../prompting/prompts/world/world.promptTypes";
import { novelThemeWorldGenerationPrompt } from "../../../prompting/prompts/world/world.prompts";
import { rethrowWithWorldGenerationTimeoutHint } from "../../settings/worldGeneration/timeoutSettings";

const WORLD_BUDGET_RETRY_CEILING = 48 * 1024;

function retryBudget(response?: StructuredResponseEvidence): number | undefined {
  if (response == null) return undefined;
  const trace = response.budgetTrace;
  if (trace == null || response.maxTokens == null) return undefined;
  // A frozen budget is a scoped override: raising it is a no-op.
  if (trace.source === "frozen") return undefined;
  // Never raise above an explicit route cap.
  if (trace.routeMaxTokens != null && response.maxTokens >= trace.routeMaxTokens) return undefined;
  const limit = response.maxTokens;
  // Some providers report visible tokens only even when thinking exhausted the request.
  const truncated = response.finishReason === "length" || response.finishReason === "max_tokens";
  if (!truncated && (response.tokenUsage?.completionTokens ?? 0) < limit) return undefined;
  const nextLimit = Math.min(limit * 2, WORLD_BUDGET_RETRY_CEILING, trace.endpointMaxTokens ?? Infinity);
  if (nextLimit <= limit) return undefined;
  // Mandatory reasoning reserve is already added by the factory.
  return nextLimit - (trace.reasoningReserveTokens ?? 0);
}

class NovelThemeWorldGenerationError extends AppError {
  readonly category: StructuredOutputError["category"];

  constructor(
    message: string,
    statusCode: number,
    cause: StructuredOutputError,
    sourceRoute: "/settings/models" | "/settings/model-routes" = "/settings/models",
  ) {
    super(message, statusCode, { sourceRoute });
    this.category = cause.category;
    this.cause = cause;
  }
}

export function runNovelThemeWorldGeneration(
  promptInput: NovelThemeWorldGenerationPromptInput,
  options: PromptExecutionOptions,
) {
  // Some endpoints bill the requested allowance against their TPM limit:
  // SenseNova accepts 6,000 but rejects 8,192+ outright with 429 before any
  // token is generated, so start small and let truncation double the budget.
  // This must be an explicit maxTokens: the automatic mechanism floors at
  // the planner default (16,384), which already trips the limit.
  const WORLD_GENERATION_START_BUDGET = 6_000;
  const WORLD_GENERATION_OPENING_START_BUDGET = 4_800;
  let requestedMaxTokens = promptInput.openingOnly
    ? WORLD_GENERATION_OPENING_START_BUDGET
    : WORLD_GENERATION_START_BUDGET;
  return runWithInvocationChain(async () => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await runStructuredPrompt({
          asset: novelThemeWorldGenerationPrompt,
          promptInput,
          options: { ...options, reasoningEnabled: false, maxTokens: requestedMaxTokens, structuredTransportRetryCount: 0 },
        });
      } catch (error) {
        if (!(error instanceof StructuredOutputError)) rethrowWithWorldGenerationTimeoutHint(error);
        const { response, target, fallbackAvailable, fallbackUsed } = error.diagnostics;
        const budgetFailure = error.category === "reasoning_budget_exhausted" || error.category === "output_budget_exhausted";
        const timedOut = error.category === "transport_error"
          && (response?.failureReason === "timeout" || response?.httpStatus === 408 || response?.httpStatus === 504);
        const rateLimited = error.category === "transport_error"
          && (response?.failureReason === "rate_limited" || response?.httpStatus === 429);
        const model = target?.model ?? options.model;
        const modelLabel = model ? `模型「${model}」` : "模型";
        // Pre-stream failures report the route default instead of the allowance
        // this attempt actually requested, so clamp to the requested budget.
        const requestLimit = response?.maxTokens == null
          ? requestedMaxTokens
          : Math.min(requestedMaxTokens, response.maxTokens);
        const limit = `本次实际申请上限为 ${requestLimit.toLocaleString("zh-CN")} Token。`;
        if (rateLimited) {
          // A reservation-based 429 cannot clear by retrying the same allowance.
          throw new NovelThemeWorldGenerationError(
            `${modelLabel}触发了限流（429）。${limit}请稍后再试，或更换模型后重试。`,
            429,
            error,
          );
        }
        if (!budgetFailure && !timedOut) throw error;

        // A configured fallback is the second chance; don't restart the primary chain afterwards.
        if (attempt === 0 && !fallbackAvailable && !fallbackUsed && !options.signal?.aborted
          && currentModelRequestBudget()?.remaining() !== 0) {
          const nextBudget = budgetFailure ? retryBudget(response) : undefined;
          if (nextBudget != null) {
            requestedMaxTokens = nextBudget;
            continue;
          }
          if (timedOut) continue;
        }

        if (timedOut) {
          const waited = response?.durationMs == null ? "" : `（本次等待 ${(response.durationMs / 1000).toFixed(1)} 秒）`;
          throw new NovelThemeWorldGenerationError(
            `${modelLabel}生成世界设定超时${waited}。${limit}请在「设置 → 模型与厂商 → 单次生成最长等待」调高等待时间，或更换模型后重试。`,
            504,
            error,
          );
        }
        const reason = error.category === "reasoning_budget_exhausted"
          ? "用完输出额度仍未返回世界设定" : "在世界设定完整返回前耗尽了输出额度";
        const routeLimited = response?.budgetTrace?.routeMaxTokens != null;
        const settingsHint = routeLimited
          ? "请在「设置 → 模型路由管理 → 大纲策划」核对最大输出长度，或更换模型后重试。"
          : "请在「设置 → 模型与厂商 → 模型兼容性」核对模型输出上限，或更换模型后重试。";
        throw new NovelThemeWorldGenerationError(
          `${modelLabel}${reason}。${limit}${settingsHint}`,
          502,
          error,
          routeLimited ? "/settings/model-routes" : "/settings/models",
        );
      }
    }
  });
}
