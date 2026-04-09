const test = require("node:test");
const assert = require("node:assert/strict");
const {
  CHAPTER_GENERATION_TRACE_SESSION_PREFIX,
  buildAgentRunTaskCenterVisibilityWhere,
  isChapterGenerationTraceRun,
} = require("../dist/services/task/taskVisibility.js");

test("isChapterGenerationTraceRun matches chapter runtime trace runs only", () => {
  assert.equal(isChapterGenerationTraceRun({
    chapterId: "chapter-1",
    sessionId: `${CHAPTER_GENERATION_TRACE_SESSION_PREFIX}chapter-1-123456`,
    entryAgent: "Writer",
  }), true);

  assert.equal(isChapterGenerationTraceRun({
    chapterId: "chapter-1",
    sessionId: "creative_hub_run_1",
    entryAgent: "Writer",
  }), false);

  assert.equal(isChapterGenerationTraceRun({
    chapterId: null,
    sessionId: `${CHAPTER_GENERATION_TRACE_SESSION_PREFIX}chapter-1-123456`,
    entryAgent: "Writer",
  }), false);
});

test("buildAgentRunTaskCenterVisibilityWhere excludes chapter runtime traces from task center", () => {
  assert.deepEqual(buildAgentRunTaskCenterVisibilityWhere(), {
    NOT: {
      chapterId: { not: null },
      sessionId: { startsWith: CHAPTER_GENERATION_TRACE_SESSION_PREFIX },
      entryAgent: "Writer",
    },
  });
});
