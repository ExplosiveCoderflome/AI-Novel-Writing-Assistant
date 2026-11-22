const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ChapterExecutionPreparationService,
  hasConfirmedExecutionContract,
} = require("../../dist/services/novel/production/preparation");

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

test("a verified director batch keeps its approved task and scenes through writer preparation", async () => {
  const { artifactContentHash, savedExecutionContract } = require("../../dist/modules/director");
  const second = {id: "c2", order: 2, taskSheet: "核对复写纸", sceneCards: "发现双重轮廓"};
  const chapters = [{id: "c1", order: 1, taskSheet: "翻开原件", sceneCards: "取出纸片"}, second];
  const contentHash = artifactContentHash(chapters.map(savedExecutionContract));
  const db = {
    directorNextRun: {findFirst: async () => ({contractJson: JSON.stringify({novelId: "n", scope: "chapters:1-2", chapterRange: {from: 1, to: 2}})})},
    directorNextArtifact: {findFirst: async () => ({status: "confirmed", contentHash})},
    chapter: {findMany: async () => chapters},
  };
  const source = chapters.map(ch => ({chapterId: ch.id, taskSheet: ch.taskSheet, sceneCards: ch.sceneCards}));
  const rawPlan = JSON.stringify({objective: "追问来历", participants: [], mustAdvance: [], mustPreserve: [], riskNotes: [], scenes: []});
  db.storyPlan = {findFirst: async () => ({rawPlanJson: rawPlan})};
  db.chapter.updateMany = async ({where, data}) => {
    const row = chapters.find(ch => ch.id === where.id && ch.taskSheet === where.taskSheet && ch.sceneCards === where.sceneCards);
    if (row) Object.assign(row, data);
    return {count: row ? 1 : 0};
  };
  db.$transaction = callback => callback({...db, volumeChapterPlan: {findMany: async () => source}});
  const calls = [];
  const service = new ChapterExecutionPreparationService({
    hasConfirmedExecutionContract: (...args) => hasConfirmedExecutionContract(db, ...args),
    ensureTimelineReady: async () => calls.push("timeline"),
    chapterPlanJITService: {ensureExecutionReady: async () => assert.fail("confirmed tasks cannot be regenerated")},
    planner: {ensureChapterPlan: async (_n, _c, options) => {
      assert.equal(options.preserveExecutionContract, true); calls.push("planner"); return {id: "p"};
    }},
  });
  const request = {controlPolicy: {kickoffMode: "director_start", advanceMode: "full_book_autopilot"}};
  await service.prepare("n", "c2", request, "run");
  assert.deepEqual(calls, ["timeline", "planner"]);
  second.taskSheet = "章节目标：追问来历";
  assert.equal(await hasConfirmedExecutionContract(db, "n", "run", "c2"), true);
  assert.equal(second.taskSheet, "核对复写纸");
  second.sceneCards = "不同转折";
  await assert.rejects(() => service.prepare("n", "c2", request, "run"), /与确认稿不符/);
  assert.deepEqual(calls, ["timeline", "planner", "timeline"]);
  assert.equal(second.sceneCards, "不同转折");
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
