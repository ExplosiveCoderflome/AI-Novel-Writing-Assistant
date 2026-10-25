const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "kb-publication-test-"));
process.env.AI_NOVEL_RUNTIME = "desktop";
process.env.AI_NOVEL_APP_DATA_DIR = root;
process.env.DATABASE_URL = require("./testInfrastructure/tempSqliteDatabase.cjs").initializeTemporarySqliteDatabase(root, "fixture.db");
const { prisma } = require("../dist/db/prisma.js");
const { ragConfig } = require("../dist/config/rag.js");
const { RagIndexService } = require("../dist/services/rag/RagIndexService.js");
const { EmbeddingService } = require("../dist/services/rag/EmbeddingService.js");
const { VectorStoreService } = require("../dist/services/rag/VectorStoreService.js");
const { HybridRetrievalService } = require("../dist/services/rag/HybridRetrievalService.js");
const { RagJobLease, RagLeaseLostError, RagIndexRollbackError, publishedGeneration } = require("../dist/services/rag/indexing/index.js");

test.before(async () => {
  await prisma.aPIKey.create({ data: { provider: "openai", key: "offline-fixture", isActive: true, baseURL: "http://127.0.0.1:1/v1" } });
});
test.after(async () => {
  await prisma.$disconnect();
  assert.equal(path.dirname(root), os.tmpdir());
  fs.rmSync(root, { recursive: true, force: true });
});

async function fixture(t, jobType = "rebuild") {
  const previous = { ...ragConfig };
  Object.assign(ragConfig, { enabled: true, chunkSize: 200, chunkOverlap: 0, embeddingBatchSize: 1,
    embeddingConcurrency: 1, embeddingTimeoutMs: 5000, embeddingMaxRetries: 0, contextualRetrievalEnabled: false,
    qdrantUrl: "http://127.0.0.1:1", qdrantCollection: "offline-publication", retrievalTraceSampleRate: 0 });
  t.after(() => Object.assign(ragConfig, previous));
  const requests = [];
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    const { input } = JSON.parse(init.body);
    assert.ok(Array.isArray(input), "every HTTP call must be the mocked embedding request");
    requests.push(input);
    return new Response(JSON.stringify({ data: input.map((text, index) => ({ index, embedding: [text.charCodeAt(0), 1] })) }));
  });
  const document = await prisma.knowledgeDocument.create({ data: { title: `Fixture ${randomUUID()}`, fileName: "fixture.txt" } });
  const chunks = ["甲".repeat(200), "乙".repeat(200)];
  const version = await prisma.knowledgeDocumentVersion.create({ data: { documentId: document.id, versionNumber: 1,
    content: chunks.join(""), contentHash: randomUUID(), charCount: 400 } });
  await prisma.knowledgeDocument.update({ where: { id: document.id }, data: { activeVersionId: version.id, activeVersionNumber: 1 } });
  const oldId = randomUUID();
  const unrelatedId = randomUUID();
  const otherTenantId = randomUUID();
  const baseRow = { ownerType: "knowledge_document", ownerId: document.id, chunkText: "existing evidence", chunkHash: randomUUID(),
    chunkOrder: 0, embedProvider: "openai", embedModel: "text-embedding-3-small", indexedAt: new Date(1) };
  await prisma.knowledgeChunk.createMany({ data: [
    { ...baseRow, id: oldId, tenantId: "default" },
    { ...baseRow, id: unrelatedId, ownerId: `other-${document.id}`, tenantId: "default" },
    { ...baseRow, id: otherTenantId, tenantId: "other-tenant" },
  ] });
  const points = new Map([oldId, unrelatedId, otherTenantId].map((id) => [id, { id, score: 1, payload: {
    ...baseRow, ownerId: id === unrelatedId ? `other-${document.id}` : document.id,
    tenantId: id === otherTenantId ? "other-tenant" : "default",
  } }]));
  const state = { onUpsert: null, failCleanup: false, failRollback: false, upserts: 0, cleanupCalls: [], rollbackCalls: [] };
  const vectors = {
    ensureCollection: async (size) => assert.equal(size, 2),
    upsertPoints: async (rows) => {
      state.upserts += 1;
      rows.forEach((row) => points.set(row.id, { ...row, score: 1000 }));
      if (state.onUpsert) await state.onUpsert(rows);
    },
    deletePoints: async (ids) => {
      state.cleanupCalls.push([...ids]);
      assert.ok(!ids.includes(unrelatedId) && !ids.includes(otherTenantId));
      if (state.failCleanup && ids.length) throw new Error("injected old-point cleanup failure");
      ids.forEach((id) => points.delete(id));
    },
    deleteGeneration: async (tenantId, ownerId, generation) => {
      state.rollbackCalls.push(generation);
      assert.equal(tenantId, "default"); assert.equal(ownerId, document.id);
      if (state.failRollback) throw new Error("injected staging rollback failure");
      for (const [id, row] of points) {
        if (row.payload.tenantId === tenantId && row.payload.ownerId === ownerId && row.payload.indexGeneration === generation) points.delete(id);
      }
    },
    search: async (_query, limit, scope) => [...points.values()]
      .filter((row) => row.payload.tenantId === scope.tenantId && scope.ownerIds.includes(row.payload.ownerId)
        && scope.knowledgeGenerations.some((item) => item.ownerId === row.payload.ownerId
          && (row.payload.indexGeneration ?? null) === item.generation))
      .sort((a, b) => b.score - a.score).slice(0, limit),
  };
  const service = new RagIndexService(new EmbeddingService(), vectors);
  const job = await prisma.ragIndexJob.create({ data: { tenantId: "default", jobType, ownerType: "knowledge_document", ownerId: document.id, maxAttempts: 8 } });
  let claimed;
  const f = { document, version, job, chunks, oldId, unrelatedId, otherTenantId, points, state, vectors, service, requests,
    get claimed() { return claimed; },
    rows: () => prisma.knowledgeChunk.findMany({ where: { tenantId: "default", ownerType: "knowledge_document", ownerId: document.id }, orderBy: { chunkOrder: "asc" } }),
    claim: async () => { claimed = await service.claimJob(await prisma.ragIndexJob.findUniqueOrThrow({ where: { id: job.id } })); assert.ok(claimed); return claimed; },
    execute: async () => {
      await prisma.ragIndexJob.update({ where: { id: job.id }, data: { status: "queued", runAfter: new Date(0) } });
      await f.claim();
      try { const result = await service.processJob(claimed); await service.updateJobStatus(job.id, { status: "succeeded" }, claimed); return result; }
      catch (error) {
        const current = await prisma.ragIndexJob.findUniqueOrThrow({ where: { id: job.id } });
        if (current.status === "running" && current.runAfter > new Date()) await service.updateJobStatus(job.id, { status: "failed", lastError: error.message }, claimed);
        throw error;
      }
    },
    hits: () => new HybridRetrievalService({ embedTexts: async () => ({ vectors: [[1, 2]] }) }, vectors)
      .vectorSearch("evidence", { tenantId: "default", ownerTypes: ["knowledge_document"], ownerIds: [document.id], vectorCandidates: 1 }),
  };
  return f;
}

test("staged high-scoring points stay invisible until exact document publication", async (t) => {
  const f = await fixture(t);
  f.state.onUpsert = async () => {
    assert.deepEqual((await f.rows()).map((row) => row.id), [f.oldId]);
    assert.deepEqual((await f.hits()).map((row) => row.id), [f.oldId], "staging must not occupy the topK budget");
    assert.equal(f.state.cleanupCalls.length, 0);
  };
  assert.deepEqual(await f.execute(), { chunks: 2 });
  const rows = await f.rows();
  assert.deepEqual(rows.map((row) => row.chunkText), f.chunks);
  assert.ok(rows.every((row) => publishedGeneration(row.metadataJson)));
  assert.equal(f.points.has(f.oldId), false);
  assert.ok(f.points.has(f.unrelatedId) && f.points.has(f.otherTenantId));
  assert.equal(await prisma.knowledgeChunk.count({ where: { id: { in: [f.unrelatedId, f.otherTenantId] } } }), 2);
  assert.equal((await prisma.knowledgeDocumentVersion.findUniqueOrThrow({ where: { id: f.version.id } })).content, f.chunks.join(""));
});

test("partial upsert failure rolls back only its staged generation and keeps the old index", async (t) => {
  const f = await fixture(t);
  f.state.onUpsert = async () => { throw new Error("injected partial upsert"); };
  await assert.rejects(f.execute(), /partial upsert/);
  assert.deepEqual((await f.rows()).map((row) => row.id), [f.oldId]);
  assert.deepEqual((await f.hits()).map((row) => row.id), [f.oldId]);
  assert.equal(f.state.rollbackCalls.length, 1);
  assert.ok(f.points.has(f.oldId) && f.points.has(f.unrelatedId) && f.points.has(f.otherTenantId));
  const requestCount = f.requests.length;
  f.state.onUpsert = null;
  await f.execute();
  assert.equal(f.requests.length, requestCount);
});

test("cleanup failure is recorded after atomic publication and retry does cleanup only", async (t) => {
  const f = await fixture(t); f.state.failCleanup = true;
  await assert.rejects(f.execute(), /cleanup failure/);
  const committedIds = (await f.rows()).map((row) => row.id);
  assert.equal(committedIds.length, 2);
  const failed = await prisma.ragIndexJob.findUniqueOrThrow({ where: { id: f.job.id } });
  assert.equal(failed.status, "failed");
  assert.equal(JSON.parse(failed.payloadJson).replacement.cleanupPending, true);
  assert.equal((await prisma.knowledgeDocument.findUniqueOrThrow({ where: { id: f.document.id } })).latestIndexStatus, "succeeded");
  assert.ok(!(await f.hits()).some((row) => row.id === f.oldId));
  const count = f.requests.length; f.state.failCleanup = false;
  await f.execute();
  assert.deepEqual((await f.rows()).map((row) => row.id), committedIds);
  assert.equal(f.requests.length, count); assert.equal(f.state.upserts, 1);
});

test("lost acknowledgement after commit resumes without duplicate metadata or embeddings", async (t) => {
  const f = await fixture(t);
  const publish = f.service.commitKnowledgeReplacement.bind(f.service);
  const mocked = t.mock.method(f.service, "commitKnowledgeReplacement", async (...args) => { await publish(...args); throw new Error("lost commit acknowledgement"); });
  await assert.rejects(f.execute(), /acknowledgement/);
  const committedIds = (await f.rows()).map((row) => row.id); const count = f.requests.length;
  assert.equal(f.state.rollbackCalls.length, 0);
  mocked.mock.restore();
  await f.execute();
  assert.deepEqual((await f.rows()).map((row) => row.id), committedIds);
  assert.equal(f.requests.length, count); assert.equal(f.state.upserts, 1);
});

test("a new source version does not merge into a queued committed-cleanup job", async (t) => {
  const f = await fixture(t); f.state.failCleanup = true;
  await assert.rejects(f.execute(), /cleanup failure/);
  await prisma.ragIndexJob.update({ where: { id: f.job.id }, data: { status: "queued", runAfter: new Date(Date.now() + 60000) } });
  const chunks = ["丙".repeat(200), "丁".repeat(200)];
  const version = await prisma.knowledgeDocumentVersion.create({ data: { documentId: f.document.id, versionNumber: 2,
    content: chunks.join(""), contentHash: randomUUID(), charCount: 400 } });
  await prisma.knowledgeDocument.update({ where: { id: f.document.id }, data: { activeVersionId: version.id, activeVersionNumber: 2, latestIndexStatus: "queued" } });
  const next = await f.service.enqueueOwnerJob("rebuild", "knowledge_document", f.document.id);
  assert.notEqual(next.id, f.job.id);
  assert.equal((await prisma.ragIndexJob.findUniqueOrThrow({ where: { id: f.job.id } })).status, "cancelled");
  assert.equal(JSON.parse(next.payloadJson).sourceVersionId, version.id);
  f.state.failCleanup = false;
  const claimed = await f.service.claimJob(next); assert.ok(claimed);
  await f.service.processJob(claimed);
  await f.service.updateJobStatus(next.id, { status: "succeeded" }, claimed);
  assert.deepEqual((await f.rows()).map((row) => row.chunkText), chunks);
  assert.equal(f.requests.length, 4);
});

test("version switch before publication aborts replacement without deleting old chunks", async (t) => {
  const f = await fixture(t);
  f.state.onUpsert = async () => {
    const version = await prisma.knowledgeDocumentVersion.create({ data: { documentId: f.document.id, versionNumber: 2,
      content: "new source", contentHash: randomUUID(), charCount: 10 } });
    await prisma.knowledgeDocument.update({ where: { id: f.document.id }, data: { activeVersionId: version.id, activeVersionNumber: 2 } });
  };
  await assert.rejects(f.execute(), /source version changed/);
  assert.deepEqual((await f.rows()).map((row) => row.id), [f.oldId]);
  assert.equal(f.state.cleanupCalls.length, 0);
});

test("a pinned source mismatch is rejected before embedding or staging", async (t) => {
  const f = await fixture(t);
  await prisma.ragIndexJob.update({ where: { id: f.job.id }, data: { payloadJson: JSON.stringify({ sourceVersionId: "obsolete-version" }) } });
  await assert.rejects(f.execute(), /changed before indexing/);
  assert.equal(f.requests.length, 0); assert.equal(f.state.upserts, 0);
  assert.deepEqual((await f.rows()).map((row) => row.id), [f.oldId]);
});

test("cancellation before publication fences writes; a new job reuses paid results and clears staging", async (t) => {
  const f = await fixture(t);
  f.state.onUpsert = async () => prisma.ragIndexJob.update({ where: { id: f.job.id }, data: { status: "cancelled" } });
  await assert.rejects(f.execute(), RagLeaseLostError);
  assert.deepEqual((await f.rows()).map((row) => row.id), [f.oldId]);
  assert.deepEqual((await f.hits()).map((row) => row.id), [f.oldId]);
  await assert.rejects(f.service.updateJobStatus(f.job.id, { status: "succeeded" }, f.claimed), RagLeaseLostError);
  const count = f.requests.length;
  f.state.onUpsert = null;
  const next = await f.service.enqueueOwnerJob("rebuild", "knowledge_document", f.document.id);
  const claimed = await f.service.claimJob(next); assert.ok(claimed);
  await f.service.processJob(claimed);
  await f.service.updateJobStatus(next.id, { status: "succeeded" }, claimed);
  assert.equal(f.requests.length, count);
  assert.equal([...f.points.values()].filter((row) => row.payload.ownerId === f.document.id && row.payload.tenantId === "default").length, 2);
});

test("expired lease cannot publish or finish; a new attempt is isolated from its old generation", async (t) => {
  const f = await fixture(t);
  f.state.onUpsert = async () => prisma.ragIndexJob.update({ where: { id: f.job.id }, data: { runAfter: new Date(0) } });
  await assert.rejects(f.execute(), RagLeaseLostError);
  const stale = f.claimed;
  assert.equal(await new RagJobLease(stale).renew(), false);
  assert.deepEqual((await f.rows()).map((row) => row.id), [f.oldId]);
  assert.equal(await f.service.recoverJob(await prisma.ragIndexJob.findUniqueOrThrow({ where: { id: f.job.id } })), true);
  f.state.onUpsert = null;
  const count = f.requests.length; await f.execute();
  const current = (await f.rows()).map((row) => row.id);
  await assert.rejects(f.service.updateJobStatus(stale.id, { status: "failed" }, stale), RagLeaseLostError);
  assert.deepEqual((await f.rows()).map((row) => row.id), current);
  assert.equal(f.requests.length, count);
});

test("claim is atomic across workers and active document leases are not recovered", async (t) => {
  const f = await fixture(t);
  const before = await prisma.ragIndexJob.findUniqueOrThrow({ where: { id: f.job.id } });
  const claims = await Promise.all([f.service.claimJob(before), new RagIndexService({}, {}).claimJob(before)]);
  assert.equal(claims.filter(Boolean).length, 1);
  const claimed = claims.find(Boolean);
  assert.equal(await f.service.recoverJob(claimed), false);
  assert.ok(!(await f.service.listInterruptedJobs()).some((row) => row.id === claimed.id));
  const other = await prisma.ragIndexJob.create({ data: { ownerType: "knowledge_document", ownerId: f.document.id, jobType: "rebuild" } });
  assert.equal(await f.service.claimJob(other), null);
  assert.equal((await prisma.ragIndexJob.findUniqueOrThrow({ where: { id: f.job.id } })).attempts, 1);
});

test("rollback failure is terminal for automatic recovery and never discards the old index", async (t) => {
  const f = await fixture(t);
  f.state.onUpsert = async () => { throw new Error("partial write"); }; f.state.failRollback = true;
  await assert.rejects(f.execute(), RagIndexRollbackError);
  const row = await prisma.ragIndexJob.findUniqueOrThrow({ where: { id: f.job.id } });
  assert.equal(row.status, "failed"); assert.equal(JSON.parse(row.payloadJson).replacement.rollbackFailed, true);
  assert.deepEqual((await f.rows()).map((row) => row.id), [f.oldId]);
  assert.deepEqual((await f.hits()).map((row) => row.id), [f.oldId]);
  assert.equal(f.state.cleanupCalls.length, 0);
});

test("archive cleanup is limited to the archived document and retains all source versions", async (t) => {
  const f = await fixture(t, "delete");
  await prisma.knowledgeDocument.update({ where: { id: f.document.id }, data: { status: "archived" } });
  assert.deepEqual(await f.execute(), { chunks: 0 });
  assert.equal((await f.rows()).length, 0); assert.equal(f.requests.length, 0);
  assert.ok(f.points.has(f.unrelatedId) && f.points.has(f.otherTenantId));
  assert.equal(await prisma.knowledgeDocumentVersion.count({ where: { documentId: f.document.id } }), 1);
});

test("restore racing archive publication prevents deletion", async (t) => {
  const f = await fixture(t, "delete");
  await prisma.knowledgeDocument.update({ where: { id: f.document.id }, data: { status: "archived" } });
  const publish = f.service.commitKnowledgeReplacement.bind(f.service);
  t.mock.method(f.service, "commitKnowledgeReplacement", async (...args) => {
    await prisma.knowledgeDocument.update({ where: { id: f.document.id }, data: { status: "enabled" } });
    return publish(...args);
  });
  await assert.rejects(f.execute(), /source version changed/);
  assert.deepEqual((await f.rows()).map((row) => row.id), [f.oldId]); assert.equal(f.state.cleanupCalls.length, 0);
});

test("frozen Qdrant target and structured generation filters stay scoped after settings change", async (t) => {
  const previous = { ...ragConfig }; t.after(() => Object.assign(ragConfig, previous));
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, init) => { calls.push({ url, body: JSON.parse(init.body), headers: init.headers });
    return new Response(JSON.stringify({ result: [] })); });
  const vector = new VectorStoreService().forTarget({ url: "http://offline.invalid:1", collection: "frozen", apiKey: "offline-placeholder" });
  ragConfig.qdrantUrl = "http://offline.invalid:2"; ragConfig.qdrantCollection = "different";
  await vector.search([1, 2], 1, { tenantId: "tenant", ownerTypes: ["knowledge_document"], ownerIds: ["doc"],
    knowledgeGenerations: [{ ownerId: "doc", generation: null }, { ownerId: "doc2", generation: "abc" }] });
  assert.ok(calls[0].url.includes(":1/collections/frozen/"));
  const choices = calls[0].body.filter.must.find((item) => item.should).should;
  assert.deepEqual(choices[0].must[1], { is_empty: { key: "indexGeneration" } });
  assert.deepEqual(choices[1].must[1], { key: "indexGeneration", match: { value: "abc" } });
  await vector.deleteGeneration("tenant", "doc", "a".repeat(64));
  assert.deepEqual(calls[1].body.filter.must.map((item) => item.key), ["tenantId", "ownerType", "ownerId", "indexGeneration"]);
  await assert.rejects(vector.deleteGeneration("tenant", "doc", ""), /scope/);
  assert.equal(calls.length, 2);
  await vector.deletePoints(Array.from({ length: 1001 }, (_, index) => String(index)));
  assert.deepEqual(calls.slice(2).map((row) => row.body.points.length), [1000, 1]);
});
