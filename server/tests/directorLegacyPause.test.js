const test = require("node:test");
const assert = require("node:assert/strict");
const { pauseLegacyDirectorTask } = require("../dist/services/novel/director/commands/pausing");

function fixture(taskPatch = {}, allowed = true) {
  const changes = [];
  const task = { id: "task", lane: "auto_director", novelId: "novel", status: "running", pendingManualRecovery: false, ...taskPatch };
  const tx = {
    novelWorkflowTask: { findUnique: async () => task },
    generationJob: {
      findMany: async () => [{ id: "owned", payload: JSON.stringify({ workflowTaskId: "task" }) }, { id: "other", payload: JSON.stringify({ workflowTaskId: "other-task" }) }],
      updateMany: async input => { changes.push(["pipeline", input]); return { count: 1 }; },
    },
  };
  return { changes, deps: { db: { $transaction: operation => operation(tx) },
    writer: { updateRunState: async (input, options) => { assert.equal(options.transaction, tx); assert.equal(options.many, true); changes.push(["task", input]); return { count: 1 }; } },
    canExecute: async (id, database) => { assert.equal(id, "task"); assert.equal(database, tx); return allowed; },
  } };
}

test("legacy pause uses both recovery locks and only the pipeline bound to this task", async () => {
  const { deps, changes } = fixture();
  await pauseLegacyDirectorTask("task", deps);
  assert.equal(changes[0][1].data.pendingManualRecovery, true);
  assert.equal(changes[0][1].data.status, "queued");
  assert.equal(changes[0][1].where.pendingManualRecovery, false);
  assert.deepEqual(changes[1], ["pipeline", { where: { id: "owned", status: { in: ["queued", "running"] } }, data: { pendingManualRecovery: true } }]);
  assert.equal(changes.length, 2);
});

test("legacy pause is repeatable and cannot revive completed tasks or mutate another director version", async () => {
  const repeated = fixture({ pendingManualRecovery: true });
  await pauseLegacyDirectorTask("task", repeated.deps);
  assert.equal(repeated.changes.length, 0);
  for (const [patch, allowed] of [[{ status: "succeeded" }, true], [{ lane: "manual_create" }, true], [{}, false]]) {
    const data = fixture(patch, allowed);
    await assert.rejects(pauseLegacyDirectorTask("task", data.deps), error => error.statusCode === 409);
    assert.equal(data.changes.length, 0);
  }
});
