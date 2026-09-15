const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildDirectorAutoExecutionState,
  buildDirectorAutoExecutionScopeLabel,
  buildDirectorAutoExecutionPipelineOptions,
  isDirectorAutoExecutionChapterProcessed,
  normalizeDirectorAutoExecutionPlan,
  resolveDirectorAutoExecutionRange,
  resolveDirectorAutoExecutionWorkflowState,
} = require("../dist/services/novel/director/automation/novelDirectorAutoExecution.js");
const {
  resolveAutoExecutionRangeAndState,
} = require("../dist/services/novel/director/automation/novelDirectorAutoExecutionScopeRuntime.js");

function buildSceneCards(chapterId, targetWordCount = 2800) {
  return JSON.stringify({
    targetWordCount,
    lengthBudget: {
      targetWordCount,
      softMinWordCount: Math.floor(targetWordCount * 0.85),
      softMaxWordCount: Math.ceil(targetWordCount * 1.15),
      hardMaxWordCount: Math.ceil(targetWordCount * 1.25),
    },
    readerExperience: {
      readerQuestion: "主角能不能撑住本章压力？",
      promisedReward: "主角拿到一个可见的小胜。",
      rewardLevel: "partial",
      protagonistWant: "保住当前机会。",
      primaryResistance: "外部压力持续逼近。",
      keyTurn: "主角发现新的应对办法。",
      emotionalShift: "从压抑转向紧迫中的希望。",
      informationReveal: "对手的真实动作浮出水面。",
      netChange: "主角处境比开章更主动。",
      inheritedHookResponsibilities: [],
      endingHook: "新的具体危机逼近。",
    },
    scenes: [
      {
        key: `${chapterId}-scene-1`,
        title: "起势",
        purpose: "推进本章目标",
        mustAdvance: ["主线压力落地"],
        mustPreserve: ["人物动机"],
        entryState: "进入冲突",
        exitState: "压力升级",
        forbiddenExpansion: [],
        targetWordCount: Math.floor(targetWordCount * 0.32),
      },
      {
        key: `${chapterId}-scene-2`,
        title: "交锋",
        purpose: "升级冲突",
        mustAdvance: ["完成关键对抗"],
        mustPreserve: ["设定边界"],
        entryState: "压力升级",
        exitState: "代价显形",
        forbiddenExpansion: [],
        targetWordCount: Math.floor(targetWordCount * 0.36),
      },
      {
        key: `${chapterId}-scene-3`,
        title: "落点",
        purpose: "形成章末推进",
        mustAdvance: ["完成本章收束"],
        mustPreserve: ["后续入口"],
        entryState: "代价显形",
        exitState: "进入下一章",
        forbiddenExpansion: [],
        targetWordCount: targetWordCount - Math.floor(targetWordCount * 0.32) - Math.floor(targetWordCount * 0.36),
      },
    ],
  });
}

test("chapter_range normalizes to the explicit chapter range 1-10", () => {
  assert.deepEqual(normalizeDirectorAutoExecutionPlan({ mode: "chapter_range", endOrder: 10 }), {
    mode: "chapter_range",
    startOrder: 1,
    endOrder: 10,
    autoReview: true,
    autoRepair: true,
    artifactSyncMode: "adaptive",
  });
});

test("chapter_range can carry a user-selected chapter range", () => {
  assert.deepEqual(normalizeDirectorAutoExecutionPlan({ mode: "chapter_range", endOrder: 25 }), {
    mode: "chapter_range",
    startOrder: 1,
    endOrder: 25,
    autoReview: true,
    autoRepair: true,
    artifactSyncMode: "adaptive",
  });

  assert.equal(buildDirectorAutoExecutionScopeLabel({
    mode: "chapter_range",
    endOrder: 25,
  }), "第 1-25 章");
});

test("book auto execution normalizes to full-book scope without chapter bounds", () => {
  assert.deepEqual(normalizeDirectorAutoExecutionPlan({ mode: "book" }), {
    mode: "book",
    autoReview: true,
    autoRepair: true,
    artifactSyncMode: "adaptive",
  });

  assert.equal(buildDirectorAutoExecutionScopeLabel({ mode: "book" }), "全书");
});

test("resolveDirectorAutoExecutionRange sorts chapters and limits to the selected range", () => {
  const range = resolveDirectorAutoExecutionRange([
    { id: "chapter-12", order: 12 },
    { id: "chapter-3", order: 3 },
    { id: "chapter-1", order: 1 },
    { id: "chapter-11", order: 11 },
    { id: "chapter-7", order: 7 },
    { id: "chapter-9", order: 9 },
    { id: "chapter-2", order: 2 },
    { id: "chapter-5", order: 5 },
    { id: "chapter-8", order: 8 },
    { id: "chapter-4", order: 4 },
    { id: "chapter-6", order: 6 },
    { id: "chapter-10", order: 10 },
  ]);

  assert.deepEqual(range, {
    startOrder: 1,
    endOrder: 10,
    totalChapterCount: 10,
    firstChapterId: "chapter-1",
  });
});

test("buildDirectorAutoExecutionPipelineOptions uses chapter_range-safe defaults", () => {
  const options = buildDirectorAutoExecutionPipelineOptions({
    provider: "deepseek",
    model: "deepseek-chat",
    temperature: 0.6,
    startOrder: 1,
    endOrder: 10,
  });

  assert.equal(options.runMode, "fast");
  assert.equal(options.maxRetries, 1);
  assert.equal(options.autoReview, true);
  assert.equal(options.autoRepair, true);
  assert.equal(options.skipCompleted, true);
  assert.equal(options.qualityThreshold, 75);
  assert.equal(options.repairMode, "light_repair");
  assert.equal(options.artifactSyncMode, "deferred");
  assert.equal(options.costMode, "economy");
  assert.equal(options.prefetchMode, "disabled");
  assert.equal(options.temperature, 0.45);
  assert.equal(options.controlPolicy?.kickoffMode, "director_start");
  assert.equal(options.controlPolicy?.advanceMode, "auto_to_execution");
});

test("buildDirectorAutoExecutionPipelineOptions can carry full-book autopilot policy", () => {
  const options = buildDirectorAutoExecutionPipelineOptions({
    startOrder: 1,
    endOrder: 80,
    controlAdvanceMode: "full_book_autopilot",
  });

  assert.equal(options.controlPolicy?.kickoffMode, "director_start");
  assert.equal(options.controlPolicy?.advanceMode, "full_book_autopilot");
  assert.equal(options.temperature, 0.35);
  assert.equal(options.maxRetries, 1);
  assert.equal(options.repairMode, "light_repair");
  assert.equal(options.prefetchMode, "disabled");
});

test("buildDirectorAutoExecutionPipelineOptions respects review and repair toggles", () => {
  const options = buildDirectorAutoExecutionPipelineOptions({
    startOrder: 11,
    endOrder: 20,
    autoReview: false,
    autoRepair: true,
  });

  assert.equal(options.autoReview, false);
  assert.equal(options.autoRepair, false);
});

test("auto execution does not treat empty reviewed chapters as processed", () => {
  const emptyReviewedChapter = {
    id: "chapter-empty",
    order: 11,
    content: "",
    generationState: "reviewed",
    chapterStatus: "pending_review",
  };
  const draftedReviewedChapter = {
    id: "chapter-drafted",
    order: 12,
    content: "正文内容",
    generationState: "reviewed",
    chapterStatus: "pending_review",
  };

  assert.equal(isDirectorAutoExecutionChapterProcessed(emptyReviewedChapter), false);
  assert.equal(isDirectorAutoExecutionChapterProcessed(draftedReviewedChapter), true);

  const state = buildDirectorAutoExecutionState({
    range: {
      startOrder: 11,
      endOrder: 12,
      totalChapterCount: 2,
      firstChapterId: "chapter-empty",
    },
    chapters: [emptyReviewedChapter, draftedReviewedChapter],
    plan: {
      mode: "chapter_range",
      startOrder: 11,
      endOrder: 12,
    },
  });

  assert.equal(state.completedChapterCount, 1);
  assert.equal(state.remainingChapterCount, 1);
  assert.deepEqual(state.remainingChapterOrders, [11]);
});

test("auto execution state discards stale skips for chapters that still need generation", () => {
  const state = buildDirectorAutoExecutionState({
    range: {
      startOrder: 5,
      endOrder: 7,
      totalChapterCount: 3,
      firstChapterId: "chapter-5",
    },
    chapters: [
      { id: "chapter-5", order: 5, content: "正文5", generationState: "approved" },
      { id: "chapter-6", order: 6, content: "", generationState: "planned" },
      { id: "chapter-7", order: 7, content: "正文7", generationState: "approved" },
    ],
    plan: {
      enabled: true,
      mode: "chapter_range",
      startOrder: 5,
      endOrder: 7,
      skippedChapterIds: ["chapter-6"],
      skippedChapterOrders: [6],
    },
  });

  assert.deepEqual(state.skippedChapterOrders, []);
  assert.deepEqual(state.remainingChapterOrders, [6]);
  assert.equal(state.nextChapterOrder, 6);
});

test("auto execution scope ignores orphan duplicate chapter rows when a same-order contract is complete", async () => {
  const chapters = [
    {
      id: "chapter-13-valid",
      order: 13,
      content: "",
      generationState: "planned",
      chapterStatus: "unplanned",
      targetWordCount: 3000,
      conflictLevel: 70,
      revealLevel: 35,
      mustAvoid: "不要提前展开下章发薪日事件",
      taskSheet: "第13章任务单",
      sceneCards: buildSceneCards("chapter-13-valid", 3000),
    },
    {
      id: "chapter-13-orphan",
      order: 13,
      content: "",
      generationState: "planned",
      chapterStatus: "unplanned",
      targetWordCount: null,
      conflictLevel: null,
      revealLevel: null,
      mustAvoid: null,
      taskSheet: "旧格式任务单",
      sceneCards: "场景1：旧格式",
    },
  ];

  const resolved = await resolveAutoExecutionRangeAndState({
    novelId: "novel-1",
    deps: {
      listChapters: async () => chapters,
    },
    existingState: {
      enabled: true,
      mode: "chapter_range",
      startOrder: 13,
      endOrder: 13,
      totalChapterCount: 1,
      firstChapterId: "chapter-13-valid",
      nextChapterId: "chapter-13-valid",
      nextChapterOrder: 13,
    },
  });

  assert.equal(resolved.range.startOrder, 13);
  assert.equal(resolved.range.endOrder, 13);
  assert.equal(resolved.autoExecution.nextChapterId, "chapter-13-valid");
  assert.deepEqual(resolved.autoExecution.remainingChapterOrders, [13]);
});

test("auto execution state prefers plan-linked duplicate over orphan generated content", () => {
  const state = buildDirectorAutoExecutionState({
    range: {
      startOrder: 17,
      endOrder: 17,
      totalChapterCount: 1,
      firstChapterId: "chapter-17-plan",
    },
    chapters: [
      {
        id: "chapter-17-orphan",
        order: 17,
        content: "孤立旧稿正文",
        generationState: "approved",
        chapterStatus: "completed",
        volumeChapterPlanCount: 0,
      },
      {
        id: "chapter-17-plan",
        order: 17,
        content: "",
        generationState: "planned",
        chapterStatus: "pending_generation",
        volumeChapterPlanCount: 1,
      },
    ],
    plan: {
      mode: "chapter_range",
      startOrder: 17,
      endOrder: 17,
    },
  });

  assert.equal(state.nextChapterId, "chapter-17-plan");
  assert.equal(state.remainingChapterCount, 1);
  assert.deepEqual(state.remainingChapterOrders, [17]);
});

test("buildDirectorAutoExecutionScopeLabel supports chapter ranges and volume labels", () => {
  assert.equal(buildDirectorAutoExecutionScopeLabel({
    mode: "chapter_range",
    startOrder: 11,
    endOrder: 20,
  }), "第 11-20 章");

  assert.equal(buildDirectorAutoExecutionScopeLabel({
    mode: "volume",
    volumeOrder: 2,
  }, null, "中段反扑卷"), "第 2 卷 · 中段反扑卷");
});

test("resolveDirectorAutoExecutionWorkflowState maps review and repair into quality repair stage", () => {
  const range = {
    startOrder: 1,
    endOrder: 10,
    totalChapterCount: 10,
    firstChapterId: "chapter-1",
  };

  const reviewingState = resolveDirectorAutoExecutionWorkflowState({
    progress: 0.5,
    currentStage: "reviewing",
    currentItemLabel: "第3章",
  }, range);
  assert.equal(reviewingState.stage, "quality_repair");
  assert.equal(reviewingState.itemKey, "quality_repair");
  assert.match(reviewingState.itemLabel, /自动审校第 1-10 章/);

  const repairingState = resolveDirectorAutoExecutionWorkflowState({
    progress: 0.5,
    currentStage: "repairing",
    currentItemLabel: "第4章",
  }, range);
  assert.equal(repairingState.stage, "quality_repair");
  assert.equal(repairingState.itemKey, "quality_repair");
  assert.match(repairingState.itemLabel, /自动修复第 1-10 章/);

  const draftingState = resolveDirectorAutoExecutionWorkflowState({
    progress: 0.25,
    currentStage: "generating",
    currentItemLabel: "第2章",
  }, range);
  assert.equal(draftingState.stage, "chapter_execution");
  assert.equal(draftingState.itemKey, "chapter_execution");
  assert.match(draftingState.itemLabel, /自动执行第 1-10 章/);
});
