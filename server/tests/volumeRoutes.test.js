const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { createApp } = require("../dist/app.js");
const { NovelService } = require("../dist/services/novel/NovelService.js");

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(address.port);
    });
  });
}

function createVolume() {
  return {
    id: "volume-1",
    sortOrder: 1,
    title: "第一卷",
    summary: "卷摘要",
    openingHook: "开卷抓手",
    mainPromise: "卷主承诺",
    primaryPressureSource: "压迫源",
    coreSellingPoint: "卷卖点",
    escalationMode: "逐步升级",
    protagonistChange: "主角被迫上桌",
    midVolumeRisk: "中段塌陷风险",
    climax: "卷末高潮",
    payoffType: "阶段兑现",
    nextVolumeHook: "下卷钩子",
    resetPoint: null,
    openPayoffs: ["伏笔A"],
    status: "active",
    sourceVersionId: null,
    chapters: [{
      id: "volume-chapter-1",
      chapterOrder: 1,
      title: "第1章",
      summary: "章节摘要",
      purpose: "建立压迫",
      conflictLevel: 70,
      revealLevel: 30,
      targetWordCount: 3200,
      mustAvoid: "不要堆设定",
      taskSheet: "任务单",
      payoffRefs: ["伏笔A"],
    }],
  };
}

function createWorkspace(novelId) {
  return {
    novelId,
    workspaceVersion: "v2",
    volumes: [createVolume()],
    strategyPlan: {
      recommendedVolumeCount: 3,
      hardPlannedVolumeCount: 2,
      readerRewardLadder: "先压迫再反压。",
      escalationLadder: "敌人越来越近。",
      midpointShift: "中盘翻面。",
      notes: "后半本保留弹性。",
      volumes: [{
        sortOrder: 1,
        planningMode: "hard",
        roleLabel: "起势卷",
        coreReward: "压迫感拉满",
        escalationFocus: "敌人正式进场",
        uncertaintyLevel: "low",
      }],
      uncertainties: [],
    },
    critiqueReport: {
      overallRisk: "medium",
      summary: "卷二仍有一定弹性风险。",
      issues: [{
        targetRef: "volume:2",
        severity: "medium",
        title: "中盘偏虚",
        detail: "第二卷缺少明确兑现。",
      }],
      recommendedActions: ["先锁前两卷兑现链。"],
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
        mustDeliver: ["压迫感", "处境"],
      }],
    }],
    rebalanceDecisions: [{
      anchorVolumeId: "volume-1",
      affectedVolumeId: "volume-1",
      direction: "hold",
      severity: "low",
      summary: "当前节奏可保持。",
      actions: ["保持当前节奏。"],
    }],
    readiness: {
      canGenerateStrategy: true,
      canGenerateSkeleton: true,
      canGenerateBeatSheet: true,
      canGenerateChapterList: true,
      blockingReasons: [],
    },
    derivedOutline: "卷纲摘要",
    derivedStructuredOutline: "{\"volumes\":[]}",
    source: "volume",
    activeVersionId: "version-1",
  };
}

function createVersion(version, status = "active") {
  const now = new Date().toISOString();
  return {
    id: `version-${version}`,
    novelId: "novel-volume-route-test",
    version,
    status,
    diffSummary: `版本 ${version} 变更摘要`,
    createdAt: now,
    updatedAt: now,
  };
}

function createDiff(novelId) {
  return {
    id: "version-2",
    novelId,
    version: 2,
    status: "draft",
    diffSummary: "第一卷章节规划有更新。",
    changedLines: 18,
    changedVolumeCount: 1,
    changedChapterCount: 1,
    changedVolumes: [{
      sortOrder: 1,
      title: "第一卷",
      changedFields: ["主承诺", "章节规划"],
      chapterOrders: [1],
    }],
    affectedChapterOrders: [1],
  };
}

function createImpact(novelId) {
  return {
    novelId,
    sourceVersion: 2,
    changedLines: 18,
    affectedVolumeCount: 1,
    affectedChapterCount: 1,
    affectedVolumes: [{
      sortOrder: 1,
      title: "第一卷",
      changedFields: ["主承诺", "章节规划"],
      chapterOrders: [1],
    }],
    requiresChapterSync: true,
    requiresCharacterReview: true,
    recommendedActions: ["同步章节计划", "复核角色职责与成长线"],
  };
}

function createSyncPreview() {
  return {
    createCount: 1,
    updateCount: 1,
    keepCount: 0,
    moveCount: 0,
    deleteCount: 0,
    deleteCandidateCount: 1,
    affectedGeneratedCount: 1,
    clearContentCount: 0,
    affectedVolumeCount: 1,
    items: [{
      action: "update",
      volumeTitle: "第一卷",
      chapterOrder: 1,
      nextTitle: "第1章",
      previousTitle: "旧第1章",
      hasContent: true,
      changedFields: ["摘要", "任务单"],
    }],
  };
}

test("volume routes cover workspace, versions, impact analysis, sync and legacy migration contracts", async () => {
  const originalMethods = {
    getVolumes: NovelService.prototype.getVolumes,
    generateVolumes: NovelService.prototype.generateVolumes,
    updateVolumes: NovelService.prototype.updateVolumes,
    listVolumeVersions: NovelService.prototype.listVolumeVersions,
    createVolumeDraft: NovelService.prototype.createVolumeDraft,
    activateVolumeVersion: NovelService.prototype.activateVolumeVersion,
    freezeVolumeVersion: NovelService.prototype.freezeVolumeVersion,
    getVolumeDiff: NovelService.prototype.getVolumeDiff,
    analyzeVolumeImpact: NovelService.prototype.analyzeVolumeImpact,
    syncVolumeChapters: NovelService.prototype.syncVolumeChapters,
    migrateLegacyVolumes: NovelService.prototype.migrateLegacyVolumes,
  };
  const novelId = "novel-volume-route-test";
  const workspace = createWorkspace(novelId);

  NovelService.prototype.getVolumes = async () => workspace;
  NovelService.prototype.generateVolumes = async () => workspace;
  NovelService.prototype.updateVolumes = async () => workspace;
  NovelService.prototype.listVolumeVersions = async () => [createVersion(2, "draft"), createVersion(1, "active")];
  NovelService.prototype.createVolumeDraft = async () => createVersion(3, "draft");
  NovelService.prototype.activateVolumeVersion = async () => createVersion(2, "active");
  NovelService.prototype.freezeVolumeVersion = async () => createVersion(2, "frozen");
  NovelService.prototype.getVolumeDiff = async () => createDiff(novelId);
  NovelService.prototype.analyzeVolumeImpact = async () => createImpact(novelId);
  NovelService.prototype.syncVolumeChapters = async () => createSyncPreview();
  NovelService.prototype.migrateLegacyVolumes = async () => ({
    ...workspace,
    source: "legacy",
  });

  const app = createApp();
  const server = http.createServer(app);
  const port = await listen(server);
  try {
    const getResponse = await fetch(`http://127.0.0.1:${port}/api/novels/${novelId}/volumes`);
    assert.equal(getResponse.status, 200);
    const getPayload = await getResponse.json();
    assert.equal(getPayload.data.workspaceVersion, "v2");
    assert.equal(getPayload.data.strategyPlan.recommendedVolumeCount, 3);
    assert.equal(getPayload.data.beatSheets[0].beats[0].key, "opening_hook");

    const strategyResponse = await fetch(`http://127.0.0.1:${port}/api/novels/${novelId}/volumes/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ scope: "strategy" }),
    });
    assert.equal(strategyResponse.status, 200);

    const draftResponse = await fetch(`http://127.0.0.1:${port}/api/novels/${novelId}/volumes/versions/draft`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        volumes: [createVolume()],
        diffSummary: "草稿版本",
        baseVersion: 1,
      }),
    });
    assert.equal(draftResponse.status, 201);
    const draftPayload = await draftResponse.json();
    assert.equal(draftPayload.data.version, 3);

    const versionsResponse = await fetch(`http://127.0.0.1:${port}/api/novels/${novelId}/volumes/versions`);
    assert.equal(versionsResponse.status, 200);
    const versionsPayload = await versionsResponse.json();
    assert.equal(versionsPayload.data.length, 2);
    assert.equal(versionsPayload.data[0].status, "draft");

    const activateResponse = await fetch(`http://127.0.0.1:${port}/api/novels/${novelId}/volumes/versions/version-2/activate`, {
      method: "POST",
    });
    assert.equal(activateResponse.status, 200);
    const activatePayload = await activateResponse.json();
    assert.equal(activatePayload.data.status, "active");

    const freezeResponse = await fetch(`http://127.0.0.1:${port}/api/novels/${novelId}/volumes/versions/version-2/freeze`, {
      method: "POST",
    });
    assert.equal(freezeResponse.status, 200);
    const freezePayload = await freezeResponse.json();
    assert.equal(freezePayload.data.status, "frozen");

    const diffResponse = await fetch(`http://127.0.0.1:${port}/api/novels/${novelId}/volumes/versions/version-2/diff?compareVersion=1`);
    assert.equal(diffResponse.status, 200);
    const diffPayload = await diffResponse.json();
    assert.equal(diffPayload.data.changedChapterCount, 1);
    assert.equal(diffPayload.data.changedVolumes[0].changedFields[0], "主承诺");

    const impactResponse = await fetch(`http://127.0.0.1:${port}/api/novels/${novelId}/volumes/impact-analysis`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        volumes: [createVolume()],
      }),
    });
    assert.equal(impactResponse.status, 200);
    const impactPayload = await impactResponse.json();
    assert.equal(impactPayload.data.requiresChapterSync, true);
    assert.equal(impactPayload.data.requiresCharacterReview, true);

    const syncResponse = await fetch(`http://127.0.0.1:${port}/api/novels/${novelId}/volumes/sync-chapters`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        volumes: [createVolume()],
        preserveContent: true,
        applyDeletes: false,
      }),
    });
    assert.equal(syncResponse.status, 200);
    const syncPayload = await syncResponse.json();
    assert.equal(syncPayload.data.updateCount, 1);
    assert.equal(syncPayload.data.deleteCandidateCount, 1);

    const migrateResponse = await fetch(`http://127.0.0.1:${port}/api/novels/${novelId}/volumes/migrate-legacy`, {
      method: "POST",
    });
    assert.equal(migrateResponse.status, 200);
    const migratePayload = await migrateResponse.json();
    assert.equal(migratePayload.data.source, "legacy");

    const updateResponse = await fetch(`http://127.0.0.1:${port}/api/novels/${novelId}/volumes`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        volumes: [createVolume()],
        strategyPlan: workspace.strategyPlan,
      }),
    });
    assert.equal(updateResponse.status, 200);

    const missingTargetResponse = await fetch(`http://127.0.0.1:${port}/api/novels/${novelId}/volumes/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ scope: "chapter_list" }),
    });
    assert.equal(missingTargetResponse.status, 400);
  } finally {
    Object.assign(NovelService.prototype, originalMethods);
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
