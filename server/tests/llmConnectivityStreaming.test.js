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
