const test = require("node:test");
const assert = require("node:assert/strict");

const {
  runOutlineProposalStructuredCall,
} = require("../dist/modules/planning/outline/application/outlineProposalStructuredCall.js");
const {
  mapOutlineGenerateFailure,
} = require("../dist/modules/planning/outline/application/OutlineProposalService.js");
const {
  StructuredOutputError,
} = require("../dist/llm/structuredOutput.js");
const { AppError } = require("../dist/middleware/errorHandler.js");

function structuredError(category, response, message) {
  return new StructuredOutputError({
    message: message ?? `[outline.edit_proposal@v2] ${category}`,
    category,
    diagnostics: { response },
  });
}

function stubRoute(routeMaxTokens, endpointMaxTokens, reasoningReserveTokens) {
  return async () => ({ routeMaxTokens, endpointMaxTokens, reasoningReserveTokens });
}

const asset = { id: "outline.edit_proposal", version: "v2" };

test("proposal call passes the first attempt through without option overrides", async () => {
  const seen = [];
  const result = await runOutlineProposalStructuredCall(
    { asset, promptInput: { request: "x" }, options: { provider: "deepseek", model: "deepseek-flash" } },
    {
      invoke: async (input) => { seen.push(input.options); return { output: { operations: [] } }; },
      resolveRoute: stubRoute(undefined, undefined),
    },
  );
  assert.deepEqual(result, { output: { operations: [] } });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].maxTokens, undefined);
  assert.equal(seen[0].automaticMaxTokens, undefined);
  assert.equal(seen[0].reasoningEnabled, undefined);
});

test("proposal call retries once with doubled budget and thinking off on output budget exhaustion", async () => {
  const seen = [];
  let calls = 0;
  const result = await runOutlineProposalStructuredCall(
    { asset, promptInput: { request: "x" } },
    {
      invoke: async (input) => {
        seen.push(input.options);
        calls += 1;
        if (calls === 1) throw structuredError("output_budget_exhausted", { maxTokens: 16384, tokenUsage: { completionTokens: 16384 } });
        return { output: { operations: [] } };
      },
      resolveRoute: stubRoute(undefined, undefined),
    },
  );
  assert.deepEqual(result, { output: { operations: [] } });
  assert.equal(seen.length, 2);
  assert.equal(seen[1].reasoningEnabled, false);
  assert.equal(seen[1].automaticMaxTokens, 32768);
});

test("proposal call retries when the endpoint reports truncation as length without usage", async () => {
  const seen = [];
  let calls = 0;
  const result = await runOutlineProposalStructuredCall(
    { asset, promptInput: { request: "x" } },
    {
      invoke: async (input) => {
        seen.push(input.options);
        calls += 1;
        if (calls === 1) throw structuredError("output_budget_exhausted", { finishReason: "length" });
        return { output: { operations: [] } };
      },
      resolveRoute: stubRoute(undefined, undefined),
    },
  );
  assert.deepEqual(result, { output: { operations: [] } });
  assert.equal(seen.length, 2);
  assert.equal(seen[1].automaticMaxTokens, 32768);
});

test("proposal call gives up after the retry also exhausts the budget", async () => {
  let calls = 0;
  await assert.rejects(
    runOutlineProposalStructuredCall(
      { asset, promptInput: { request: "x" } },
      {
        invoke: async () => {
          calls += 1;
          const cap = calls === 1 ? 16384 : 32768;
          throw structuredError("output_budget_exhausted", { maxTokens: cap, tokenUsage: { completionTokens: cap } });
        },
        resolveRoute: stubRoute(undefined, undefined),
      },
    ),
    (error) => error instanceof StructuredOutputError && error.category === "output_budget_exhausted",
  );
  assert.equal(calls, 2);
});

test("proposal call does not retry schema or transport failures", async () => {
  for (const category of ["schema_mismatch", "transport_error"]) {
    let calls = 0;
    await assert.rejects(
      runOutlineProposalStructuredCall(
        { asset, promptInput: { request: "x" } },
        {
          invoke: async () => {
            calls += 1;
            throw structuredError(category, {});
          },
          resolveRoute: stubRoute(undefined, undefined),
        },
      ),
      (error) => error instanceof StructuredOutputError && error.category === category,
    );
    assert.equal(calls, 1);
  }
});

test("proposal call does not retry when the route pins an output cap", async () => {
  let calls = 0;
  await assert.rejects(
    runOutlineProposalStructuredCall(
      { asset, promptInput: { request: "x" } },
      {
        invoke: async () => {
          calls += 1;
          throw structuredError("output_budget_exhausted", { maxTokens: 8192, tokenUsage: { completionTokens: 8192 } });
        },
        resolveRoute: stubRoute(8192, undefined),
      },
    ),
    (error) => error instanceof StructuredOutputError,
  );
  assert.equal(calls, 1);
});

test("proposal retry budget is capped by the endpoint limit", async () => {
  const seen = [];
  let calls = 0;
  await runOutlineProposalStructuredCall(
    { asset, promptInput: { request: "x" } },
    {
      invoke: async (input) => {
        seen.push(input.options);
        calls += 1;
        if (calls === 1) throw structuredError("output_budget_exhausted", { maxTokens: 16384, tokenUsage: { completionTokens: 16384 } });
        return { output: { operations: [] } };
      },
      resolveRoute: stubRoute(undefined, 20000),
    },
  );
  assert.equal(seen[1].automaticMaxTokens, 20000);
});

test("generate maps schema mismatch to a readable 400 without the error prefix", () => {
  const error = mapOutlineGenerateFailure(
    structuredError("schema_mismatch", {}, "[STRUCTURED_OUTPUT:schema_mismatch] [outline.edit_proposal@v2] 错误：operations.0.fields.volumeNodeId：不能为空"),
    "edit",
  );
  assert.ok(error instanceof AppError);
  assert.equal(error.statusCode, 400);
  assert.match(error.message, /修改建议格式有误/);
  assert.match(error.message, /volumeNodeId/);
  assert.doesNotMatch(error.message, /STRUCTURED_OUTPUT/);
});

test("generate maps schema mismatch with the initial-generation wording", () => {
  const error = mapOutlineGenerateFailure(structuredError("schema_mismatch", {}), "initial_generation");
  assert.ok(error instanceof AppError);
  assert.equal(error.statusCode, 400);
  assert.match(error.message, /大纲建议格式有误/);
});

test("generate maps budget exhaustion to a readable 400 that names the remedy", () => {
  const error = mapOutlineGenerateFailure(structuredError("output_budget_exhausted", {}), "edit");
  assert.ok(error instanceof AppError);
  assert.equal(error.statusCode, 400);
  assert.match(error.message, /分批/);
  assert.match(error.message, /输出上限/);
});

test("generate maps transport failures to a readable 502", () => {
  const error = mapOutlineGenerateFailure(
    structuredError("transport_error", {}, "[STRUCTURED_OUTPUT:transport_error] [outline.edit_proposal@v2] 连接模型服务时发生网络错误"),
    "edit",
  );
  assert.ok(error instanceof AppError);
  assert.equal(error.statusCode, 502);
  assert.match(error.message, /模型服务/);
  assert.doesNotMatch(error.message, /STRUCTURED_OUTPUT/);
});

test("generate maps empty responses to a readable 400", () => {
  const error = mapOutlineGenerateFailure(structuredError("empty_response", {}), "edit");
  assert.ok(error instanceof AppError);
  assert.equal(error.statusCode, 400);
  assert.match(error.message, /没有返回内容/);
});

test("generate leaves unrelated errors untouched", () => {
  const plain = new Error("boom");
  assert.equal(mapOutlineGenerateFailure(plain, "edit"), plain);
  const appError = new AppError("大纲项目不存在", 404);
  assert.equal(mapOutlineGenerateFailure(appError, "edit"), appError);
});
