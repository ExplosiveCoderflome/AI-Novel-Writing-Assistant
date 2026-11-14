const test = require("node:test");
const assert = require("node:assert/strict");

const { StructuredOutputError } = require("../dist/llm/structuredOutput.js");
const { summarizeStructuredOutputFailure } = require("../dist/llm/structuredInvoke.js");

function exhaustedError(supportsReasoningToggle) {
  return new StructuredOutputError({
    message: "[STRUCTURED_OUTPUT:reasoning_budget_exhausted] reasoning consumed the output budget",
    category: "reasoning_budget_exhausted",
    diagnostics: {
      strategy: "json_schema",
      profile: {
        nativeJsonSchema: true,
        nativeJsonObject: true,
        requiresNonThinkingForStructured: true,
        supportsReasoningToggle,
        omitMaxTokensForNativeStructured: false,
        preferredStructuredStrategy: "json_schema",
        family: "unknown",
      },
      reasoningForcedOff: true,
      fallbackAvailable: false,
      fallbackUsed: false,
      errorCategory: "reasoning_budget_exhausted",
    },
  });
}

// Regression: when a model burns the whole output budget on reasoning and the
// system knows no thinking toggle for it (typically an unprobed custom
// endpoint), "turn off deep thinking" is not an action the user can take. The
// summary must point at the compatibility probe instead of a dead end.
test("reasoning exhaustion without a known toggle points at the compatibility probe", () => {
  const summary = summarizeStructuredOutputFailure({ error: exhaustedError(false) });
  assert.equal(summary.category, "reasoning_budget_exhausted");
  assert.match(summary.summary, /兼容探测/);
});

test("reasoning exhaustion with a known toggle keeps the original guidance", () => {
  const summary = summarizeStructuredOutputFailure({ error: exhaustedError(true) });
  assert.equal(summary.category, "reasoning_budget_exhausted");
  assert.doesNotMatch(summary.summary, /兼容探测/);
  assert.match(summary.summary, /关闭深度思考/);
});
