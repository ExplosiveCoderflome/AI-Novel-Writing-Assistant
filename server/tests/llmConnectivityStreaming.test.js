const test = require("node:test");
const assert = require("node:assert/strict");
const factory = require("../dist/llm/factory.js");
const { llmConnectivityService } = require("../dist/llm/connectivity.js");

test("plain connectivity consumes streamed content and rejects an empty stream", async (t) => {
  const originalResolve = factory.resolveLLMClientOptions;
  const originalGetLLM = factory.getLLM;
  let chunks = [{ content: "ok" }];
  let streamCalls = 0;
  let invokeCalls = 0;
  factory.resolveLLMClientOptions = async (provider, options) => ({
    provider,
    model: options.model,
    requestProtocol: options.requestProtocol,
  });
  factory.getLLM = async () => ({
    invoke: async () => {
      invokeCalls += 1;
      throw new Error("non-streaming invoke must not be used");
    },
    stream: async function* () {
      streamCalls += 1;
      for (const chunk of chunks) yield chunk;
    },
  });
  t.after(() => {
    factory.resolveLLMClientOptions = originalResolve;
    factory.getLLM = originalGetLLM;
  });

  const input = {
    provider: "custom_stream_only",
    model: "stream-model",
    requestProtocol: "openai_compatible",
    probeMode: "plain",
  };
  const succeeded = await llmConnectivityService.testConnection(input);
  assert.equal(succeeded.ok, true);
  assert.equal(succeeded.plain.ok, true);
  assert.equal(streamCalls, 1);
  assert.equal(invokeCalls, 0);

  chunks = [];
  const empty = await llmConnectivityService.testConnection(input);
  assert.equal(empty.ok, false);
  assert.match(empty.error, /空正文/);
  assert.equal(streamCalls, 3, "the existing protocol fallback may try Anthropic once");
  assert.equal(invokeCalls, 0);
});

test("Ollama connection probes explain when the service cannot be reached", async (t) => {
  t.mock.method(factory, "resolveLLMClientOptions", async (provider, options) => ({
    provider,
    model: options.model,
    requestProtocol: options.requestProtocol,
  }));
  const refused = Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
  let failure = new TypeError("fetch failed", { cause: refused });
  t.mock.method(factory, "getLLM", async () => ({
    stream: async () => { throw failure; },
  }));

  const input = {
    provider: "ollama",
    model: "llama3.2",
    requestProtocol: "openai_compatible",
    probeMode: "plain",
  };
  const unreachable = await llmConnectivityService.testConnection(input);
  assert.equal(unreachable.ok, false);
  assert.match(unreachable.error, /Ollama.*服务是否已启动.*API 地址.*密钥可留空/);

  const otherProvider = await llmConnectivityService.testConnection({ ...input, provider: "openai" });
  assert.equal(otherProvider.error, "fetch failed");

  failure = Object.assign(new Error("401 Unauthorized"), { status: 401 });
  const unauthorized = await llmConnectivityService.testConnection(input);
  assert.equal(unauthorized.error, "401 Unauthorized");
});
