const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildVolumeWorkspaceDocument,
  mergeVolumeWorkspaceInput,
  normalizeVolumeWorkspaceDocument,
  serializeVolumeWorkspaceDocument,
} = require("../dist/services/novel/volume/volumeWorkspaceDocument.js");

function createBaseVolume() {
  return {
    id: "volume-1",
    novelId: "novel-1",
    sortOrder: 1,
    title: "第一卷",
    summary: "卷摘要",
    openingHook: "开卷抓手",
    mainPromise: "主承诺",
    primaryPressureSource: "主压迫源",
    coreSellingPoint: "核心卖点",
    escalationMode: "升级方式",
    protagonistChange: "主角变化",
    midVolumeRisk: "中段风险",
    climax: "卷末高潮",
    payoffType: "阶段兑现",
    nextVolumeHook: "下卷钩子",
    resetPoint: null,
    openPayoffs: ["伏笔A"],
    status: "active",
    sourceVersionId: null,
    chapters: [{
      id: "chapter-1",
      volumeId: "volume-1",
      chapterOrder: 1,
      title: "第1章",
      summary: "章节摘要",
      purpose: null,
      conflictLevel: null,
      revealLevel: null,
      targetWordCount: null,
      mustAvoid: null,
      taskSheet: null,
      payoffRefs: [],
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    }],
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

test("volume workspace v2 roundtrip keeps strategy, beat sheet and rebalance assets", () => {
  const document = buildVolumeWorkspaceDocument({
    novelId: "novel-1",
    volumes: [createBaseVolume()],
    strategyPlan: {
      recommendedVolumeCount: 3,
      hardPlannedVolumeCount: 2,
      readerRewardLadder: "先兑现压迫感，再兑现反压。",
      escalationLadder: "敌人不断升级。",
      midpointShift: "中盘暴露更大威胁。",
      notes: "后半本保留弹性。",
      volumes: [{
        sortOrder: 1,
        planningMode: "hard",
        roleLabel: "开局立钩卷",
        coreReward: "强冲突开局",
        escalationFocus: "压迫源登场",
        uncertaintyLevel: "low",
      }],
      uncertainties: [{
        targetType: "volume",
        targetRef: "3",
        level: "medium",
        reason: "第三卷方向依赖后续角色网。",
      }],
    },
    critiqueReport: {
      overallRisk: "medium",
      summary: "后半卷仍有一定弹性风险。",
      issues: [{
        targetRef: "volume:3",
        severity: "medium",
        title: "后半卷偏虚",
        detail: "第三卷只给了方向，没有明确兑现类型。",
      }],
      recommendedActions: ["先锁前两卷，再补第三卷追读回报。"],
    },
    beatSheets: [{
      volumeId: "volume-1",
      volumeSortOrder: 1,
      status: "generated",
      beats: [{
        key: "opening_hook",
        label: "开卷抓手",
        summary: "主角第一次被压制。",
        chapterSpanHint: "1-2章",
        mustDeliver: ["压迫感", "主角处境"],
      }],
    }],
    rebalanceDecisions: [{
      anchorVolumeId: "volume-1",
      affectedVolumeId: "volume-1",
      direction: "push_back",
      severity: "medium",
      summary: "第二卷开局钩子可以后移一章。",
      actions: ["把第二卷第一章的设定解释压缩到上一卷结尾。"],
    }],
    source: "volume",
    activeVersionId: "version-1",
  });

  const reparsed = normalizeVolumeWorkspaceDocument("novel-1", serializeVolumeWorkspaceDocument(document));
  assert.equal(reparsed.workspaceVersion, "v2");
  assert.equal(reparsed.strategyPlan?.recommendedVolumeCount, 3);
  assert.equal(reparsed.critiqueReport?.overallRisk, "medium");
  assert.equal(reparsed.beatSheets[0]?.beats[0]?.key, "opening_hook");
  assert.equal(reparsed.rebalanceDecisions[0]?.direction, "push_back");
});

test("legacy volume version blob upgrades to v2 defaults", () => {
  const reparsed = normalizeVolumeWorkspaceDocument("novel-1", JSON.stringify({
    novelId: "novel-1",
    volumes: [createBaseVolume()],
  }));
  assert.equal(reparsed.workspaceVersion, "v2");
  assert.equal(reparsed.strategyPlan, null);
  assert.equal(reparsed.critiqueReport, null);
  assert.deepEqual(reparsed.beatSheets, []);
  assert.deepEqual(reparsed.rebalanceDecisions, []);
  assert.equal(reparsed.readiness.canGenerateStrategy, true);
});

test("mergeVolumeWorkspaceInput keeps strategy data but clears downstream assets after volume-level edits", () => {
  const current = buildVolumeWorkspaceDocument({
    novelId: "novel-1",
    volumes: [createBaseVolume()],
    strategyPlan: {
      recommendedVolumeCount: 2,
      hardPlannedVolumeCount: 2,
      readerRewardLadder: "先压迫后反压。",
      escalationLadder: "代价持续变高。",
      midpointShift: "中盘站队变化。",
      notes: "前两卷定死。",
      volumes: [{
        sortOrder: 1,
        planningMode: "hard",
        roleLabel: "起势卷",
        coreReward: "反压起势",
        escalationFocus: "敌人压迫升级",
        uncertaintyLevel: "low",
      }],
      uncertainties: [],
    },
    beatSheets: [{
      volumeId: "volume-1",
      volumeSortOrder: 1,
      status: "generated",
      beats: [{
        key: "climax",
        label: "卷高潮",
        summary: "主角第一次正面反压。",
        chapterSpanHint: "8-10章",
        mustDeliver: ["反压兑现"],
      }],
    }],
  });

  const merged = mergeVolumeWorkspaceInput("novel-1", current, {
    volumes: [{
      ...createBaseVolume(),
      title: "第一卷（更新）",
    }],
  });

  assert.equal(merged.volumes[0].title, "第一卷（更新）");
  assert.equal(merged.strategyPlan?.recommendedVolumeCount, 2);
  assert.deepEqual(merged.beatSheets, []);
  assert.deepEqual(merged.rebalanceDecisions, []);
});

test("buildVolumeWorkspaceDocument filters beat sheets and rebalance results that no longer point to active volumes", () => {
  const document = buildVolumeWorkspaceDocument({
    novelId: "novel-1",
    volumes: [createBaseVolume()],
    strategyPlan: {
      recommendedVolumeCount: 1,
      hardPlannedVolumeCount: 1,
      readerRewardLadder: "先压迫后兑现。",
      escalationLadder: "代价持续升级。",
      midpointShift: "中盘身份反转。",
      notes: "先锁当前卷。",
      volumes: [{
        sortOrder: 1,
        planningMode: "hard",
        roleLabel: "起势卷",
        coreReward: "主线抓手成立",
        escalationFocus: "危险升级",
        uncertaintyLevel: "low",
      }],
      uncertainties: [],
    },
    beatSheets: [{
      volumeId: "missing-volume",
      volumeSortOrder: 9,
      status: "generated",
      beats: [{
        key: "opening_hook",
        label: "开卷抓手",
        summary: "不存在的卷",
        chapterSpanHint: "1-2章",
        mustDeliver: ["无效数据"],
      }],
    }],
    rebalanceDecisions: [{
      anchorVolumeId: "missing-volume",
      affectedVolumeId: "volume-1",
      direction: "hold",
      severity: "medium",
      summary: "这条记录应该被过滤。",
      actions: ["忽略"],
    }],
  });

  assert.deepEqual(document.beatSheets, []);
  assert.deepEqual(document.rebalanceDecisions, []);
  assert.equal(document.readiness.canGenerateChapterList, false);
});

test("mergeVolumeWorkspaceInput clears beat sheets and rebalance advice after skeleton-level edits", () => {
  const current = buildVolumeWorkspaceDocument({
    novelId: "novel-1",
    volumes: [createBaseVolume()],
    strategyPlan: {
      recommendedVolumeCount: 1,
      hardPlannedVolumeCount: 1,
      readerRewardLadder: "先压迫后兑现。",
      escalationLadder: "代价持续升级。",
      midpointShift: "中盘身份反转。",
      notes: "先锁当前卷。",
      volumes: [{
        sortOrder: 1,
        planningMode: "hard",
        roleLabel: "起势卷",
        coreReward: "主线抓手成立",
        escalationFocus: "危险升级",
        uncertaintyLevel: "low",
      }],
      uncertainties: [],
    },
    beatSheets: [{
      volumeId: "volume-1",
      volumeSortOrder: 1,
      status: "generated",
      beats: [{
        key: "opening_hook",
        label: "开卷抓手",
        summary: "主角第一次被压制。",
        chapterSpanHint: "1-2章",
        mustDeliver: ["压迫感"],
      }],
    }],
    rebalanceDecisions: [{
      anchorVolumeId: "volume-1",
      affectedVolumeId: "volume-1",
      direction: "hold",
      severity: "low",
      summary: "暂不需要调整。",
      actions: ["保持当前节奏。"],
    }],
  });

  const merged = mergeVolumeWorkspaceInput("novel-1", current, {
    volumes: [{
      ...createBaseVolume(),
      mainPromise: "新的卷承诺",
    }],
    beatSheets: current.beatSheets,
    rebalanceDecisions: current.rebalanceDecisions,
  });

  assert.deepEqual(merged.beatSheets, []);
  assert.deepEqual(merged.rebalanceDecisions, []);
});

test("mergeVolumeWorkspaceInput keeps beat sheets but clears rebalance advice after chapter-list edits", () => {
  const current = buildVolumeWorkspaceDocument({
    novelId: "novel-1",
    volumes: [createBaseVolume()],
    strategyPlan: {
      recommendedVolumeCount: 1,
      hardPlannedVolumeCount: 1,
      readerRewardLadder: "先压迫后兑现。",
      escalationLadder: "代价持续升级。",
      midpointShift: "中盘身份反转。",
      notes: "先锁当前卷。",
      volumes: [{
        sortOrder: 1,
        planningMode: "hard",
        roleLabel: "起势卷",
        coreReward: "主线抓手成立",
        escalationFocus: "危险升级",
        uncertaintyLevel: "low",
      }],
      uncertainties: [],
    },
    beatSheets: [{
      volumeId: "volume-1",
      volumeSortOrder: 1,
      status: "generated",
      beats: [{
        key: "opening_hook",
        label: "开卷抓手",
        summary: "主角第一次被压制。",
        chapterSpanHint: "1-2章",
        mustDeliver: ["压迫感"],
      }],
    }],
    rebalanceDecisions: [{
      anchorVolumeId: "volume-1",
      affectedVolumeId: "volume-1",
      direction: "hold",
      severity: "low",
      summary: "暂不需要调整。",
      actions: ["保持当前节奏。"],
    }],
  });

  const merged = mergeVolumeWorkspaceInput("novel-1", current, {
    volumes: [{
      ...createBaseVolume(),
      chapters: [{
        ...createBaseVolume().chapters[0],
        summary: "新的章节摘要",
      }],
    }],
    beatSheets: current.beatSheets,
    rebalanceDecisions: current.rebalanceDecisions,
  });

  assert.equal(merged.beatSheets.length, 1);
  assert.deepEqual(merged.rebalanceDecisions, []);
});
