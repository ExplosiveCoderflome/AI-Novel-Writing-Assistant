const test = require("node:test");
const assert = require("node:assert/strict");
const { setTimeout: delay } = require("node:timers/promises");
const { prisma } = require("../dist/db/prisma.js");
const { ragConfig } = require("../dist/config/rag.js");
const { RagRetrievalTracer } = require("../dist/services/rag/RagRetrievalTracer.js");
const { RagRetrievalTraceRetention } = require("../dist/services/rag/RagRetrievalTraceRetention.js");

async function waitFor(predicate, timeoutMs = 500) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) {
      return;
    }
    await delay(10);
  }
  throw new Error("Timed out waiting for trace write.");
}

test("RagRetrievalTracer writes sampled trace summaries without chunk text", async () => {
  const originalCreate = prisma.ragRetrievalTrace.create;
  const originalSampleRate = ragConfig.retrievalTraceSampleRate;
  const originalMode = ragConfig.retrievalTraceQueryPersistMode;
  let captured = null;

  prisma.ragRetrievalTrace.create = async ({ data }) => {
    captured = data;
    return { id: "trace-1", ...data };
  };
  ragConfig.retrievalTraceSampleRate = 1;
  ragConfig.retrievalTraceQueryPersistMode = "preview";

  try {
    const tracer = new RagRetrievalTracer({
      query: "这是一个很长的召回查询".repeat(20),
      tenantId: "tenant-1",
      novelId: "novel-1",
      options: {
        finalTopK: 8,
        facets: { sellingPointTags: ["身份反转"] },
      },
    });

    tracer.record("vector", { elapsedMs: 12, count: 4 });
    tracer.record("keyword", { elapsedMs: 8, count: 3 });
    tracer.record("fusion", { elapsedMs: 2, count: 5 });
    tracer.record("fallback", { triggered: true });
    tracer.record("reranker", { elapsedMs: 0, used: false });
    tracer.record("decay", { elapsedMs: 1 });
    tracer.record("hits", {
      rows: [{
        id: "chunk-1",
        ownerType: "knowledge_document",
        ownerId: "doc-1",
        score: 0.123456789,
        title: "标题",
        chunkText: "这里是不能写入 trace 的正文",
        chunkOrder: 1,
        source: "vector",
      }],
    });
    tracer.flushAsync();

    await waitFor(() => Boolean(captured));
    assert.equal(captured.tenantId, "tenant-1");
    assert.equal(captured.novelId, "novel-1");
    assert.equal(captured.fallbackTriggered, true);
    assert.equal(captured.rerankerUsed, false);
    assert.equal(captured.queryDigest.length, 64);
    assert.ok(captured.queryPreview.length <= 120);
    assert.deepEqual(JSON.parse(captured.candidateCounts), {
      vector: 4,
      keyword: 3,
      fused: 5,
      final: 1,
    });
    const timings = JSON.parse(captured.timingsJson);
    assert.equal(timings.vectorMs, 12);
    assert.equal(timings.keywordMs, 8);
    assert.equal(timings.fusionMs, 2);
    assert.equal(timings.rerankerMs, 0);
    assert.equal(timings.decayMs, 1);
    assert.equal(typeof timings.totalMs, "number");
    const hits = JSON.parse(captured.hitsJson);
    assert.deepEqual(Object.keys(hits[0]).sort(), ["chunkId", "ownerId", "ownerType", "rank", "score", "source"]);
  } finally {
    prisma.ragRetrievalTrace.create = originalCreate;
    ragConfig.retrievalTraceSampleRate = originalSampleRate;
    ragConfig.retrievalTraceQueryPersistMode = originalMode;
  }
});

test("RagRetrievalTracer sampleRate zero disables writes", async () => {
  const originalCreate = prisma.ragRetrievalTrace.create;
  const originalSampleRate = ragConfig.retrievalTraceSampleRate;
  let writes = 0;

  prisma.ragRetrievalTrace.create = async ({ data }) => {
    writes += 1;
    return { id: "trace-disabled", ...data };
  };
  ragConfig.retrievalTraceSampleRate = 0;

  try {
    const tracer = new RagRetrievalTracer({
      query: "不会落库",
      tenantId: "tenant-1",
      options: {},
    });
    tracer.record("hits", { rows: [] });
    tracer.flushAsync();
    await delay(20);
    assert.equal(writes, 0);
  } finally {
    prisma.ragRetrievalTrace.create = originalCreate;
    ragConfig.retrievalTraceSampleRate = originalSampleRate;
  }
});

test("RagRetrievalTraceRetention deletes traces older than retention cutoff", async () => {
  const originalDeleteMany = prisma.ragRetrievalTrace.deleteMany;
  const originalRetentionDays = ragConfig.retrievalTraceRetentionDays;
  let capturedWhere = null;

  prisma.ragRetrievalTrace.deleteMany = async ({ where }) => {
    capturedWhere = where;
    return { count: 2 };
  };
  ragConfig.retrievalTraceRetentionDays = 14;

  try {
    const service = new RagRetrievalTraceRetention();
    const result = await service.clearExpiredTraces(new Date("2026-06-26T00:00:00.000Z"));
    assert.equal(result.deletedCount, 2);
    assert.equal(capturedWhere.createdAt.lt.toISOString(), "2026-06-12T00:00:00.000Z");
  } finally {
    prisma.ragRetrievalTrace.deleteMany = originalDeleteMany;
    ragConfig.retrievalTraceRetentionDays = originalRetentionDays;
  }
});
