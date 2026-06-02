const test = require("node:test");
const assert = require("node:assert/strict");

const { selectContextBlocks } = require("../dist/prompting/core/contextSelection.js");

function block(id, group, overrides = {}) {
  return {
    id,
    group,
    priority: 50,
    required: false,
    estimatedTokens: 100,
    content: `content for ${id}`,
    ...overrides,
  };
}

// dropOrder lists groups in the order they should be DROPPED (index 0 = drop first).
// When the budget only fits one optional block, the group listed earlier in dropOrder
// must be the one that is dropped, leaving the later (more protected) group selected.
test("selectContextBlocks drops the earliest dropOrder group first when over budget", () => {
  const blocks = [
    block("a", "early_drop"),
    block("b", "late_drop"),
  ];
  const policy = {
    maxTokensBudget: 100, // fits exactly one 100-token block
    dropOrder: ["early_drop", "late_drop"],
  };

  const result = selectContextBlocks(blocks, policy);

  assert.deepEqual(
    result.selectedBlocks.map((b) => b.id),
    ["b"],
    "the late_drop group must be kept and early_drop dropped first",
  );
  assert.ok(result.droppedBlockIds.includes("a"), "early_drop block must be dropped");
});

// Groups not listed in dropOrder are never meant to be dropped preferentially —
// they should outrank a group explicitly marked as drop-first.
test("selectContextBlocks keeps groups absent from dropOrder over drop-first groups", () => {
  const blocks = [
    block("a", "early_drop"),
    block("b", "not_listed"),
  ];
  const policy = {
    maxTokensBudget: 100,
    dropOrder: ["early_drop"],
  };

  const result = selectContextBlocks(blocks, policy);

  assert.deepEqual(result.selectedBlocks.map((b) => b.id), ["b"]);
  assert.ok(result.droppedBlockIds.includes("a"));
});
