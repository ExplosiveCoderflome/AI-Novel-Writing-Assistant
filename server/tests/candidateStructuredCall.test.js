const test = require("node:test");
const assert = require("node:assert/strict");

const {
  runCandidateStructuredCall,
} = require("../dist/services/novel/director/phases/candidateStructuredCall.js");
const {
  StructuredOutputError,
} = require("../dist/llm/structuredOutput.js");

function budgetError(category, response) {
  return new StructuredOutputError({
    message: `[novel.director.candidates@v2] ${category}`,
    category,
    diagnostics: { response },
  });
}

function stubRoute(routeMaxTokens, endpointMaxTokens) {
  return async () => ({ routeMaxTokens, endpointMaxTokens });
}

test("candidate call disables thinking and starts automatic requests at 16K", async () => {
  const seen = [];
  const result = await runCandidateStructuredCall(
    {
      asset: { id: "novel.director.candidates", version: "v2" },
      promptInput: { count: 2 },
      options: { provider: "deepseek", model: "deepseek-flash", temperature: 0.45 },
      candidateCount: 2,
    },
    {
      invoke: async (input) => {
        seen.push(input);
        return { output: { candidates: [] } };
      },
      resolveRoute: stubRoute(),
    },
  );
  assert.deepEqual(result.output, { candidates: [] });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].options.reasoningEnabled, false);
  assert.equal(seen[0].options.automaticMaxTokens, 16384);
  assert.equal(seen[0].options.provider, "deepseek");
});

test("candidate call lets the factory apply the configured route budget", async () => {
  const seen = [];
  await runCandidateStructuredCall(
    {
      asset: { id: "novel.director.candidates", version: "v2" },
      promptInput: { count: 2 },
      options: { provider: "deepseek", model: "deepseek-flash" },
      candidateCount: 2,
    },
    {
      invoke: async (input) => {
        seen.push(input);
        return { output: {} };
      },
      resolveRoute: stubRoute(32768),
    },
  );
  assert.equal(seen[0].options.maxTokens, undefined);
});

test("candidate call raises the floor with the candidate count", async () => {
  const seen = [];
  await runCandidateStructuredCall(
    {
      asset: { id: "novel.director.candidates", version: "v2" },
      promptInput: { count: 5 },
      options: { provider: "deepseek", model: "deepseek-flash" },
      candidateCount: 5,
    },
    {
      invoke: async (input) => {
        seen.push(input);
        return { output: {} };
      },
      resolveRoute: stubRoute(),
    },
  );
  assert.equal(seen[0].options.automaticMaxTokens, 20480);
});

test("candidate call retries once with a doubled budget on reasoning exhaustion", async () => {
  const seen = [];
  let calls = 0;
  const result = await runCandidateStructuredCall(
    {
      asset: { id: "novel.director.candidates", version: "v2" },
      promptInput: { count: 2 },
      options: { provider: "deepseek", model: "deepseek-flash" },
      candidateCount: 2,
    },
    {
      invoke: async (input) => {
        seen.push(input);
        calls += 1;
        if (calls === 1) {
          throw budgetError("reasoning_budget_exhausted");
        }
        return { output: { candidates: [1] } };
      },
      resolveRoute: stubRoute(),
    },
  );
  assert.deepEqual(result.output, { candidates: [1] });
  assert.equal(seen.length, 2);
  assert.equal(seen[0].options.automaticMaxTokens, 16384);
  assert.equal(seen[1].options.automaticMaxTokens, 32768);
  assert.equal(seen[1].options.reasoningEnabled, false);
});

test("candidate call retries once when provider usage confirms output truncation", async () => {
  const seen = [];
  let calls = 0;
  const result = await runCandidateStructuredCall(
    {
      asset: { id: "novel.director.candidates", version: "v2" },
      promptInput: { count: 2 },
      options: { provider: "gemini", model: "gemini-3-flash" },
      candidateCount: 2,
    },
    {
      invoke: async (input) => {
        seen.push(input);
        calls += 1;
        if (calls === 1) {
          throw budgetError("output_budget_exhausted", {
            finishReason: "length", maxTokens: 16384, tokenUsage: { completionTokens: 16384 },
          });
        }
        return { output: { candidates: [1] } };
      },
      resolveRoute: stubRoute(),
    },
  );
  assert.deepEqual(result.output, { candidates: [1] });
  assert.equal(seen.length, 2);
  assert.equal(seen[1].options.automaticMaxTokens, 32768);
});

test("a length stop before the output allowance does not start a budget retry", async () => {
  let calls = 0;
  await assert.rejects(runCandidateStructuredCall({
    asset: { id: "novel.director.candidates", version: "v2" },
    promptInput: {},
    candidateCount: 2,
  }, {
    invoke: async () => {
      calls += 1;
      throw budgetError("output_budget_exhausted", {
        finishReason: "length", maxTokens: 16384, tokenUsage: { completionTokens: 82 },
      });
    },
    resolveRoute: stubRoute(),
  }), /output_budget_exhausted/);
  assert.equal(calls, 1);
});

test("candidate call does not retry failures that a bigger budget cannot fix", async () => {
  let calls = 0;
  await assert.rejects(
    runCandidateStructuredCall(
      {
        asset: { id: "novel.director.candidates", version: "v2" },
        promptInput: { count: 2 },
        options: { provider: "deepseek", model: "deepseek-flash" },
        candidateCount: 2,
      },
      {
        invoke: async () => {
          calls += 1;
          throw budgetError("schema_mismatch");
        },
        resolveRoute: stubRoute(),
      },
    ),
    /schema_mismatch/,
  );
  assert.equal(calls, 1);
});

test("candidate call does not retry when the budget is already at the ceiling", async () => {
  let calls = 0;
  await assert.rejects(
    runCandidateStructuredCall(
      {
        asset: { id: "novel.director.candidates", version: "v2" },
        promptInput: { count: 2 },
        options: { provider: "deepseek", model: "deepseek-flash" },
        candidateCount: 2,
      },
      {
        invoke: async () => {
          calls += 1;
          throw budgetError("output_budget_exhausted");
        },
        resolveRoute: stubRoute(32768),
      },
    ),
    /output_budget_exhausted/,
  );
  assert.equal(calls, 1);
});

test("candidate call surfaces the error when the retry also exhausts the budget", async () => {
  let calls = 0;
  await assert.rejects(
    runCandidateStructuredCall(
      {
        asset: { id: "novel.director.candidates", version: "v2" },
        promptInput: { count: 2 },
        options: { provider: "deepseek", model: "deepseek-flash" },
        candidateCount: 2,
      },
      {
        invoke: async () => {
          calls += 1;
          throw budgetError("reasoning_budget_exhausted");
        },
        resolveRoute: stubRoute(),
      },
    ),
    /reasoning_budget_exhausted/,
  );
  assert.equal(calls, 2);
});

test("candidate auto recovery never exceeds a saved route or endpoint allowance", async () => {
  for (const route of [stubRoute(8192), stubRoute(undefined, 16384)]) {
    let calls = 0;
    await assert.rejects(runCandidateStructuredCall({
      asset: { id: "novel.director.candidates", version: "v2" },
      promptInput: { count: 5 },
      candidateCount: 5,
    }, {
      invoke: async () => { calls += 1; throw budgetError("output_budget_exhausted"); },
      resolveRoute: route,
    }), /output_budget_exhausted/);
    assert.equal(calls, 1);
  }
});
