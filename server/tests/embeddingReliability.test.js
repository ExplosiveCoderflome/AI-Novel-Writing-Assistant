const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "kb-embedding-test-"));
process.env.DATABASE_URL = `file:${path.join(temporaryRoot, "test.db").replace(/\\/g, "/")}`;
process.env.AI_NOVEL_RUNTIME = "desktop";
process.env.AI_NOVEL_APP_DATA_DIR = temporaryRoot;

const { prisma } = require("../dist/db/prisma.js");
const { ragConfig } = require("../dist/config/rag.js");
const settings = require("../dist/services/settings/RagSettingsService.js");
const { EmbeddingService } = require("../dist/services/rag/EmbeddingService.js");
const { RagIndexService, RagJobCancelledError } = require("../dist/services/rag/RagIndexService.js");
const { VectorStoreService } = require("../dist/services/rag/VectorStoreService.js");
const { RagRerankerService } = require("../dist/services/rag/RagRerankerService.js");
const { readSanitizedResponseError } = require("../dist/services/rag/transport/index.js");
const { stubDatabaseMethod } = require("./legacyDirector/databasePorts.js");

test.after(async () => {
  await prisma.$disconnect();
  assert.equal(path.dirname(temporaryRoot), os.tmpdir());
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
});

function setup(t, fetchHandler) {
  const originalConfig = { ...ragConfig };
  Object.assign(ragConfig, { embeddingTimeoutMs: 40, embeddingMaxRetries: 0, embeddingBatchSize: 1,
    embeddingConcurrency: 1, embeddingVersion: 1, qdrantTimeoutMs: 40 });
  t.after(() => Object.assign(ragConfig, originalConfig));
  t.mock.method(settings, "getRagEmbeddingSettings", async () => ({ embeddingProvider: "openai", embeddingModel: "offline-model" }));
  stubDatabaseMethod(t, prisma.aPIKey, "findUnique", async () => ({ isActive: true, key: "offline-placeholder", baseURL: "http://127.0.0.1:1/v1" }));
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    const request = { url, ...init, input: init?.body ? JSON.parse(init.body).input : undefined };
    requests.push(request);
    return fetchHandler(request, requests.length);
  });
  return { requests, service: new EmbeddingService(), scope: `test:${randomUUID()}` };
}

function vectorResponse(input) {
  return new Response(JSON.stringify({ data: input.map((text, index) => ({ index, embedding: [text.length, 1] })) }));
}

function stalledBody({ signal }) {
  return new Response(new ReadableStream({ start(controller) {
    signal.addEventListener("abort", () => controller.error(new DOMException("aborted", "AbortError")), { once: true });
  } }));
}

test("checkpointed earlier batches survive failure and a fresh service only requests missing chunks", async (t) => {
  let fail = true;
  const fixture = setup(t, ({ input }) => {
    if (input.includes("third") && fail) throw new TypeError("fetch failed");
    return vectorResponse(input);
  });
  const index = new RagIndexService(fixture.service, {});
  const texts = ["first", "second", "third", "fourth"];
  await assert.rejects(index.embedTextsInBatches(texts, fixture.scope, async () => {}), /fetch failed/);
  assert.deepEqual(fixture.requests.map((row) => row.input), [["first"], ["second"], ["third"]]);
  fail = false;
  const restarted = new RagIndexService(new EmbeddingService(), {});
  const result = await restarted.embedTextsInBatches(texts, fixture.scope, async () => {});
  assert.deepEqual(result.vectors, texts.map((text) => [text.length, 1]));
  assert.deepEqual(fixture.requests.slice(3).map((row) => row.input), [["third"], ["fourth"]]);
  const files = fs.readdirSync(path.join(temporaryRoot, "data", "rag-embedding-checkpoints"), { recursive: true })
    .filter((name) => name.endsWith(".json"));
  const records = files.map((name) => fs.readFileSync(path.join(temporaryRoot, "data", "rag-embedding-checkpoints", name), "utf8"));
  assert.ok(records.every((record) => !/first|second|third|fourth|offline-placeholder|baseUrl/.test(record)));
});

test("adaptive split saves its successful left side before the right side fails", async (t) => {
  let fail = true;
  const fixture = setup(t, ({ input }) => {
    if (input.length > 1) return new Response("too large", { status: 413 });
    if (input[0] === "right" && fail) return new Response("unavailable", { status: 503 });
    return vectorResponse(input);
  });
  const options = { checkpointScope: fixture.scope };
  await assert.rejects(fixture.service.embedTexts(["left", "right"], options), /503/);
  fail = false;
  const result = await new EmbeddingService().embedTexts(["left", "right"], options);
  assert.deepEqual(result.vectors, [[4, 1], [5, 1]]);
  assert.deepEqual(fixture.requests.map((row) => row.input), [["left", "right"], ["left"], ["right"], ["right"]]);
});

test("changed text, model version, endpoint and owner cannot reuse another checkpoint", async (t) => {
  const fixture = setup(t, ({ input }) => vectorResponse(input));
  await fixture.service.embedTexts(["old"], { checkpointScope: fixture.scope });
  await fixture.service.embedTexts(["changed"], { checkpointScope: fixture.scope });
  ragConfig.embeddingVersion = 2;
  await fixture.service.embedTexts(["old"], { checkpointScope: fixture.scope });
  await fixture.service.embedTexts(["old"], { checkpointScope: `${fixture.scope}:other-owner` });
  assert.equal(fixture.requests.length, 4);
  t.mock.method(fixture.service, "resolveBaseUrl", async () => "http://127.0.0.1:2/v1");
  await fixture.service.embedTexts(["old"], { checkpointScope: fixture.scope });
  assert.equal(fixture.requests.length, 5);
  t.mock.method(fixture.service, "resolveRuntimeSettings", async () => ({ provider: "openai", model: "other-offline-model" }));
  await fixture.service.embedTexts(["old"], { checkpointScope: fixture.scope });
  assert.equal(fixture.requests.length, 6);
});

test("embedding deadline covers stalled JSON bodies after successful headers", { timeout: 1000 }, async (t) => {
  const fixture = setup(t, stalledBody);
  await assert.rejects(fixture.service.embedTexts(["body"]), /timed out/);
  assert.equal(fixture.requests.length, 1);
});

test("embedding deadline also covers stalled error bodies", { timeout: 1000 }, async (t) => {
  const fixture = setup(t, (request) => {
    const response = stalledBody(request);
    return { ok: false, status: 429, text: () => response.text() };
  });
  await assert.rejects(fixture.service.embedTexts(["body"]), /timed out/);
});

test("out-of-order indexes are restored before vectors are associated with source chunks", async (t) => {
  const fixture = setup(t, () => new Response(JSON.stringify({ data: [
    { index: 1, embedding: [20, 1] }, { index: 0, embedding: [10, 1] },
  ] })));
  assert.deepEqual((await fixture.service.embedTexts(["a", "b"])).vectors, [[10, 1], [20, 1]]);
});

for (const [label, data, error] of [
  ["missing result", [{ index: 0, embedding: [1] }], /count/],
  ["duplicate indexes", [{ index: 0, embedding: [1] }, { index: 0, embedding: [2] }], /indexes/],
  ["mixed missing indexes", [{ index: 0, embedding: [1] }, { embedding: [2] }], /indexes/],
  ["out-of-range index", [{ index: 0, embedding: [1] }, { index: 2, embedding: [2] }], /indexes/],
  ["dimension mismatch", [{ index: 0, embedding: [1] }, { index: 1, embedding: [2, 3] }], /dimensions/],
  ["non-finite vector", [{ index: 0, embedding: [null] }, { index: 1, embedding: [2] }], /dimensions/],
]) {
  test(`invalid embedding response fails without omission or retry: ${label}`, async (t) => {
    const fixture = setup(t, () => new Response(JSON.stringify({ data })));
    ragConfig.embeddingMaxRetries = 2;
    await assert.rejects(fixture.service.embedTexts(["a", "b"]), error);
    assert.equal(fixture.requests.length, 1);
  });
}

test("dimensions must also match across different batches", async (t) => {
  const fixture = setup(t, ({ input }, call) => new Response(JSON.stringify({ data: [{ index: 0, embedding: Array(call).fill(1) }] })));
  const index = new RagIndexService(fixture.service, {});
  await assert.rejects(index.embedTextsInBatches(["a", "b"], fixture.scope, async () => {}), /维度/);
});

test("model changes between batches cannot produce a mixed-model index", async (t) => {
  const fixture = setup(t, ({ input }) => vectorResponse(input));
  let calls = 0;
  t.mock.method(fixture.service, "resolveRuntimeSettings", async () => ({ provider: "openai", model: `model-${calls++}` }));
  await assert.rejects(new RagIndexService(fixture.service, {}).embedTextsInBatches(["a", "b"], fixture.scope, async () => {}), /配置/);
});

test("an invalid checkpoint fails visibly instead of silently requesting paid embeddings again", async (t) => {
  const fixture = setup(t, ({ input }) => vectorResponse(input));
  await fixture.service.embedTexts(["checkpoint"], { checkpointScope: fixture.scope });
  const cache = path.join(temporaryRoot, "data", "rag-embedding-checkpoints");
  const files = fs.readdirSync(cache, { recursive: true }).filter((name) => name.endsWith(".json"));
  // Locate this test's sole saved vector by its deliberately distinct length.
  const file = files.find((name) => JSON.parse(fs.readFileSync(path.join(cache, name), "utf8")).vector?.[0] === 10);
  assert.ok(file);
  fs.writeFileSync(path.join(cache, file), JSON.stringify({ key: "bad", vector: [] }));
  await assert.rejects(fixture.service.embedTexts(["checkpoint"], { checkpointScope: fixture.scope }), /checkpoint is invalid/);
  assert.equal(fixture.requests.length, 1);
});

test("429 follows the bounded retry policy while authentication errors are not retried", async (t) => {
  let status = 429;
  const fixture = setup(t, ({ input }, call) => call === 1 || status === 401
    ? new Response("offline error", { status }) : vectorResponse(input));
  ragConfig.embeddingMaxRetries = 2;
  t.mock.method(fixture.service, "waitBeforeRetry", async () => {});
  await fixture.service.embedTexts(["limited"]);
  assert.equal(fixture.requests.length, 2);
  status = 401;
  await assert.rejects(fixture.service.embedTexts(["auth"]), /401/);
  assert.equal(fixture.requests.length, 3);
});

test("cancellation prevents another batch request and remains distinguishable by the worker", async (t) => {
  const fixture = setup(t, ({ input }) => vectorResponse(input));
  let checks = 0;
  await assert.rejects(fixture.service.embedTexts(["a"], { checkpointScope: fixture.scope,
    assertActive: async () => { checks += 1; throw new RagJobCancelledError(); } }), RagJobCancelledError);
  assert.equal(checks, 1);
  assert.equal(fixture.requests.length, 0);
});

test("Qdrant search and collection probes time out while reading stalled bodies", { timeout: 1500 }, async (t) => {
  setup(t, stalledBody);
  const vectors = new VectorStoreService();
  await assert.rejects(vectors.search([1, 2], 2, { tenantId: "default" }), /超时/);
  await assert.rejects(vectors.ensureCollection(2), /超时/);
  const health = await vectors.healthCheck();
  assert.equal(health.ok, false);
  assert.match(health.detail, /超时/);
});

test("embedding rejection diagnostics redact the configured credential", async (t) => {
  const fixture = setup(t, () => Response.json({ error: { message: "Invalid API key offline-placeholder" } }, { status: 401 }));
  await assert.rejects(fixture.service.embedTexts(["fixture"], { checkpointScope: fixture.scope }),
    (error) => error.message.includes("[REDACTED]") && !error.message.includes("offline-placeholder"));
  assert.equal(fixture.requests[0].redirect, "error");
});
test("vector-store rejection diagnostics redact the configured credential", async (t) => {
  const fixture = setup(t, () => Response.json({ status: { error: "Invalid API key offline-vector-key" } }, { status: 401 }));
  ragConfig.qdrantApiKey = "offline-vector-key";
  await assert.rejects(new VectorStoreService().search([1, 2], 1, { tenantId: "fixture" }),
    (error) => error.message.includes("[REDACTED]") && !error.message.includes("offline-vector-key"));
  assert.equal(fixture.requests[0].redirect, "error");
});
test("reranker rejection diagnostics redact the configured credential", async (t) => {
  const fixture = setup(t, () => Response.json({ error: { message: "Invalid API key offline-rerank-key" } }, { status: 401 }));
  Object.assign(ragConfig, { rerankerEnabled: true, rerankerEndpoint: "http://127.0.0.1:1/rerank", rerankerApiKey: "offline-rerank-key" });
  const result = await new RagRerankerService().rerank({ query: "fixture", documents: [{ id: "fixture", text: "fixture" }], topK: 1 });
  assert.equal(result.used, false);
  assert.ok(result.error.includes("[REDACTED]") && !result.error.includes("offline-rerank-key"));
  assert.equal(fixture.requests[0].redirect, "error");
});
test("provider diagnostics omit raw objects and HTML and redact before shortening", async () => {
  assert.equal(await readSanitizedResponseError(Response.json({ request: { privateText: "private fixture" } })), "Provider returned an error response.");
  assert.equal(await readSanitizedResponseError(new Response("<html>private fixture</html>")), "Provider returned a non-JSON error response.");
  const detail = await readSanitizedResponseError(new Response(`Bearer offline-bearer ${"x".repeat(200)} ${"s".repeat(120)}`), "s".repeat(120));
  assert.ok(detail.length <= 243);
  assert.ok(!detail.includes("offline-bearer") && !detail.includes("s".repeat(20)));
});
