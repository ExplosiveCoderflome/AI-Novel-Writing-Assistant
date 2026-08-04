const test = require("node:test");
const assert = require("node:assert/strict");

const {
  chapterStatePairAfterManualQualityReview,
  chapterStatePairAfterPipelineApproval,
  mergeChapterPatchForGenerationStateBump,
} = require("../../dist/services/novel/chapterLifecycleState.js");

test("chapterStatePairAfterManualQualityReview matches pass / fail semantics", () => {
  assert.deepEqual(chapterStatePairAfterManualQualityReview(true), {
    generationState: "reviewed",
    chapterStatus: "completed",
  });
  assert.deepEqual(chapterStatePairAfterManualQualityReview(false), {
    generationState: "reviewed",
    chapterStatus: "needs_repair",
  });
});

test("chapterStatePairAfterPipelineApproval aligns approved with completed", () => {
  assert.deepEqual(chapterStatePairAfterPipelineApproval(), {
    generationState: "approved",
    chapterStatus: "completed",
  });
});

test("mergeChapterPatchForGenerationStateBump only adds completed when approved", () => {
  assert.deepEqual(mergeChapterPatchForGenerationStateBump({}, "reviewed"), {
    generationState: "reviewed",
  });
  assert.deepEqual(mergeChapterPatchForGenerationStateBump({}, "approved"), {
    generationState: "approved",
    chapterStatus: "completed",
  });
});
