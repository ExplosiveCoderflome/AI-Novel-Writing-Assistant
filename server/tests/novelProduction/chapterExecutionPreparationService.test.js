const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ChapterExecutionPreparationService,
} = require("../../dist/services/novel/production/preparation/ChapterExecutionPreparationService.js");

test("chapter preparation finishes planning writes before it reports ready", async () => {
  const calls = [];
  const service = new ChapterExecutionPreparationService({
    chapterPlanJITService: {
      ensureExecutionReady: async (_novelId, _chapterId, options) => {
        calls.push(["execution_contract", options]);
      },
    },
    planner: {
      ensureChapterPlan: async () => {
        calls.push(["chapter_plan"]);
        return { id: "plan-1" };
      },
    },
    loadEstimatedChapterCount: async () => 48,
  });

  const result = await service.prepare("novel-1", "chapter-1", {
    provider: "deepseek",
    model: "deepseek-chat",
    controlPolicy: {
      kickoffMode: "director_start",
      advanceMode: "full_book_autopilot",
      reviewCheckpoints: [],
      autoExecutionRange: { mode: "book" },
    },
  });

  assert.deepEqual(calls.map(([name]) => name), ["execution_contract", "chapter_plan"]);
  assert.equal(calls[0][1].completionProfile.targetChapterCount, 48);
  assert.deepEqual(result, {
    status: "ready",
    mode: "full_book_autopilot",
    planId: "plan-1",
    preparedArtifacts: ["chapter_execution_contract", "chapter_plan"],
  });
});

test("manual chapter preparation does not create an autopilot route window", async () => {
  let jitCalls = 0;
  const service = new ChapterExecutionPreparationService({
    chapterPlanJITService: {
      ensureExecutionReady: async () => {
        jitCalls += 1;
      },
    },
    planner: {
      ensureChapterPlan: async () => ({ id: "plan-manual" }),
    },
    loadEstimatedChapterCount: async () => 80,
  });

  const result = await service.prepare("novel-1", "chapter-1", {});

  assert.equal(jitCalls, 0);
  assert.equal(result.mode, "manual");
  assert.deepEqual(result.preparedArtifacts, ["chapter_plan"]);
});
