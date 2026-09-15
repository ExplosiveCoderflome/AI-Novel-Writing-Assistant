const test = require("node:test");
const assert = require("node:assert/strict");
const { createAnthropicLLM } = require("../dist/llm/anthropicClient.js");

function withRetryEnvironment(run) {
  const previousRetries = process.env.ANTHROPIC_TRANSIENT_MAX_RETRIES;
  const previousDelay = process.env.ANTHROPIC_RETRY_BASE_DELAY_MS;
  const previousMaxDelay = process.env.ANTHROPIC_RETRY_MAX_DELAY_MS;
  process.env.ANTHROPIC_TRANSIENT_MAX_RETRIES = "2";
  process.env.ANTHROPIC_RETRY_BASE_DELAY_MS = "0";
  process.env.ANTHROPIC_RETRY_MAX_DELAY_MS = "0";
  return Promise.resolve()
    .then(run)
    .finally(() => {
      if (previousRetries == null) delete process.env.ANTHROPIC_TRANSIENT_MAX_RETRIES;
      else process.env.ANTHROPIC_TRANSIENT_MAX_RETRIES = previousRetries;
      if (previousDelay == null) delete process.env.ANTHROPIC_RETRY_BASE_DELAY_MS;
      else process.env.ANTHROPIC_RETRY_BASE_DELAY_MS = previousDelay;
      if (previousMaxDelay == null) delete process.env.ANTHROPIC_RETRY_MAX_DELAY_MS;
      else process.env.ANTHROPIC_RETRY_MAX_DELAY_MS = previousMaxDelay;
    });
}

function makeClient() {
  return createAnthropicLLM({
    apiKey: "test-key",
    model: "claude-test",
    baseURL: "http://127.0.0.1:15721",
    temperature: 0,
    maxTokens: 64,
  });
}

test("Anthropic client retries transient 502 responses", async () => {
  await withRetryEnvironment(async () => {
    const originalFetch = global.fetch;
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      if (calls < 3) {
        return new Response('{"error":{"type":"upstream_error"}}', { status: 502 });
      }
      return new Response(JSON.stringify({
        content: [{ type: "text", text: "ok" }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    };
    try {
      const result = await makeClient().invoke([{ type: "human", content: "ping" }]);
      assert.equal(result.content, "ok");
      assert.equal(calls, 3);
    } finally {
      global.fetch = originalFetch;
    }
  });
});

test("Anthropic client does not retry permanent authentication failures", async () => {
  await withRetryEnvironment(async () => {
    const originalFetch = global.fetch;
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      return new Response('{"error":{"type":"authentication_error"}}', { status: 401 });
    };
    try {
      await assert.rejects(
        makeClient().invoke([{ type: "human", content: "ping" }]),
        /Anthropic request failed \(401\)/,
      );
      assert.equal(calls, 1);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
