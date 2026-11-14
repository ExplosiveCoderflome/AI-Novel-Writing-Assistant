require("./fixtures/compatibilitySettings.cjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const { z } = require("zod");

const factory = require("../dist/llm/factory.js");
const { invokeStructuredLlmDetailed } = require("../dist/llm/structuredInvoke.js");
const { withModelRequestBudget } = require("../dist/platform/llm/retries/index.js");
const { ProductionBudgetExceededError } = require("../dist/modules/production/common/budget.js");
const { resolveProviderReasoningBehavior } = require("../dist/llm/reasoning.js");

const schema = z.object({ ok: z.literal(true) });

function mockClients(t) {
  const originalResolve = factory.resolveLLMClientOptions;
  const originalCreate = factory.createLLMFromResolvedOptions;
  t.after(() => { factory.resolveLLMClientOptions = originalResolve; factory.createLLMFromResolvedOptions = originalCreate; });
  factory.resolveLLMClientOptions = async (provider, options = {}) => ({
    provider, providerName: provider, model: options.model, baseURL: options.baseURL,
    temperature: 0.2, authMode: "none", concurrencyLimit: 0, requestIntervalMs: 0,
    requestProtocol: "openai_compatible", structuredStrategy: options.structuredStrategy,
    executionMode: options.executionMode ?? "plain", maxTokens: options.maxTokens,
    reasoningEnabled: options.reasoningEnabled ?? false,
    ...resolveProviderReasoningBehavior({ provider, model: options.model, baseURL: options.baseURL, reasoningEnabled: options.reasoningEnabled ?? false }),
  });
  factory.createLLMFromResolvedOptions = () => ({
    stream: async function* () { yield { content: JSON.stringify({ ok: true }) }; },
  });
}

// Regression: a chapter-budget refusal raised inside beforeRequest (before any
// provider dispatch) used to be classified as transport_error and wrapped in
// StructuredOutputError, so the production kernel paused with "unknown claims"
// instead of the budget pause that offers a grant. The typed error must escape.
test("budget refusal before dispatch escapes the structured chain typed", async (t) => {
  mockClients(t);
  const budget = {
    beforeRequest: async () => { throw new ProductionBudgetExceededError(); },
    remaining: () => 0,
  };
  await assert.rejects(
    withModelRequestBudget(budget, () => invokeStructuredLlmDetailed({
      provider: "custom_budget", model: "budget", baseURL: "https://fixture.invalid/v1",
      schema, label: "budget.passthrough", systemPrompt: "JSON", userPrompt: "ok",
      disableFallbackModel: true, maxRepairAttempts: 0,
    })),
    (error) => error instanceof ProductionBudgetExceededError,
  );
});
