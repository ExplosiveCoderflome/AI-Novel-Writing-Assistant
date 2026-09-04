const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ChapterPlanJITService,
} = require("../dist/services/novel/planning/ChapterPlanJITService.js");

function buildChapter(overrides = {}) {
  return {
    id: "chapter-1",
    order: 4,
    taskSheet: "推进当前章目标。",
    sceneCards: JSON.stringify({
      targetWordCount: 2400,
      lengthBudget: {
        targetWordCount: 2400,
        softMinWordCount: 2040,
        softMaxWordCount: 2760,
        hardMaxWordCount: 3000,
      },
      scenes: [
        { key: "s1", title: "进入", purpose: "建立压力", mustAdvance: ["发现问题"], mustPreserve: [], entryState: "开始", exitState: "受压", forbiddenExpansion: [], targetWordCount: 800 },
        { key: "s2", title: "应对", purpose: "主动处理", mustAdvance: ["获得线索"], mustPreserve: [], entryState: "受压", exitState: "反击", forbiddenExpansion: [], targetWordCount: 800 },
        { key: "s3", title: "转折", purpose: "留下入口", mustAdvance: ["形成转折"], mustPreserve: [], entryState: "反击", exitState: "新压力", forbiddenExpansion: [], targetWordCount: 800 },
      ],
    }),
    targetWordCount: 2400,
    mustAvoid: "不要越章。",
    conflictLevel: 40,
    revealLevel: 30,
    ...overrides,
  };
}

test("JIT reuses the contract synchronized by the route window", async () => {
  let loadCount = 0;
  let factLoads = 0;
  let generations = 0;
  const service = new ChapterPlanJITService({
    loadChapter: async () => {
      loadCount += 1;
      return loadCount === 1
        ? buildChapter({ taskSheet: null, sceneCards: null })
        : buildChapter();
    },
    ensureRouteWindow: async () => ({ availableRouteCount: 5, extended: true }),
    listFacts: async () => {
      factLoads += 1;
      return [];
    },
    ensureChapterExecutionContract: async () => {
      generations += 1;
    },
  });

  await service.ensureExecutionReady("novel-1", "chapter-1");

  assert.equal(loadCount, 2);
  assert.equal(factLoads, 0);
  assert.equal(generations, 0);
});

test("JIT generates a missing contract once and reads facts only then", async () => {
  let factLoads = 0;
  let generations = 0;
  let generationOptions = null;
  const service = new ChapterPlanJITService({
    loadChapter: async () => buildChapter({ taskSheet: null, sceneCards: null }),
    ensureRouteWindow: async () => ({ availableRouteCount: 5, extended: false }),
    listFacts: async () => {
      factLoads += 1;
      return [];
    },
    ensureChapterExecutionContract: async (_novelId, _chapterId, options) => {
      generations += 1;
      generationOptions = options;
    },
  });

  await service.ensureExecutionReady("novel-1", "chapter-1", {
    provider: "openai",
    model: "test-model",
    temperature: 0.3,
    taskId: "task-1",
  });

  assert.equal(factLoads, 1);
  assert.equal(generations, 1);
  assert.deepEqual(generationOptions, {
    provider: "openai",
    model: "test-model",
    temperature: 0.3,
    taskId: "task-1",
    guidance: undefined,
    entrypoint: "jit_planner",
    chapterTaskSheetQualityMode: "full_book_autopilot",
  });
});
