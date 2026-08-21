const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveChapterTargetWordCount,
} = require("../dist/services/novel/volume/volumeGenerationHelpers.js");

function createChapter(order, targetWordCount) {
  return {
    id: `chapter-${order}`,
    volumeId: "volume-1",
    chapterOrder: order,
    title: `第${order}章`,
    summary: "章节摘要",
    purpose: null,
    exclusiveEvent: null,
    endingState: null,
    nextChapterEntryState: null,
    conflictLevel: null,
    conflictLevelSource: null,
    revealLevel: null,
    targetWordCount,
    mustAvoid: null,
    taskSheet: null,
    sceneCards: null,
    payoffRefs: [],
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

function createVolume(chapters) {
  return {
    id: "volume-1",
    novelId: "novel-1",
    sortOrder: 1,
    title: "第一卷",
    summary: "测试卷",
    openingHook: null,
    mainPromise: null,
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
  };
}

test("chapter detail inherits the nearest explicit target word count", () => {
  const volume = createVolume([
    createChapter(7, 3000),
    createChapter(8, 2500),
    createChapter(9, null),
    createChapter(10, null),
  ]);

  assert.equal(resolveChapterTargetWordCount(volume, volume.chapters[2]), 2500);
});

test("chapter detail falls back to the normal execution default when no chapter has a budget", () => {
  const volume = createVolume([
    createChapter(1, null),
    createChapter(2, null),
  ]);

  assert.equal(resolveChapterTargetWordCount(volume, volume.chapters[1]), 2500);
});
