const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DIRECTOR_STAGE_NODE_ADAPTERS,
  getDirectorStageNodeAdapter,
} = require("../dist/services/novel/director/novelDirectorStageNodeAdapters.js");

test("director planning stages expose standard node adapter contracts", () => {
  assert.deepEqual(Object.keys(DIRECTOR_STAGE_NODE_ADAPTERS).sort(), [
    "book_contract",
    "character_setup",
    "story_macro",
    "structured_outline",
    "volume_strategy",
  ]);

  for (const [stage, adapter] of Object.entries(DIRECTOR_STAGE_NODE_ADAPTERS)) {
    assert.equal(typeof adapter.nodeKey, "string", stage);
    assert.equal(typeof adapter.label, "string", stage);
    assert.equal(adapter.targetType, "novel", stage);
    assert.ok(adapter.reads.length > 0, `${stage} should declare reads`);
    assert.ok(adapter.writes.length > 0, `${stage} should declare writes`);
    assert.equal(adapter.mayModifyUserContent, true, stage);
    assert.equal(adapter.requiresApprovalByDefault, false, stage);
    assert.equal(adapter.supportsAutoRetry, false, stage);
    assert.equal(typeof adapter.waitingState.stage, "string", stage);
    assert.equal(typeof adapter.waitingState.itemKey, "string", stage);
    assert.equal(typeof adapter.waitingState.itemLabel, "string", stage);
    assert.equal(typeof adapter.waitingState.progress, "number", stage);
  }
});

test("structured outline adapter declares chapter task sheet output", () => {
  const adapter = getDirectorStageNodeAdapter("structured_outline");

  assert.equal(adapter.nodeKey, "structured_outline_phase");
  assert.deepEqual(adapter.reads, ["volume_strategy", "character_cast"]);
  assert.deepEqual(adapter.writes, ["chapter_task_sheet"]);
  assert.equal(adapter.waitingState.stage, "structured_outline");
  assert.equal(adapter.waitingState.itemKey, "chapter_detail_bundle");
});

test("story macro and book contract use independent write contracts", () => {
  const storyMacro = getDirectorStageNodeAdapter("story_macro");
  const bookContract = getDirectorStageNodeAdapter("book_contract");

  assert.equal(storyMacro.nodeKey, "story_macro_phase");
  assert.deepEqual(storyMacro.writes, ["story_macro"]);
  assert.equal(storyMacro.waitingState.itemKey, "story_macro");

  assert.equal(bookContract.nodeKey, "book_contract_phase");
  assert.deepEqual(bookContract.reads, ["story_macro", "book_seed", "candidate_batch"]);
  assert.deepEqual(bookContract.writes, ["book_contract"]);
  assert.equal(bookContract.waitingState.stage, "story_macro");
  assert.equal(bookContract.waitingState.itemKey, "book_contract");
});
