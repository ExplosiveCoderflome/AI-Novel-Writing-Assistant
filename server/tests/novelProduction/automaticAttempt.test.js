const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { loadRuntimeSource, createPipelineHarness } = require("./sourceHarness.cjs");

test("automatic budget: real SQLite uniqueness survives service recreation and separates jobs/chapters", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec('PRAGMA foreign_keys=ON; CREATE TABLE "GenerationJob" (id TEXT PRIMARY KEY); INSERT INTO "GenerationJob" VALUES (\'j1\'), (\'j2\');');
    db.exec(fs.readFileSync(path.resolve(__dirname, "../../src/prisma/migrations.sqlite/20260907120000_chapter_automatic_attempt/migration.sql"), "utf8"));
    let id = 0;
    const store = {
      findUnique: async ({ where: { jobId_chapterId: key } }) => db.prepare('SELECT * FROM "ChapterAutomaticAttempt" WHERE "jobId"=? AND "chapterId"=?').get(key.jobId, key.chapterId) ?? null,
      create: async ({ data }) => {
        try { db.prepare('INSERT INTO "ChapterAutomaticAttempt" (id,"jobId","chapterId",kind) VALUES (?,?,?,?)').run(String(++id), data.jobId, data.chapterId, data.kind); }
        catch (error) {
          if (error.message.includes("UNIQUE constraint failed")) throw Object.assign(error, { code: "P2002" });
          throw error;
        }
      },
    };
    const { ChapterAutomaticAttemptService } = loadRuntimeSource("../production/attempts/ChapterAutomaticAttemptService.ts", {
      "../../../../db/prisma": { prisma: {} },
      "../../runtime/lifecycle": { ChapterContentPersistenceError: class extends Error {} },
    });
    const a = new ChapterAutomaticAttemptService(store);
    const b = new ChapterAutomaticAttemptService(store);
    assert.deepEqual(await Promise.all([a.claim("j1", "c1", "quality_repair"), b.claim("j1", "c1", "runtime_retry")]), [true, false]);
    assert.equal(await new ChapterAutomaticAttemptService(store).used("j1", "c1"), 1);
    assert.equal(await b.claim("j2", "c1", "quality_repair"), true);
    assert.equal(await b.claim("j1", "c2", "runtime_retry"), true);
    await assert.rejects(b.claim("missing-job", "c1", "runtime_retry"));
  } finally { db.close(); }
});

test("automatic budget: denied durable claim retains draft and finalizes debt without repair", async () => {
  const h = createPipelineHarness({ scores: [60] });
  const result = await h.run({}, { onRetryConsumed: async () => false });
  assert.equal(result.pass, false);
  assert.equal(result.retryCountUsed, 0);
  assert.equal(h.content, "original draft");
  assert.equal(h.events.includes("repair"), false);
  assert.deepEqual(h.events.slice(-2), ["artifact_sync", "reviewed"]);
});

test("automatic budget: failed durable claim cannot launch repair", async () => {
  const h = createPipelineHarness({ scores: [60] });
  await assert.rejects(h.run({}, { onRetryConsumed: async () => { throw Error("persistence failed"); } }), /persistence failed/);
  assert.equal(h.events.includes("repair"), false);
  assert.equal(h.content, "original draft");
});

test("automatic budget: cancellation after claim prevents repair without refunding reservation", async () => {
  const h = createPipelineHarness({ scores: [60] });
  let claimed = false;
  await assert.rejects(h.run({}, {
    onRetryConsumed: async () => { claimed = true; },
    onCheckCancelled: async () => { if (claimed) throw Error("cancelled"); },
  }), /cancelled/);
  assert.equal(claimed, true);
  assert.equal(h.events.includes("repair"), false);
});
