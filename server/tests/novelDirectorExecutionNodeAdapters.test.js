const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DIRECTOR_EXECUTION_NODE_ADAPTERS,
  getDirectorExecutionNodeAdapter,
  getDirectorExecutionNodeSequence,
} = require("../dist/services/novel/director/novelDirectorExecutionNodeAdapters.js");

test("director chapter execution adapters expose standard runtime contracts", () => {
  assert.deepEqual(Object.keys(DIRECTOR_EXECUTION_NODE_ADAPTERS).sort(), [
    "chapter_execution",
    "chapter_quality_review",
    "chapter_repair",
    "chapter_state_commit",
    "character_resource_sync",
    "payoff_ledger_sync",
    "quality_repair",
  ].sort());

  for (const [stage, adapter] of Object.entries(DIRECTOR_EXECUTION_NODE_ADAPTERS)) {
    assert.equal(typeof adapter.nodeKey, "string", stage);
    assert.equal(typeof adapter.label, "string", stage);
    assert.equal(adapter.targetType, "novel", stage);
    assert.ok(adapter.reads.length > 0, stage);
    assert.ok(adapter.writes.length > 0, stage);
    assert.equal(adapter.mayModifyUserContent, false, stage);
    assert.equal(adapter.requiresApprovalByDefault, false, stage);
    assert.ok(["chapter_execution", "quality_repair"].includes(adapter.waitingState.stage), stage);
    assert.ok(["chapter_execution", "quality_repair"].includes(adapter.waitingState.itemKey), stage);
    assert.equal(typeof adapter.waitingState.itemLabel, "string", stage);
    assert.equal(typeof adapter.waitingState.progress, "number", stage);
  }
});

test("quality repair adapter declares repair ticket output and auto retry support", () => {
  const adapter = getDirectorExecutionNodeAdapter("chapter_repair");

  assert.equal(adapter.nodeKey, "chapter_repair_node");
  assert.deepEqual(adapter.writes, ["chapter_draft", "audit_report", "repair_ticket"]);
  assert.equal(adapter.policyAction, "repair");
  assert.equal(adapter.supportsAutoRetry, true);
});

test("chapter execution adapter preserves the existing projected node key", () => {
  const adapter = getDirectorExecutionNodeAdapter("chapter_execution");

  assert.equal(adapter.nodeKey, "chapter_execution_node");
  assert.deepEqual(adapter.writes, ["chapter_draft"]);
  assert.equal(adapter.supportsAutoRetry, false);
});

test("chapter execution flow projects the standard post-execution nodes", () => {
  const sequence = getDirectorExecutionNodeSequence("chapter_execution").map((adapter) => adapter.nodeKey);

  assert.deepEqual(sequence, [
    "chapter_execution_node",
    "chapter_quality_review_node",
    "chapter_state_commit_node",
    "payoff_ledger_sync_node",
    "character_resource_sync_node",
  ]);
});

test("quality repair flow starts with the dedicated repair node", () => {
  const sequence = getDirectorExecutionNodeSequence("quality_repair").map((adapter) => adapter.nodeKey);

  assert.deepEqual(sequence, [
    "chapter_repair_node",
    "chapter_quality_review_node",
    "chapter_state_commit_node",
    "payoff_ledger_sync_node",
    "character_resource_sync_node",
  ]);

  assert.equal(getDirectorExecutionNodeAdapter("quality_repair").nodeKey, "chapter_repair_node");
});
