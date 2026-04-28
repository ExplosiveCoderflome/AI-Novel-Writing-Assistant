const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DIRECTOR_TAKEOVER_NODE_ADAPTER,
  getDirectorTakeoverNodeAdapter,
} = require("../dist/services/novel/director/novelDirectorTakeoverNodeAdapters.js");

test("director takeover adapter exposes the takeover runtime contract", () => {
  const adapter = getDirectorTakeoverNodeAdapter();

  assert.equal(adapter, DIRECTOR_TAKEOVER_NODE_ADAPTER);
  assert.equal(adapter.nodeKey, "takeover_execution");
  assert.equal(adapter.label, "执行 AI 自动导演接管");
  assert.equal(adapter.targetType, "global");
  assert.deepEqual(adapter.reads, ["workspace_inventory", "takeover_plan", "runtime_policy"]);
  assert.deepEqual(adapter.writes, ["workflow_task", "director_runtime"]);
  assert.equal(adapter.mayModifyUserContent, false);
  assert.equal(adapter.requiresApprovalByDefault, false);
  assert.equal(adapter.supportsAutoRetry, false);
  assert.equal(adapter.waitingState.stage, "auto_director");
  assert.equal(adapter.waitingState.itemKey, "takeover_execution");
});
