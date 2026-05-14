const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveDirectorAutoExecutionWorkflowState,
} = require("../dist/services/novel/director/automation/novelDirectorAutoExecution.js");
const {
  parsePipelinePayload,
  stringifyPipelinePayload,
} = require("../dist/services/novel/pipelineJobState.js");

test("resolveDirectorAutoExecutionWorkflowState appends background sync labels to running item text", () => {
  const payload = stringifyPipelinePayload({
    backgroundSync: {
      activities: [
        {
          kind: "character_dynamics",
          status: "running",
          chapterId: "chapter-2",
          chapterOrder: 2,
          chapterTitle: "决心用医术逆袭",
          updatedAt: "2026-04-14T05:30:00.000Z",
        },
        {
          kind: "state_snapshot",
          status: "running",
          chapterId: "chapter-2",
          chapterOrder: 2,
          chapterTitle: "决心用医术逆袭",
          updatedAt: "2026-04-14T05:30:01.000Z",
        },
      ],
    },
  });

  const state = resolveDirectorAutoExecutionWorkflowState(
    {
      progress: 0.42,
      currentStage: "generating_chapters",
      currentItemLabel: "第2章 · 决心用医术逆袭 · 批次 2/10",
      payload,
    },
    {
      startOrder: 1,
      endOrder: 10,
      totalChapterCount: 10,
      firstChapterId: "chapter-1",
    },
  );

  assert.equal(state.stage, "chapter_execution");
  assert.match(state.itemLabel, /角色成长中\(第2章\)/);
  assert.match(state.itemLabel, /状态同步中\(第2章\)/);
});
test("pipeline payload preserves full-book autopilot control policy", () => {
  const payload = stringifyPipelinePayload({
    provider: "deepseek",
    model: "deepseek-v4-flash",
    taskStyleProfileId: "style-1",
    controlPolicy: {
      kickoffMode: "director_start",
      advanceMode: "full_book_autopilot",
      reviewCheckpoints: ["chapter_batch"],
      autoExecutionRange: {
        mode: "book",
        start: null,
        end: null,
      },
    },
  });

  const parsed = parsePipelinePayload(payload);

  assert.equal(parsed.taskStyleProfileId, "style-1");
  assert.deepEqual(parsed.controlPolicy, {
    kickoffMode: "director_start",
    advanceMode: "full_book_autopilot",
    reviewCheckpoints: ["chapter_batch"],
    autoExecutionRange: {
      mode: "book",
      start: null,
      end: null,
    },
  });
});
