const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildBlockingPendingReviewProposalWhere,
} = require("../dist/services/novel/runtime/GenerationContextAssembler.js");

test("blocking pending-review proposals are scoped to the current chapter plus global proposals", () => {
  const where = buildBlockingPendingReviewProposalWhere("novel-1", "chapter-2");

  assert.deepEqual(where, {
    novelId: "novel-1",
    status: "pending_review",
    OR: [
      { chapterId: "chapter-2" },
      { chapterId: null },
    ],
  });
});
