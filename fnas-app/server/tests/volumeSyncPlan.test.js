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
  assert.equal(plan.deletes[0].chapterId, "chapter-2");
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
