const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildDirectorTakeoverCompletenessSnapshot,
} = require("../dist/services/novel/director/novelDirectorTakeoverCompleteness.js");

function createDetailedChapter(id, order, overrides = {}) {
  return {
    id,
    volumeId: overrides.volumeId ?? "volume-1",
    chapterOrder: order,
    beatKey: overrides.beatKey ?? "beat-1",
    title: overrides.title ?? `第${order}章`,
    summary: overrides.summary ?? `第${order}章摘要`,
    purpose: overrides.purpose ?? `第${order}章目的`,
    conflictLevel: overrides.conflictLevel ?? 2,
    revealLevel: overrides.revealLevel ?? 1,
    targetWordCount: overrides.targetWordCount ?? 2200,
    mustAvoid: overrides.mustAvoid ?? "避免跳章",
    taskSheet: overrides.taskSheet ?? `第${order}章任务单`,
    sceneCards: overrides.sceneCards ?? `第${order}章场景卡`,
    payoffRefs: overrides.payoffRefs ?? ["payoff-1"],
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

function createWorkspace(overrides = {}) {
  const chapters = overrides.chapters ?? [
    createDetailedChapter("chapter-plan-1", 1),
    createDetailedChapter("chapter-plan-2", 2),
  ];
  return {
    novelId: "novel-1",
    workspaceVersion: "v2",
    source: "volume",
    activeVersionId: null,
    strategyPlan: {
      recommendedVolumeCount: 1,
      hardPlannedVolumeCount: 1,
      readerRewardLadder: "奖励阶梯",
      escalationLadder: "升级阶梯",
      midpointShift: "中段转折",
      notes: "策略备注",
      volumes: [{ sortOrder: 1, planningMode: "hard", roleLabel: "第一卷", coreReward: "奖励", escalationFocus: "升级", uncertaintyLevel: "low" }],
      uncertainties: [],
    },
    critiqueReport: null,
    volumes: [{
      id: "volume-1",
      novelId: "novel-1",
      sortOrder: 1,
      title: "第一卷",
      summary: "第一卷摘要",
      openPayoffs: [],
      status: "planned",
      chapters,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    }],
    beatSheets: [{
      volumeId: "volume-1",
      volumeSortOrder: 1,
      status: "generated",
      beats: [{ key: "beat-1", label: "开局", summary: "开局", chapterSpanHint: "1-2章", mustDeliver: ["开局承诺"] }],
    }],
    rebalanceDecisions: [],
    readiness: {
      canGenerateStrategy: true,
      canGenerateSkeleton: true,
      canGenerateBeatSheet: true,
      canGenerateChapterList: true,
      blockingReasons: [],
    },
    derivedOutline: "",
    derivedStructuredOutline: "",
  };
}

function createChapterState(order, overrides = {}) {
  return {
    id: `db-chapter-${order}`,
    order,
    title: overrides.title ?? `第${order}章`,
    expectation: overrides.expectation ?? `第${order}章摘要`,
    targetWordCount: overrides.targetWordCount ?? 2200,
    conflictLevel: overrides.conflictLevel ?? 2,
    revealLevel: overrides.revealLevel ?? 1,
    mustAvoid: overrides.mustAvoid ?? "避免跳章",
    taskSheet: overrides.taskSheet ?? `第${order}章任务单`,
    sceneCards: overrides.sceneCards ?? `第${order}章场景卡`,
    content: overrides.content ?? "",
    generationState: overrides.generationState ?? "planned",
  };
}

test("takeover completeness blocks chapter execution when planned chapters are not synced", () => {
  const snapshot = buildDirectorTakeoverCompletenessSnapshot({
    workspace: createWorkspace(),
    chapterStates: [createChapterState(1)],
    estimatedChapterCount: 2,
  });

  assert.equal(snapshot.volumePlanningReady, true);
  assert.equal(snapshot.structuredOutlineReady, true);
  assert.equal(snapshot.chapterSyncReady, false);
  assert.equal(snapshot.plannedChapterCount, 2);
});

test("takeover completeness detects stale chapter execution contract fields", () => {
  const snapshot = buildDirectorTakeoverCompletenessSnapshot({
    workspace: createWorkspace(),
    chapterStates: [
      createChapterState(1),
      createChapterState(2, { taskSheet: "旧任务单" }),
    ],
    estimatedChapterCount: 2,
  });

  assert.equal(snapshot.structuredOutlineReady, true);
  assert.equal(snapshot.chapterSyncReady, false);
});

test("takeover completeness accepts fully planned, detailed, and synced chapters", () => {
  const snapshot = buildDirectorTakeoverCompletenessSnapshot({
    workspace: createWorkspace(),
    chapterStates: [createChapterState(1), createChapterState(2)],
    estimatedChapterCount: 2,
  });

  assert.equal(snapshot.volumePlanningReady, true);
  assert.equal(snapshot.structuredOutlineReady, true);
  assert.equal(snapshot.chapterSyncReady, true);
  assert.equal(snapshot.structuredOutlineRecoveryStep, "chapter_sync");
});
