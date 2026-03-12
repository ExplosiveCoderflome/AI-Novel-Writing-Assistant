const test = require("node:test");
const assert = require("node:assert/strict");
const { compileIntentToPlan } = require("../dist/agents/planner/compiler.js");

test("compileIntentToPlan uses chapter order tools for chapter content", () => {
  const plan = compileIntentToPlan({
    goal: "前两章都写了什么",
    intent: "query_chapter_content",
    confidence: 0.8,
    requiresNovelContext: true,
    chapterSelectors: {
      relative: { type: "first_n", count: 2 },
    },
  }, {
    goal: "前两章都写了什么",
    messages: [],
    contextMode: "novel",
    novelId: "novel-1",
  });

  assert.equal(plan.actions[0].tool, "summarize_chapter_range");
  assert.deepEqual(plan.actions[0].input, {
    novelId: "novel-1",
    startOrder: 1,
    endOrder: 2,
    mode: "summary",
  });
});

test("compileIntentToPlan compiles rewrite into read plus pipeline approval path", () => {
  const plan = compileIntentToPlan({
    goal: "重写第三章",
    intent: "rewrite_chapter",
    confidence: 0.8,
    requiresNovelContext: true,
    chapterSelectors: {
      orders: [3],
    },
  }, {
    goal: "重写第三章",
    messages: [],
    contextMode: "novel",
    novelId: "novel-1",
  });

  assert.deepEqual(plan.actions.map((item) => item.tool), [
    "get_chapter_content_by_order",
    "preview_pipeline_run",
    "queue_pipeline_run",
  ]);
});
