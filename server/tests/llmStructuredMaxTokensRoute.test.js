require("./fixtures/compatibilitySettings.cjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const { createServer } = require("node:http");
const { HumanMessage } = require("@langchain/core/messages");
const { builtinCapability, saveCapability } = require("../dist/llm/compatibility");
const { prisma } = require("../dist/db/prisma");
const {
  resolveLLMClientOptions,
  getLLM,
  setProviderSecretCache,
} = require("../dist/llm/factory.js");

const PROVIDER = "custom_modelscope";
const BASE_URL = "https://api-inference.modelscope.cn/v1";
const MODEL = "Qwen/Qwen3.5-397B-A17B";

function configureProvider() {
  setProviderSecretCache(PROVIDER, {
    key: "test-key",
    model: MODEL,
    baseURL: BASE_URL,
    reasoningEnabled: false,
  });
}

test("structured explicit maxTokens reaches the request configuration", async () => {
  configureProvider();
  try {
    const resolved = await resolveLLMClientOptions(PROVIDER, {
      executionMode: "structured",
      structuredStrategy: "prompt_json",
      maxTokens: 32768,
    });
    assert.equal(resolved.maxTokens, 32768);
    assert.equal(resolved.budgetTrace.source, "task");
  } finally {
    setProviderSecretCache(PROVIDER, null);
  }
});

test("an automatic request sends 16K and can end after a short answer", async (t) => {
  const requests = [];
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    requests.push(JSON.parse(body));
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({
      id: "fixture", created: 1, model: MODEL, object: "chat.completion",
      choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "完成。" } }],
      usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
    }));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => {
    server.close(resolve);
    server.closeAllConnections();
  }));
  const create = prisma.llmInvocationUsageRecord.create;
  prisma.llmInvocationUsageRecord.create = async ({ data }) => data;
  t.after(() => { prisma.llmInvocationUsageRecord.create = create; });
  const baseURL = `http://127.0.0.1:${server.address().port}/v1`;
  const llm = await getLLM(PROVIDER, { model: MODEL, apiKey: "fixture", baseURL });
  const response = await llm.invoke([new HumanMessage("简短回答")]);
  assert.equal(requests[0].max_tokens, 16384);
  assert.equal(response.content, "完成。");
  assert.equal(response.response_metadata.finish_reason, "stop");

  const identity = { provider: PROVIDER, model: MODEL, baseURL };
  await saveCapability(identity, { ...builtinCapability(identity), source: "probed", maxOutputTokens: 8192,
    thinkingToggle: { supported: true, control: "thinking", effort: false } });
  const limited = await getLLM(PROVIDER, { model: MODEL, apiKey: "fixture", baseURL, executionMode: "structured" });
  await limited.invoke([new HumanMessage("简短回答")]);
  assert.equal(requests[1].max_tokens, 8192);
  assert.deepEqual(requests[1].thinking, { type: "disabled" });
});

test("structured route maxTokens survives when task options omit maxTokens", async () => {
  configureProvider();
  const original = prisma.modelRouteConfig.findUnique;
  prisma.modelRouteConfig.findUnique = async () => ({
    provider: PROVIDER,
    model: MODEL,
    temperature: 0.2,
    maxTokens: 32768,
    requestProtocol: "openai_compatible",
    structuredResponseFormat: "prompt_json",
  });
  try {
    const resolved = await resolveLLMClientOptions(PROVIDER, {
      taskType: "fact_extraction",
      executionMode: "structured",
      structuredStrategy: "prompt_json",
      automaticMaxTokens: 40960,
    });
    assert.equal(resolved.modelRoute, "fact_extraction");
    assert.equal(resolved.maxTokens, 32768);
    assert.equal(resolved.budgetTrace.source, "route");
  } finally {
    prisma.modelRouteConfig.findUnique = original;
    setProviderSecretCache(PROVIDER, null);
  }
});

test("structured defaults without explicit or route budget send 16K", async () => {
  configureProvider();
  const original = prisma.modelRouteConfig.findUnique;
  prisma.modelRouteConfig.findUnique = async () => null;
  try {
    const resolved = await resolveLLMClientOptions(PROVIDER, {
      executionMode: "structured",
      structuredStrategy: "prompt_json",
    });
    assert.equal(resolved.maxTokens, 16384);
    assert.equal(resolved.budgetTrace.source, "automatic");
    assert.equal(resolved.budgetTrace.finalMaxTokens, 16384);
  } finally {
    prisma.modelRouteConfig.findUnique = original;
    setProviderSecretCache(PROVIDER, null);
  }
});
