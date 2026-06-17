const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveNovelSnapshotRetentionCount,
  selectPrunableAutoSnapshotIds,
} = require("../dist/services/novel/novelCoreSnapshotService.js");

test("resolveNovelSnapshotRetentionCount uses a positive integer env value", () => {
  assert.equal(resolveNovelSnapshotRetentionCount({ NOVEL_SNAPSHOT_RETENTION_COUNT: "3" }), 3);
});

test("resolveNovelSnapshotRetentionCount falls back to 10 for invalid values", () => {
  assert.equal(resolveNovelSnapshotRetentionCount({}), 10);
  assert.equal(resolveNovelSnapshotRetentionCount({ NOVEL_SNAPSHOT_RETENTION_COUNT: "" }), 10);
  assert.equal(resolveNovelSnapshotRetentionCount({ NOVEL_SNAPSHOT_RETENTION_COUNT: "0" }), 10);
  assert.equal(resolveNovelSnapshotRetentionCount({ NOVEL_SNAPSHOT_RETENTION_COUNT: "2.5" }), 10);
  assert.equal(resolveNovelSnapshotRetentionCount({ NOVEL_SNAPSHOT_RETENTION_COUNT: "abc" }), 10);
});

test("selectPrunableAutoSnapshotIds keeps recent automatic snapshots and ignores manual snapshots", () => {
  const ids = selectPrunableAutoSnapshotIds([
    {
      id: "manual-old",
      triggerType: "manual",
      createdAt: "2025-01-01T00:00:00.000Z",
    },
    {
      id: "auto-a",
      triggerType: "auto_milestone",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "auto-b",
      triggerType: "before_pipeline",
      createdAt: "2026-01-02T00:00:00.000Z",
    },
    {
      id: "auto-c",
      triggerType: "auto_milestone",
      createdAt: "2026-01-02T00:00:00.000Z",
    },
    {
      id: "auto-old",
      triggerType: "before_pipeline",
      createdAt: "2025-01-01T00:00:00.000Z",
    },
  ], 2);

  assert.deepEqual(ids, ["auto-a", "auto-old"]);
});
