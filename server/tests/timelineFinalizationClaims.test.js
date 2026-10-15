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
      if (name === "../domain/finalizationPolicy") return { TIMELINE_FINALIZATION_RUNNING_STALE_MS: 15 * 60_000 };
      if (["../timeline.repository", "../timeline.service", "./chapterVersion"].includes(name)) return {};
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
