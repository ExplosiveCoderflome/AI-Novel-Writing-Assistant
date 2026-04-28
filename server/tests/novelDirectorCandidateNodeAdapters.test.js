const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DIRECTOR_CANDIDATE_NODE_ADAPTERS,
  getDirectorCandidateNodeAdapter,
} = require("../dist/services/novel/director/novelDirectorCandidateNodeAdapters.js");

test("director candidate stages expose standard node adapter contracts", () => {
  assert.deepEqual(Object.keys(DIRECTOR_CANDIDATE_NODE_ADAPTERS).sort(), [
    "candidate_generation",
    "candidate_patch",
    "candidate_refine",
    "candidate_title_refine",
  ]);

  for (const [nodeKey, adapter] of Object.entries(DIRECTOR_CANDIDATE_NODE_ADAPTERS)) {
    assert.equal(adapter.nodeKey, nodeKey);
    assert.equal(typeof adapter.label, "string", nodeKey);
    assert.equal(adapter.targetType, "global", nodeKey);
    assert.deepEqual(adapter.reads, ["user_seed"], nodeKey);
    assert.deepEqual(adapter.writes, ["candidate_batch"], nodeKey);
    assert.equal(adapter.mayModifyUserContent, false, nodeKey);
    assert.equal(adapter.requiresApprovalByDefault, false, nodeKey);
    assert.equal(adapter.supportsAutoRetry, false, nodeKey);
    assert.equal(adapter.waitingState.stage, "auto_director", nodeKey);
    assert.equal(adapter.waitingState.itemKey, nodeKey);
    assert.equal(adapter.waitingState.itemLabel, adapter.label);
  }
});

test("candidate title refinement keeps its runtime node identity", () => {
  const adapter = getDirectorCandidateNodeAdapter("candidate_title_refine");

  assert.equal(adapter.nodeKey, "candidate_title_refine");
  assert.equal(adapter.label, "优化候选书名");
  assert.equal(adapter.waitingState.itemKey, "candidate_title_refine");
});
