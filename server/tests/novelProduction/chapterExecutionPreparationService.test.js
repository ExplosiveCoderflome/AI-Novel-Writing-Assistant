const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ChapterExecutionPreparationService,
} = require("../../dist/services/novel/production/preparation/ChapterExecutionPreparationService.js");

test("chapter preparation finishes planning writes before it reports ready", async () => {
  const calls = [];
  const service = new ChapterExecutionPreparationService({
    ensureTimelineReady: async () => { calls.push(["timeline"]); },
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

  assert.deepEqual(calls.map(([name]) => name), ["timeline", "execution_contract", "chapter_plan"]);
  assert.equal(calls[1][1].completionProfile.targetChapterCount, 48);
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
    ensureTimelineReady: async () => {},
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

test('selected director ranges reconcile their chapter contracts without extending the route window', async () => {
  const calls = [];
  const service = new ChapterExecutionPreparationService({ ensureTimelineReady: async () => {},
    chapterPlanJITService: { ensureExecutionReady: async (_n, _c, options) => calls.push(options) },
    planner: { ensureChapterPlan: async () => ({ id: 'selected-plan' }) }, loadEstimatedChapterCount: async () => 80 });
  const result = await service.prepare('n', 'c', { controlPolicy: { kickoffMode: 'director_start',
    advanceMode: 'auto_to_execution', reviewCheckpoints: [], autoExecutionRange: { mode: 'chapter_range', start: 4, end: 12 } } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].prepareRouteWindow, false);
  assert.equal(result.mode, 'director_execution');
});
