const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "kb-resume-sqlite-"));
process.env.AI_NOVEL_RUNTIME = "desktop";
process.env.AI_NOVEL_APP_DATA_DIR = root;
process.env.DATABASE_URL = require("./testInfrastructure/tempSqliteDatabase.cjs").initializeTemporarySqliteDatabase(root, "fixture.db");
const { prisma } = require("../dist/db/prisma.js");
const { ragConfig } = require("../dist/config/rag.js");
const { EmbeddingService } = require("../dist/services/rag/EmbeddingService.js");
const { RagIndexService } = require("../dist/services/rag/RagIndexService.js");
const { stubDatabaseMethod } = require("./legacyDirector/databasePorts.js");

test.after(async () => {
  await prisma.$disconnect();
  assert.equal(path.dirname(root), os.tmpdir());
  fs.rmSync(root, { recursive: true, force: true });
});

test("partial embedding, vector-store failure and metadata failure resume without rebilling completed chunks", async (t) => {
  const originalConfig = { ...ragConfig };
  Object.assign(ragConfig, { enabled: true, chunkSize: 200, chunkOverlap: 0, embeddingBatchSize: 1,
    embeddingConcurrency: 1, embeddingTimeoutMs: 5000, embeddingMaxRetries: 0, contextualRetrievalEnabled: false });
  t.after(() => Object.assign(ragConfig, originalConfig));
  await prisma.aPIKey.create({ data: { provider: "openai", key: "offline-fixture", isActive: true, baseURL: "http://127.0.0.1:1/v1" } });
  const sourceChunks = ["甲".repeat(200), "乙".repeat(200), "丙".repeat(200)];
  const document = await prisma.knowledgeDocument.create({ data: { title: "Offline fixture", fileName: "fixture.txt" } });
  const version = await prisma.knowledgeDocumentVersion.create({ data: { documentId: document.id, versionNumber: 1,
    content: sourceChunks.join(""), contentHash: "fixture", charCount: 600 } });
  await prisma.knowledgeDocument.update({ where: { id: document.id }, data: { activeVersionId: version.id, activeVersionNumber: 1 } });
  const oldId = randomUUID();
  await prisma.knowledgeChunk.create({ data: { id: oldId, tenantId: "default", ownerType: "knowledge_document", ownerId: document.id,
    chunkText: "Existing searchable index", chunkHash: "old", chunkOrder: 0, embedProvider: "openai", embedModel: "text-embedding-3-small" } });
  const job = await prisma.ragIndexJob.create({ data: { jobType: "rebuild", ownerType: "knowledge_document", ownerId: document.id, maxAttempts: 4 } });
  let failEmbedding = true;
  const requests = [];
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    const { input } = JSON.parse(init.body);
    requests.push(input);
    if (failEmbedding && input[0] === sourceChunks[1]) throw new TypeError("fetch failed");
    return new Response(JSON.stringify({ data: input.map((text, index) => ({ index, embedding: [text.charCodeAt(0), 1] })) }));
  });
  let failVectorWrite = false;
  const vectorWrites = [];
  const port = {
    ensureCollection: async (dimension) => assert.equal(dimension, 2),
    upsertPoints: async (points) => { vectorWrites.push(points); if (failVectorWrite) throw new Error("offline vector write failed"); },
    deletePoints: async () => {},
    deleteGeneration: async () => {},
  };
  let attempts = 0;
  async function runAttempt() {
    // New service instances exercise disk checkpoints rather than an in-memory cache.
    const service = new RagIndexService(new EmbeddingService(), port);
    attempts += 1;
    await prisma.ragIndexJob.update({ where: { id: job.id }, data: { status: "queued", runAfter: new Date(0) } });
    const claimed = await service.claimJob(await prisma.ragIndexJob.findUnique({ where: { id: job.id } }));
    assert.ok(claimed);
    try {
      const result = await service.processJob(claimed);
      await service.updateJobStatus(job.id, { status: "succeeded" }, claimed);
      return result;
    } catch (error) {
      await service.updateJobStatus(job.id, { status: "failed", lastError: error.message }, claimed);
      throw error;
    }
  }
  async function assertOldIndex() {
    assert.deepEqual((await prisma.knowledgeChunk.findMany({ where: { ownerId: document.id } })).map((row) => row.id), [oldId]);
  }
  await assert.rejects(runAttempt(), /fetch failed/);
  await assertOldIndex();
  const failed = await prisma.ragIndexJob.findUnique({ where: { id: job.id } });
  assert.equal(JSON.parse(failed.payloadJson).progress.current, 1);
  assert.equal(JSON.parse(failed.payloadJson).progress.total, 3);
  assert.equal(vectorWrites.length, 0);

  failEmbedding = false;
  failVectorWrite = true;
  await assert.rejects(runAttempt(), /vector write/);
  await assertOldIndex();
  const billedRequestCount = requests.length;
  assert.equal(billedRequestCount, 4, "A succeeded once; B failed once then succeeded; C succeeded once");

  failVectorWrite = false;
  await prisma.$executeRawUnsafe(`CREATE TRIGGER deny_new_metadata BEFORE INSERT ON KnowledgeChunk WHEN NEW.ownerId='${document.id}' BEGIN SELECT RAISE(ABORT, 'offline metadata write failed'); END;`);
  // SQLite RAISE(ABORT) is mapped to P2003 by this Prisma adapter; inspect state
  // before removing the fault trigger or attempting any further index writes.
  await assert.rejects(runAttempt(), (error) => error.code === "P2003");
  await assertOldIndex();
  assert.equal(requests.length, billedRequestCount);
  await prisma.$executeRawUnsafe("DROP TRIGGER deny_new_metadata");

  assert.deepEqual(await runAttempt(), { chunks: 3 });
  assert.equal(requests.length, billedRequestCount, "vector/metadata retries must not send another paid request");
  const rows = await prisma.knowledgeChunk.findMany({ where: { ownerId: document.id }, orderBy: { chunkOrder: "asc" } });
  assert.deepEqual(rows.map((row) => row.chunkText), sourceChunks);
  assert.ok(rows.every((row) => row.indexedAt !== null));
  assert.equal((await prisma.knowledgeDocument.findUnique({ where: { id: document.id } })).latestIndexStatus, "succeeded");
  assert.equal((await prisma.knowledgeDocumentVersion.findUnique({ where: { id: version.id } })).content, sourceChunks.join(""));
});
