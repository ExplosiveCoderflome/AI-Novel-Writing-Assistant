const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildAlternativePathFromRejectedApproval,
  summarizeOutput,
} = require("../dist/agents/runtime/runtimeHelpers.js");

test("rejected pipeline approval falls back to preview only", () => {
  const result = buildAlternativePathFromRejectedApproval({
    goal: "写第三章",
    context: { contextMode: "novel", novelId: "novel-1" },
    plannedActions: [{
      agent: "Planner",
      reasoning: "execute",
      calls: [{
        tool: "queue_pipeline_run",
        reason: "queue",
        idempotencyKey: "k1",
        input: { novelId: "novel-1", startOrder: 3, endOrder: 3 },
      }],
    }],
  });
  assert.equal(result[0].calls[0].tool, "preview_pipeline_run");
});

test("summarizeOutput handles chapter range summary", () => {
  const text = summarizeOutput("summarize_chapter_range", {
    startOrder: 1,
    endOrder: 3,
  });
  assert.equal(text, "已总结第1到第3章。");
});
