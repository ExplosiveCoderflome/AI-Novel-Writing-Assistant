const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildTaskSheetFromVolumeChapter,
  buildVolumeSyncPlan,
} = require("../dist/services/novel/volume/volumePlanUtils.js");

function createVolume(chapters) {
  return [{
    id: "volume-1",
    novelId: "novel-1",
    sortOrder: 1,
    title: "第一卷",
    summary: "卷摘要",
    openingHook: null,
    mainPromise: "卷主承诺",
    primaryPressureSource: null,
    coreSellingPoint: null,
    escalationMode: null,
    protagonistChange: null,
    midVolumeRisk: null,
    climax: null,
    payoffType: null,
    nextVolumeHook: null,
    resetPoint: null,
    openPayoffs: [],
    status: "active",
    sourceVersionId: null,
    chapters,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  }];
}

test("buildVolumeSyncPlan preserves generated content when preserveContent=true and flags delete candidates", () => {
  const volumes = createVolume([
    {
      id: "volume-chapter-1",
      volumeId: "volume-1",
      chapterOrder: 1,
      title: "第1章",
      summary: "新的章节摘要",
      purpose: "建立压迫",
      conflictLevel: 70,
      revealLevel: 20,
      targetWordCount: 3000,
      mustAvoid: "不要堆设定",
      taskSheet: "新任务单",
      payoffRefs: ["伏笔A"],
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    },
    {
      id: "volume-chapter-3",
      volumeId: "volume-1",
      chapterOrder: 3,
      title: "第3章",
      summary: "新章节",
      purpose: "推进卷目标",
      conflictLevel: null,
      revealLevel: null,
      targetWordCount: 2800,
      mustAvoid: null,
      taskSheet: null,
      payoffRefs: [],
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    },
  ]);
  const existingChapters = [
    {
      id: "chapter-1",
      order: 1,
      title: "第1章",
      content: "已有正文",
      generationState: "approved",
      chapterStatus: "completed",
      expectation: "旧摘要",
      targetWordCount: 2600,
      conflictLevel: 50,
      revealLevel: 10,
      mustAvoid: null,
      taskSheet: "旧任务单",
    },
    {
      id: "chapter-2",
      order: 2,
      title: "第2章",
      content: "",
      expectation: "待删除",
      targetWordCount: null,
      conflictLevel: null,
      revealLevel: null,
      mustAvoid: null,
      taskSheet: null,
    },
  ];

  const plan = buildVolumeSyncPlan(volumes, existingChapters, {
    preserveContent: true,
    applyDeletes: false,
  });

  assert.equal(plan.preview.createCount, 1);
  assert.equal(plan.preview.updateCount, 1);
  assert.equal(plan.preview.deleteCandidateCount, 1);
  assert.equal(plan.preview.clearContentCount, 0);
  assert.equal(plan.updates[0].clearContent, false);
  assert.equal(plan.updates[0].preserveWorkflowState, true);
  assert.equal(plan.updates[0].existingGenerationState, "approved");
  assert.equal(plan.updates[0].existingChapterStatus, "completed");
  assert.ok(plan.preview.items.some((item) => item.action === "delete_candidate"));
  assert.ok(plan.preview.items.some((item) => item.changedFields.includes("任务单")));
});

test("buildVolumeSyncPlan clears content on moved generated chapters when preserveContent=false and applyDeletes=true", () => {
  const volumes = createVolume([
    {
      id: "volume-chapter-move",
      volumeId: "volume-1",
      chapterOrder: 3,
      title: "旧第1章",
      summary: "移动后章节摘要",
      purpose: "把开局压力后移",
      conflictLevel: 80,
      revealLevel: 30,
      targetWordCount: 3200,
      mustAvoid: "不要重复旧节奏",
      taskSheet: "移动任务单",
      payoffRefs: [],
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    },
  ]);
  const existingChapters = [
    {
      id: "chapter-1",
      order: 1,
      title: "旧第1章",
      content: "已有正文",
      generationState: "approved",
      chapterStatus: "completed",
      expectation: "旧摘要",
      targetWordCount: 2600,
      conflictLevel: 50,
      revealLevel: 10,
      mustAvoid: null,
      taskSheet: "旧任务单",
    },
    {
      id: "chapter-2",
      order: 2,
      title: "旧第2章",
      content: "另一章正文",
      expectation: "旧第二章",
      targetWordCount: null,
      conflictLevel: null,
      revealLevel: null,
      mustAvoid: null,
      taskSheet: null,
    },
  ];

  const plan = buildVolumeSyncPlan(volumes, existingChapters, {
    preserveContent: false,
    applyDeletes: true,
  });

  assert.equal(plan.preview.moveCount, 1);
  assert.equal(plan.preview.deleteCount, 1);
  assert.equal(plan.preview.clearContentCount, 1);
  assert.equal(plan.updates[0].chapterId, "chapter-1");
  assert.equal(plan.updates[0].clearContent, true);
  assert.equal(plan.updates[0].preserveWorkflowState, false);
  assert.equal(plan.deletes[0].chapterId, "chapter-2");
});

test("buildVolumeSyncPlan prefers explicit chapterId links over title matches", () => {
  const volumes = createVolume([
    {
      id: "volume-chapter-linked",
      volumeId: "volume-1",
      chapterId: "chapter-2",
      chapterOrder: 1,
      title: "相同标题",
      summary: "绑定章节的新摘要",
      purpose: "沿用绑定章节",
      conflictLevel: null,
      revealLevel: null,
      targetWordCount: 2800,
      mustAvoid: null,
      taskSheet: null,
      payoffRefs: [],
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    },
  ]);
  const existingChapters = [
    {
      id: "chapter-1",
      order: 1,
      title: "相同标题",
      content: "",
      expectation: "同名但不是绑定章节",
      targetWordCount: null,
      conflictLevel: null,
      revealLevel: null,
      mustAvoid: null,
      taskSheet: null,
    },
    {
      id: "chapter-2",
      order: 2,
      title: "绑定章节",
      content: "",
      expectation: "旧摘要",
      targetWordCount: null,
      conflictLevel: null,
      revealLevel: null,
      mustAvoid: null,
      taskSheet: null,
    },
  ];

  const plan = buildVolumeSyncPlan(volumes, existingChapters, {
    preserveContent: true,
    applyDeletes: false,
  });

  assert.equal(plan.preview.moveCount, 1);
  assert.equal(plan.updates[0].chapterId, "chapter-2");
  assert.deepEqual(plan.links, [{ volumeChapterId: "volume-chapter-linked", chapterId: "chapter-2" }]);
  assert.equal(plan.preview.deleteCandidateCount, 1);
});

test("buildVolumeSyncPlan only falls back to order when chapterId is missing", () => {
  const volumes = createVolume([
    {
      id: "volume-chapter-legacy",
      volumeId: "volume-1",
      chapterOrder: 1,
      title: "旧项目章节",
      summary: "补链摘要",
      purpose: "兼容旧项目",
      conflictLevel: null,
      revealLevel: null,
      targetWordCount: null,
      mustAvoid: null,
      taskSheet: null,
      payoffRefs: [],
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    },
  ]);
  const existingChapters = [{
    id: "chapter-legacy",
    order: 1,
    title: "旧项目章节",
    content: "",
    expectation: "旧摘要",
    targetWordCount: null,
    conflictLevel: null,
    revealLevel: null,
    mustAvoid: null,
    taskSheet: null,
  }];

  const plan = buildVolumeSyncPlan(volumes, existingChapters, {
    preserveContent: true,
    applyDeletes: false,
  });

  assert.equal(plan.preview.updateCount, 1);
  assert.equal(plan.updates[0].chapterId, "chapter-legacy");
  assert.deepEqual(plan.links, [{ volumeChapterId: "volume-chapter-legacy", chapterId: "chapter-legacy" }]);
});

test("buildTaskSheetFromVolumeChapter backfills stable chapter task sheets from volume planning fields", () => {
  const taskSheet = buildTaskSheetFromVolumeChapter({
    id: "volume-chapter-1",
    volumeId: "volume-1",
    chapterOrder: 4,
    title: "第4章",
    summary: "章节摘要",
    purpose: "完成第一次反压",
    conflictLevel: 85,
    revealLevel: 40,
    targetWordCount: 3600,
    mustAvoid: "不要提前解释幕后黑手",
    taskSheet: null,
    payoffRefs: ["伏笔A", "伏笔B"],
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  });

  assert.match(taskSheet, /章节目标：完成第一次反压/);
  assert.match(taskSheet, /冲突等级：85/);
  assert.match(taskSheet, /目标字数：3600/);
  assert.match(taskSheet, /兑现关联：伏笔A、伏笔B/);
});

test("deferred contract chapters without existing execution artifacts are marked for repair", () => {
  const volumes = createVolume([{
    id: "volume-chapter-missing-contract",
    volumeId: "volume-1",
    chapterOrder: 1,
    title: "第1章",
    summary: "待补齐合同",
    purpose: "建立冲突",
    conflictLevel: null,
    revealLevel: null,
    targetWordCount: null,
    mustAvoid: null,
    taskSheet: null,
    sceneCards: null,
    payoffRefs: [],
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  }]);
  const plan = buildVolumeSyncPlan(volumes, [{
    id: "chapter-1",
    order: 1,
    title: "第1章",
    content: "",
    generationState: "planned",
    chapterStatus: "unplanned",
    expectation: "旧摘要",
    targetWordCount: null,
    conflictLevel: null,
    revealLevel: null,
    mustAvoid: null,
    taskSheet: null,
  }], {
    preserveContent: true,
    applyDeletes: false,
    deferredExecutionContractChapterIds: new Set(["volume-chapter-missing-contract"]),
  });

  assert.equal(plan.updates[0].deferExecutionContract, true);
});

test("buildVolumeSyncPlan marks deferred execution-contract chapters without changing preview actions", () => {
  const volumes = createVolume([{
    id: "volume-chapter-deferred",
    volumeId: "volume-1",
    chapterOrder: 1,
    title: "待修复章节",
    summary: "局部质量债务",
    purpose: "推进主线",
    conflictLevel: null,
    revealLevel: null,
    targetWordCount: null,
    mustAvoid: null,
    taskSheet: "不完整任务单",
    payoffRefs: [],
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  }]);

  const plan = buildVolumeSyncPlan(volumes, [], {
    preserveContent: true,
    applyDeletes: false,
    deferredExecutionContractChapterIds: new Set(["volume-chapter-deferred"]),
  });

  assert.equal(plan.preview.createCount, 1);
  assert.equal(plan.creates[0].deferExecutionContract, true);
});

test("buildVolumeSyncPlan schedules an unchanged deferred chapter for quality-debt marking", () => {
  const chapter = {
    id: "volume-chapter-unchanged-deferred",
    volumeId: "volume-1",
    chapterOrder: 1,
    title: "待修复章节",
    summary: "局部质量债务",
    purpose: "推进主线",
    conflictLevel: null,
    revealLevel: null,
    targetWordCount: null,
    mustAvoid: null,
    taskSheet: "不完整任务单",
    payoffRefs: [],
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
  const plan = buildVolumeSyncPlan(createVolume([chapter]), [{
    id: "chapter-1",
    order: 1,
    title: chapter.title,
    content: "已有正文",
    generationState: "approved",
    chapterStatus: "completed",
    expectation: chapter.summary,
    targetWordCount: chapter.targetWordCount,
    conflictLevel: chapter.conflictLevel,
    revealLevel: chapter.revealLevel,
    mustAvoid: chapter.mustAvoid,
    taskSheet: chapter.taskSheet,
  }], {
    preserveContent: true,
    applyDeletes: false,
    deferredExecutionContractChapterIds: new Set([chapter.id]),
  });

  assert.equal(plan.preview.items[0].action, "keep");
  assert.equal(plan.updates[0].deferExecutionContract, true);
  assert.equal(plan.updates[0].preserveWorkflowState, true);
});

test("buildVolumeSyncPlan preserves a complete database execution contract when volume data is deferred", () => {
  const databaseScenePlan = JSON.stringify({
    targetWordCount: 3000,
    lengthBudget: {
      targetWordCount: 3000,
      softMinWordCount: 2550,
      softMaxWordCount: 3450,
      hardMaxWordCount: 3750,
    },
    scenes: [1, 2, 3].map((index) => ({
      key: `scene-${index}`,
      title: `场景${index}`,
      purpose: "推进冲突",
      entryState: "进入场景",
      exitState: "离开场景",
      targetWordCount: 1000,
    })),
  });
  const chapter = {
    id: "volume-chapter-complete-db-contract",
    volumeId: "volume-1",
    chapterOrder: 1,
    title: "第一章",
    summary: "卷纲暂缺执行合同",
    purpose: "保留数据库合同",
    conflictLevel: null,
    revealLevel: null,
    targetWordCount: null,
    mustAvoid: null,
    taskSheet: null,
    sceneCards: null,
    payoffRefs: [],
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
  const plan = buildVolumeSyncPlan(createVolume([chapter]), [{
    id: "chapter-1",
    order: 1,
    title: chapter.title,
    content: "",
    generationState: "planned",
    chapterStatus: "unplanned",
    expectation: chapter.purpose,
    targetWordCount: 3000,
    conflictLevel: 70,
    revealLevel: 20,
    mustAvoid: "不要提前揭示真相",
    taskSheet: "数据库任务单",
    sceneCards: databaseScenePlan,
  }], {
    preserveContent: true,
    applyDeletes: false,
    deferredExecutionContractChapterIds: new Set([chapter.id]),
  });

  assert.equal(plan.updates[0].deferExecutionContract, false);
  assert.equal(plan.updates[0].preserveExistingExecutionContract, true);
});

test("buildVolumeSyncPlan does not mix a changed chapter identity with an old execution contract", () => {
  const chapter = {
    id: "volume-chapter-changed-identity",
    volumeId: "volume-1",
    chapterOrder: 1,
    title: "新标题",
    summary: "新的章节目标",
    purpose: "新的章节目标",
    conflictLevel: null,
    revealLevel: null,
    targetWordCount: null,
    mustAvoid: null,
    taskSheet: null,
    sceneCards: null,
    payoffRefs: [],
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
  const plan = buildVolumeSyncPlan(createVolume([chapter]), [{
    id: "chapter-1",
    order: 1,
    title: "旧标题",
    content: "",
    expectation: "旧章节目标",
    targetWordCount: 3000,
    conflictLevel: 70,
    revealLevel: 20,
    mustAvoid: "不要提前揭示真相",
    taskSheet: "数据库任务单",
    sceneCards: JSON.stringify({
      targetWordCount: 3000,
      lengthBudget: {
        targetWordCount: 3000,
        softMinWordCount: 2550,
        softMaxWordCount: 3450,
        hardMaxWordCount: 3750,
      },
      scenes: [1, 2, 3].map((index) => ({
        key: `scene-${index}`,
        title: `场景${index}`,
        purpose: "推进冲突",
        entryState: "进入场景",
        exitState: "离开场景",
        targetWordCount: 1000,
      })),
    }),
  }], {
    preserveContent: true,
    applyDeletes: false,
    deferredExecutionContractChapterIds: new Set([chapter.id]),
  });

  assert.equal(plan.updates[0].preserveExistingExecutionContract, false);
  assert.equal(plan.updates[0].deferExecutionContract, true);
});
