const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildSceneRoundPlan,
  flushSceneStreamingBufferWithLimit,
  resolveSceneWordControlMode,
} = require("../dist/services/novel/runtime/sceneBudgetRuntime.js");

test("scene budget runtime defaults to balanced mode for medium scenes", () => {
  const plan = buildSceneRoundPlan({
    sceneTargetWordCount: 1400,
    sceneMinWordCount: 1190,
    sceneMaxWordCount: 1610,
    chapterTargetWordCount: 3500,
    currentSceneWordCount: 0,
    currentChapterWordCount: 0,
    remainingChapterWordCount: 3500,
    roundIndex: 1,
    mode: resolveSceneWordControlMode({ sceneTargetWordCount: 1400 }),
  });

  assert.equal(plan.mode, "balanced");
  assert.equal(plan.maxRounds, 3);
  assert.equal(plan.isFinalRound, false);
  assert.ok((plan.suggestedRoundWordCount ?? 0) > 0);
  assert.ok((plan.hardRoundWordLimit ?? 0) > 0);
});

test("scene budget runtime falls back to prompt_only for short scenes", () => {
  const plan = buildSceneRoundPlan({
    sceneTargetWordCount: 500,
    sceneMinWordCount: 425,
    sceneMaxWordCount: 575,
    chapterTargetWordCount: 3000,
    currentSceneWordCount: 0,
    currentChapterWordCount: 0,
    remainingChapterWordCount: 3000,
    roundIndex: 1,
    mode: resolveSceneWordControlMode({ sceneTargetWordCount: 500 }),
  });

  assert.equal(plan.mode, "prompt_only");
  assert.equal(plan.maxRounds, 1);
  assert.equal(plan.isFinalRound, true);
  assert.equal(plan.hardRoundWordLimit, null);
});

test("scene budget runtime flushes to sentence boundary before hitting hard limit", () => {
  const flushed = flushSceneStreamingBufferWithLimit({
    alreadyEmitted: "",
    pendingText: "第一句刚好收住。第二句还没机会写完，但是已经太长。",
    hardLimit: 8,
  });

  assert.equal(flushed.emittedText, "第一句刚好收住。");
  assert.equal(flushed.reachedLimit, true);
  assert.equal(flushed.trimmedAtSentenceBoundary, true);
});
