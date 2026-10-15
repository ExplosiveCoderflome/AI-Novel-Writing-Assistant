const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const { getEventListeners } = require("node:events");
const { HumanMessage } = require("@langchain/core/messages");

// Compile only these adapters; cache policy is unrelated and no DB/network is loaded.
function loadSource(name) {
  const filename = path.resolve(__dirname, "../src/llm", `${name}.ts`);
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalRequire = loaded.require.bind(loaded);
  loaded.require = (id) => id === "../platform/llm/cache" ? {
    applyCacheRequestPolicy: (request) => request,
    getPromptCacheBoundary: () => null,
    resolveCacheCapability: () => ({}),
  } : originalRequire(id);
  loaded._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename,
  }).outputText, filename);
  return loaded.exports;
}

const { attachLLMRequestLimiter, createProviderModelLimiter } = loadSource("requestLimiter");
const { createAnthropicLLM } = loadSource("anthropicClient");
const tick = () => new Promise((resolve) => setImmediate(resolve));
let model = 0;
function limited(client) {
  return attachLLMRequestLimiter(client, {
    provider: "openai", model: `stream-lifecycle-${model++}`, concurrencyLimit: 1,
  });
}

test("limiter retains the stream permit through consumption and releases on normal completion", async () => {
  let started = 0;
  const client = limited({
    invoke: async () => "result",
    async stream() {
      started++;
      return (async function* () { yield "one"; yield "two"; })();
    },
  });
  const first = await client.stream("request");
  const secondPending = client.stream("request");
  await tick();
  assert.equal(started, 1);
  assert.deepEqual(await Array.fromAsync(first), ["one", "two"]);
  const second = await secondPending;
  assert.equal(started, 2);
  await second.cancel();
});

test("limiter releases on stream failure, early break, and cancellation before reading", async () => {
  let cleanup = 0;
  const client = limited({
    invoke: async () => "result",
    async stream(input) {
      return (async function* () {
        try { yield "one"; if (input === "fail") throw new Error("stream failure"); yield "two"; }
        finally { cleanup++; }
      })();
    },
  });
  await assert.rejects(Array.fromAsync(await client.stream("fail")), /stream failure/);
  const early = await client.stream("break");
  for await (const chunk of early) { assert.equal(chunk, "one"); break; }
  const unread = await client.stream("unread");
  await unread.cancel();
  assert.equal(await client.invoke("after"), "result");
  assert.equal(cleanup, 2);
});

test("limiter abort releases an unread stream and removes the caller listener", async () => {
  const caller = new AbortController();
  let returned = 0;
  const client = limited({
    invoke: async () => "after abort",
    async stream() { return { [Symbol.asyncIterator]() { return this; }, next: async () => ({ done: false, value: "one" }), return: async () => { returned++; return { done: true }; } }; },
  });
  const stream = await client.stream("request", { signal: caller.signal });
  const queued = client.invoke("next");
  caller.abort(new Error("caller cancelled"));
  assert.equal(await queued, "after abort");
  assert.equal(returned, 1);
  assert.equal(getEventListeners(caller.signal, "abort").length, 0);
  await assert.rejects(stream.next(), /caller cancelled/);
});

test("batch uses individual invoke permits without nesting or exceeding concurrency", { timeout: 1000 }, async () => {
  let active = 0, maxActive = 0;
  const client = limited({
    async invoke(input) {
      active++;
      maxActive = Math.max(maxActive, active);
      await tick();
      active--;
      return input;
    },
    async stream() { throw new Error("unused"); },
    async batch(inputs) { return Promise.all(inputs.map((input) => this.invoke(input))); },
  });
  assert.deepEqual(await client.batch(["one", "two"]), ["one", "two"]);
  assert.equal(maxActive, 1);
});

test("queued stream abort never starts a provider call and synchronous errors release permits", async () => {
  const limiter = createProviderModelLimiter({ provider: "openai", model: "sync", concurrencyLimit: 1 });
  await assert.rejects(limiter.run(() => { throw new Error("sync failure"); }), /sync failure/);
  assert.equal(await limiter.run(async () => "next"), "next");
  let started = 0;
  const client = limited({ invoke: async () => "ok", async stream() { started++; return (async function* () { yield "one"; })(); } });
  const first = await client.stream("first");
  const caller = new AbortController();
  const queued = client.stream("queued", { signal: caller.signal });
  caller.abort(new Error("queued cancellation"));
  await assert.rejects(queued, /queued cancellation/);
  await first.cancel();
  assert.equal(started, 1);
});

const messages = [new HumanMessage("fixture")];
function anthropic(timeoutMs = 25) {
  return createAnthropicLLM({ model: "fixture", baseURL: "https://fixture.invalid", temperature: 0, timeoutMs });
}
function pendingResponse(signal, { status = 200, bytes } = {}) {
  return new Response(new ReadableStream({
    start(controller) {
      if (bytes) controller.enqueue(new TextEncoder().encode(bytes));
      signal.addEventListener("abort", () => controller.error(signal.reason), { once: true });
    },
  }), { status });
}

for (const method of ["invoke", "stream"]) {
  test(`Anthropic ${method} timeout covers a body stalled after immediate headers`, async (t) => {
    t.mock.method(global, "fetch", async (_url, request) => pendingResponse(request.signal));
    const caller = new AbortController();
    const result = anthropic()[method](messages, { signal: caller.signal });
    await assert.rejects(method === "stream" ? result.then(Array.fromAsync) : result, /timed out/);
    assert.equal(getEventListeners(caller.signal, "abort").length, 0);
  });
}

test("Anthropic error response body also times out", async (t) => {
  t.mock.method(global, "fetch", async (_url, request) => pendingResponse(request.signal, { status: 503 }));
  await assert.rejects(anthropic().invoke(messages), /timed out/);
});

test("Anthropic handles pre-abort without fetch and cleans listeners on fetch failure", async (t) => {
  const fetch = t.mock.method(global, "fetch", async () => { throw new Error("fetch failure"); });
  const caller = new AbortController();
  caller.abort(new Error("before request"));
  await assert.rejects(anthropic().invoke(messages, { signal: caller.signal }), /before request/);
  assert.equal(fetch.mock.callCount(), 0);
  const active = new AbortController();
  await assert.rejects(anthropic().invoke(messages, { signal: active.signal }), /fetch failure/);
  assert.equal(getEventListeners(active.signal, "abort").length, 0);
});

test("Anthropic completion clears timeout and caller listener after consuming JSON", async (t) => {
  let requestSignal;
  t.mock.method(global, "fetch", async (_url, request) => {
    requestSignal = request.signal;
    return new Response(JSON.stringify({ content: [{ type: "text", text: "done" }] }));
  });
  const caller = new AbortController();
  assert.equal((await anthropic().invoke(messages, { signal: caller.signal })).content, "done");
  assert.equal(getEventListeners(caller.signal, "abort").length, 0);
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(requestSignal.aborted, false);
});

test("Anthropic stream early break and return before first read cancel the body and cleanup", async (t) => {
  let cancelled = 0;
  const bytes = new TextEncoder().encode('data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"one"}}\n\n');
  t.mock.method(global, "fetch", async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(bytes); }, cancel() { cancelled++; },
  })));
  for (const consume of [false, true]) {
    const caller = new AbortController();
    const stream = await anthropic().stream(messages, { signal: caller.signal });
    if (consume) { for await (const chunk of stream) { assert.equal(chunk.content, "one"); break; } }
    else await stream[Symbol.asyncIterator]().return();
    assert.equal(getEventListeners(caller.signal, "abort").length, 0);
  }
  assert.equal(cancelled, 2);
});

test("Anthropic message_stop completes without waiting for socket EOF", async (t) => {
  t.mock.method(global, "fetch", async (_url, request) => pendingResponse(request.signal, {
    bytes: 'data: {"type":"message_stop"}\n\n',
  }));
  assert.deepEqual(await Array.fromAsync(await anthropic().stream(messages)), []);
});

test("Anthropic timeout remains active after the first streamed text chunk", async (t) => {
  t.mock.method(global, "fetch", async (_url, request) => pendingResponse(request.signal, {
    bytes: 'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"partial"}}\n\n',
  }));
  const stream = await anthropic().stream(messages);
  assert.equal((await stream.next()).value.content, "partial");
  await assert.rejects(stream.next(), /timed out/);
});

test("caller abort during a blocked read unwinds Anthropic and limiter permits", async (t) => {
  t.mock.method(global, "fetch", async (_url, request) => pendingResponse(request.signal));
  const caller = new AbortController();
  const client = limited(anthropic(1000));
  const stream = await client.stream(messages, { signal: caller.signal });
  const reading = stream.next();
  const queuedCaller = new AbortController();
  queuedCaller.abort(new Error("next request starts"));
  const queued = client.invoke(messages, { signal: queuedCaller.signal });
  caller.abort(new Error("stop reading"));
  await assert.rejects(reading, /stop reading/);
  await assert.rejects(queued, /next request starts/);
  assert.equal(getEventListeners(caller.signal, "abort").length, 0);
});

test("Anthropic timeout cleans up an unconsumed response and malformed JSON clears the timer", async (t) => {
  let requestSignal;
  let cancelled = 0;
  t.mock.method(global, "fetch", async (_url, request) => {
    requestSignal = request.signal;
    return new Response(new ReadableStream({ cancel() { cancelled++; } }));
  });
  const caller = new AbortController();
  const stream = await anthropic().stream(messages, { signal: caller.signal });
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(requestSignal.aborted, true);
  assert.equal(cancelled, 1);
  assert.equal(getEventListeners(caller.signal, "abort").length, 0);
  await assert.rejects(stream.next(), /timed out/);
  t.mock.method(global, "fetch", async (_url, request) => {
    requestSignal = request.signal;
    return new Response("bad json");
  });
  await assert.rejects(anthropic().invoke(messages, { signal: caller.signal }), SyntaxError);
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(requestSignal.aborted, false);
  assert.equal(getEventListeners(caller.signal, "abort").length, 0);
});
