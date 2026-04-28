const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DirectorRuntimeStore,
} = require("../dist/services/novel/director/runtime/DirectorRuntimeStore.js");

function buildSnapshot() {
  return {
    schemaVersion: 1,
    runId: "task-1",
    novelId: "novel-1",
    entrypoint: "test",
    policy: {
      mode: "run_until_gate",
      mayOverwriteUserContent: false,
      maxAutoRepairAttempts: 1,
      allowExpensiveReview: false,
      modelTier: "balanced",
      updatedAt: "2026-04-28T00:00:00.000Z",
    },
    steps: [],
    events: [],
    artifacts: [],
    updatedAt: "2026-04-28T00:00:00.000Z",
  };
}

test("director runtime store records repeated running updates as heartbeat events", async () => {
  const store = new DirectorRuntimeStore();
  let snapshot = buildSnapshot();
  store.mutateSnapshot = async (_taskId, mutator) => {
    snapshot = mutator(snapshot, {});
    return snapshot;
  };

  await store.recordStepStarted({
    taskId: "task-1",
    novelId: "novel-1",
    nodeKey: "volume_strategy.volume_generation",
    label: "正在生成卷战略",
    targetType: "volume",
    targetId: "volume-1",
  });
  const startedAt = snapshot.steps[0].startedAt;

  await store.recordStepStarted({
    taskId: "task-1",
    novelId: "novel-1",
    nodeKey: "volume_strategy.volume_generation",
    label: "正在生成卷战略（已等待 30s）",
    targetType: "volume",
    targetId: "volume-1",
  });

  assert.equal(snapshot.steps.length, 1);
  assert.equal(snapshot.steps[0].startedAt, startedAt);
  assert.equal(snapshot.steps[0].label, "正在生成卷战略（已等待 30s）");
  assert.deepEqual(snapshot.events.map((event) => event.type), ["node_started", "node_heartbeat"]);
  assert.equal(snapshot.events[1].affectedScope, "volume:volume-1");
});
