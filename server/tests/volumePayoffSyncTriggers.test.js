const test = require("node:test");
const assert = require("node:assert/strict");

const {
  hasPayoffLedgerRelevantPlanChanges,
  hasPayoffLedgerSourceSignals,
} = require("../dist/services/novel/volume/volumePlanUtils.js");

function createVolume(overrides = {}) {
  return {
    id: "volume-1",
    novelId: "novel-1",
    sortOrder: 1,
    title: "第一卷",
    summary: "卷摘要",
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
    chapters: [{
      id: "chapter-1",
      volumeId: "volume-1",
      chapterOrder: 1,
      title: "第1章",
      summary: "章节摘要",
      purpose: null,
      exclusiveEvent: null,
      endingState: null,
      nextChapterEntryState: null,
      conflictLevel: null,
      revealLevel: null,
      targetWordCount: null,
      mustAvoid: null,
      taskSheet: null,
      sceneCards: null,
      payoffRefs: [],
      beatKey: null,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    }],
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  };
}

test("payoff sync ignores chapter purpose-only edits", () => {
  const before = [createVolume()];
  const after = [createVolume({
    chapters: [{
      ...createVolume().chapters[0],
      purpose: "把推进方式切到主动试探。",
    }],
  })];

  assert.equal(hasPayoffLedgerSourceSignals(after), false);
  assert.equal(hasPayoffLedgerRelevantPlanChanges(before, after), false);
});

test("payoff sync triggers when volume open payoffs change", () => {
  const before = [createVolume()];
  const after = [createVolume({
    openPayoffs: ["身份秘密必须延后回收"],
  })];

  assert.equal(hasPayoffLedgerSourceSignals(after), true);
  assert.equal(hasPayoffLedgerRelevantPlanChanges(before, after), true);
});

test("payoff sync triggers when chapter payoff refs change", () => {
  const before = [createVolume()];
  const after = [createVolume({
    chapters: [{
      ...createVolume().chapters[0],
      payoffRefs: ["主角真实身份"],
    }],
  })];

  assert.equal(hasPayoffLedgerSourceSignals(after), true);
  assert.equal(hasPayoffLedgerRelevantPlanChanges(before, after), true);
});

test("payoff sync tracks chapter-order shifts for chapters with payoff refs", () => {
  const baseChapter = createVolume().chapters[0];
  const before = [createVolume({
    chapters: [{
      ...baseChapter,
      chapterOrder: 3,
      payoffRefs: ["主角真实身份"],
    }],
  })];
  const after = [createVolume({
    chapters: [{
      ...baseChapter,
      chapterOrder: 5,
      payoffRefs: ["主角真实身份"],
    }],
  })];

  assert.equal(hasPayoffLedgerRelevantPlanChanges(before, after), true);
});

test("payoff sync tracks volume window shifts when open payoffs exist", () => {
  const baseChapter = createVolume().chapters[0];
  const before = [createVolume({
    openPayoffs: ["卷末必须兑现第一次反压"],
    chapters: [
      { ...baseChapter, chapterOrder: 1 },
      { ...baseChapter, id: "chapter-2", chapterOrder: 2, title: "第2章" },
    ],
  })];
  const after = [createVolume({
    openPayoffs: ["卷末必须兑现第一次反压"],
    chapters: [
      { ...baseChapter, chapterOrder: 1 },
      { ...baseChapter, id: "chapter-2", chapterOrder: 2, title: "第2章" },
      { ...baseChapter, id: "chapter-3", chapterOrder: 3, title: "第3章" },
    ],
  })];

  assert.equal(hasPayoffLedgerRelevantPlanChanges(before, after), true);
});
