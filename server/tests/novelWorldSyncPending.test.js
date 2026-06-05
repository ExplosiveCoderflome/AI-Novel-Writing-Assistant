const test = require("node:test");
const assert = require("node:assert/strict");

test("parseSyncPendingChanges parses valid pending payload", async () => {
  const { parseSyncPendingChanges } = await import("../dist/services/novel/worldContext/novelWorldSyncPending.js");
  const state = parseSyncPendingChanges(JSON.stringify({
    differenceCount: 3,
    sections: ["rules", "forces", "invalid"],
    summary: "核心规则与势力待同步。",
  }));
  assert.equal(state.differenceCount, 3);
  assert.deepEqual(state.sections, ["rules", "forces"]);
  assert.equal(state.summary, "核心规则与势力待同步。");
});

test("parseSyncPendingChanges tolerates empty or invalid payload", async () => {
  const { parseSyncPendingChanges } = await import("../dist/services/novel/worldContext/novelWorldSyncPending.js");
  assert.deepEqual(parseSyncPendingChanges(null), {
    differenceCount: 0,
    sections: [],
    summary: null,
  });
  assert.deepEqual(parseSyncPendingChanges("{bad json"), {
    differenceCount: 0,
    sections: [],
    summary: null,
  });
});
