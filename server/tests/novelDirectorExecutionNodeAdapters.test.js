const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DIRECTOR_EXECUTION_NODE_ADAPTERS,
  getDirectorExecutionNodeAdapter,
} = require("../dist/services/novel/director/novelDirectorExecutionNodeAdapters.js");

test("director chapter execution adapters expose standard runtime contracts", () => {
  assert.deepEqual(Object.keys(DIRECTOR_EXECUTION_NODE_ADAPTERS).sort(), [
    "chapter_execution",
    "quality_repair",
  ]);

  for (const [stage, adapter] of Object.entries(DIRECTOR_EXECUTION_NODE_ADAPTERS)) {
    assert.equal(typeof adapter.nodeKey, "string", stage);
    assert.equal(typeof adapter.label, "string", stage);
    assert.equal(adapter.targetType, "novel", stage);
    assert.deepEqual(adapter.reads, ["chapter_task_sheet", "chapter_draft", "audit_report"], stage);
    assert.equal(adapter.mayModifyUserContent, false, stage);
    assert.equal(adapter.requiresApprovalByDefault, false, stage);
    assert.equal(adapter.waitingState.stage, stage);
    assert.equal(adapter.waitingState.itemKey, stage);
    assert.equal(typeof adapter.waitingState.itemLabel, "string", stage);
    assert.equal(typeof adapter.waitingState.progress, "number", stage);
  }
});

test("quality repair adapter declares repair ticket output and auto retry support", () => {
  const adapter = getDirectorExecutionNodeAdapter("quality_repair");

  assert.equal(adapter.nodeKey, "chapter_quality_repair_node");
  assert.deepEqual(adapter.writes, ["chapter_draft", "audit_report", "repair_ticket"]);
  assert.equal(adapter.supportsAutoRetry, true);
});

test("chapter execution adapter preserves the existing projected node key", () => {
  const adapter = getDirectorExecutionNodeAdapter("chapter_execution");

  assert.equal(adapter.nodeKey, "chapter_execution_node");
  assert.deepEqual(adapter.writes, ["chapter_draft", "audit_report"]);
  assert.equal(adapter.supportsAutoRetry, false);
});
