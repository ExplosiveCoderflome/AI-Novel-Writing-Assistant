const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

const eventsEntry = path.resolve(__dirname, "../dist/events/index.js");
const eventsStub = new Module(eventsEntry);
eventsStub.filename = eventsEntry;
eventsStub.loaded = true;
eventsStub.exports = {
  novelEventBus: {
    async emit() {},
  },
};
require.cache[eventsEntry] = eventsStub;

const {
  NovelService,
} = require("../dist/services/novel/NovelService.js");

test("generateChapterPlan routes chapter preparation through the unified orchestrator", async () => {
  const calls = [];
  const expectedPlan = {
    id: "plan-1",
    chapterId: "chapter-5",
    title: "Chapter Plan",
  };
  const service = new NovelService();
  service.core = {
    async generateChapterPlan(novelId, chapterId, options) {
      calls.push(["generateChapterPlan", novelId, chapterId, options.model]);
      return expectedPlan;
    },
  };

  const result = await service.generateChapterPlan("novel-1", "chapter-5", {
    model: "gpt-plan",
  });

  assert.deepEqual(calls, [
    ["generateChapterPlan", "novel-1", "chapter-5", "gpt-plan"],
  ]);
  assert.equal(result, expectedPlan);
});

test("replanNovel routes quality repair through the unified orchestrator", async () => {
  const calls = [];
  const expectedReplan = {
    primaryPlan: {
      id: "plan-replanned",
    },
    generatedPlans: [],
  };
  const service = new NovelService();
  service.core = {
    async replanNovel(novelId, input) {
      calls.push(["replanNovel", novelId, input.chapterId ?? null, input.reason, input.windowSize ?? null]);
      return expectedReplan;
    },
  };

  const result = await service.replanNovel("novel-1", {
    chapterId: "chapter-5",
    reason: "payoff overdue",
    windowSize: 3,
  });

  assert.deepEqual(calls, [
    ["replanNovel", "novel-1", "chapter-5", "payoff overdue", 3],
  ]);
  assert.equal(result, expectedReplan);
});
