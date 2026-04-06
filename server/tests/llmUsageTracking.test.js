const test = require("node:test");
const assert = require("node:assert/strict");

const {
  extractLlmTokenUsage,
  mergeStreamTokenUsage,
} = require("../dist/llm/usageTracking.js");
const {
  toTaskTokenUsageSummary,
} = require("../dist/services/task/taskTokenUsageSummary.js");

test("extractLlmTokenUsage reads usage_metadata returned by langchain messages", () => {
  const usage = extractLlmTokenUsage({
    usage_metadata: {
      input_tokens: 128,
      output_tokens: 64,
      total_tokens: 192,
    },
  });

  assert.deepEqual(usage, {
    promptTokens: 128,
    completionTokens: 64,
    totalTokens: 192,
  });
});

test("extractLlmTokenUsage falls back to response_metadata usage payload", () => {
  const usage = extractLlmTokenUsage({
    response_metadata: {
      usage: {
        prompt_tokens: 40,
        completion_tokens: 15,
        total_tokens: 55,
      },
    },
  });

  assert.deepEqual(usage, {
    promptTokens: 40,
    completionTokens: 15,
    totalTokens: 55,
  });
});

test("mergeStreamTokenUsage keeps the final stream totals instead of double counting chunks", () => {
  const merged = mergeStreamTokenUsage(
    {
      promptTokens: 0,
      completionTokens: 8,
      totalTokens: 8,
    },
    {
      promptTokens: 120,
      completionTokens: 36,
      totalTokens: 156,
    },
  );

  assert.deepEqual(merged, {
    promptTokens: 120,
    completionTokens: 36,
    totalTokens: 156,
  });
});

test("toTaskTokenUsageSummary hides empty counters and serializes active totals", () => {
  assert.equal(toTaskTokenUsageSummary({
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    llmCallCount: 0,
    lastTokenRecordedAt: null,
  }), null);

  const summary = toTaskTokenUsageSummary({
    promptTokens: 320,
    completionTokens: 180,
    totalTokens: 500,
    llmCallCount: 6,
    lastTokenRecordedAt: new Date("2026-04-05T12:00:00.000Z"),
  });

  assert.deepEqual(summary, {
    promptTokens: 320,
    completionTokens: 180,
    totalTokens: 500,
    llmCallCount: 6,
    lastRecordedAt: "2026-04-05T12:00:00.000Z",
  });
});
