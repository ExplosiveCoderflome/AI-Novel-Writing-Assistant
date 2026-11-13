const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function claimStore(checkpoints) {
  const exports = {};
  const source = fs.readFileSync(path.resolve(__dirname, "../src/modules/timeline/persistence/TimelineFinalizationStore.ts"), "utf8");
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports,
    require(name) {
      if (name === "../../../db/prisma") return { prisma: { chapterArtifactSyncCheckpoint: checkpoints } };
       if (name === "../domain/finalizationPolicy") return { TIMELINE_FINALIZATION_RUNNING_STALE_MS: 2 * 60_000 };
      if (["../timeline.repository", "../timeline.service", "./chapterVersion", "../../novel/manuscript/application/ManuscriptWorkspaceService"].includes(name)) return {};
      assert.fail(`Unexpected claim dependency ${name}`);
    },
  });
  return new exports.TimelineFinalizationStore();
}

test("timeline claim propagates database failures instead of reporting another active worker", async () => {
  const input = { novelId: "book", chapterId: "chapter", contentHash: "hash", syncMode: "stable", sourceStage: "test", metadata: {} };
  for (const failingOperation of ["create", "findUnique", "updateMany"]) {
    const failure = Object.assign(new Error(`database unavailable in ${failingOperation}`), { code: "P1001" });
    const calls = [];
    const checkpoints = {
      create: async () => { calls.push("create"); throw { code: "P2002" }; },
      findUnique: async () => { calls.push("findUnique"); return { status: "failed", updatedAt: new Date(0) }; },
      updateMany: async () => { calls.push("updateMany"); return { count: 1 }; },
    };
    checkpoints[failingOperation] = async () => { calls.push(failingOperation); throw failure; };
    await assert.rejects(claimStore(checkpoints).claimCheckpoint(input), (error) => error === failure);
    assert.deepEqual(calls, ["create", "findUnique", "updateMany"].slice(0, ["create", "findUnique", "updateMany"].indexOf(failingOperation) + 1));
  }
});

test("timeline lease heartbeat only refreshes its matching running checkpoint", async () => {
  let query;
  const store = claimStore({
    updateMany: async (input) => { query = input; return { count: 1 }; },
  });
  await store.refreshRunningCheckpointLease({ novelId: "book", chapterId: "chapter", contentHash: "hash" });
  assert.equal(query.where.novelId, "book");
  assert.equal(query.where.chapterId, "chapter");
  assert.equal(query.where.contentHash, "hash");
  assert.equal(query.where.artifactType, "timeline_finalization");
  assert.equal(query.where.status, "running");
  assert.equal(typeof query.data.updatedAt.getTime, "function");
});

test("an expired running timeline claim can be atomically reclaimed", async () => {
  let reclaim;
  const store = claimStore({
    create: async () => { throw { code: "P2002" }; },
    findUnique: async () => ({ status: "running", updatedAt: new Date(Date.now() - 3 * 60_000) }),
    updateMany: async (query) => { reclaim = query; return { count: 1 }; },
  });
  const result = await store.claimCheckpoint({
    novelId: "book", chapterId: "chapter", contentHash: "stale-hash",
    syncMode: "stable", sourceStage: "test", metadata: {},
  });
  assert.equal(result, "claimed");
  assert.equal(reclaim.where.OR[1].status, "running");
  assert.equal(reclaim.where.OR[1].updatedAt.lt.getTime() < Date.now() - 60_000, true);
});

test("a request encountering a live finalization lease returns retryable conflict immediately", async () => {
  const { ChapterTimelineFinalizationService } = require("../dist/services/novel/runtime/ChapterTimelineFinalizationService");
  const service = new ChapterTimelineFinalizationService({});
  const startedAt = Date.now();
  await assert.rejects(
    () => service.waitForFinalization(async () => ({ checkpointWritten: false })),
    (error) => error.statusCode === 409,
  );
  assert.ok(Date.now() - startedAt < 1000);
});
