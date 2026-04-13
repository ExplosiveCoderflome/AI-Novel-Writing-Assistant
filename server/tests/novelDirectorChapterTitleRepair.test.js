const test = require("node:test");
const assert = require("node:assert/strict");

const { repairDirectorChapterTitles } = require("../dist/services/novel/director/novelDirectorChapterTitleRepair.js");

function createRequest() {
  return {
    runMode: "auto_to_ready",
    provider: "deepseek",
    model: "deepseek-chat",
    temperature: 0.7,
    candidate: {
      workingTitle: "都市神医：我的病人都是大佬",
    },
  };
}

function createVolume(id, sortOrder, titles) {
  return {
    id,
    sortOrder,
    title: `第${sortOrder}卷`,
    summary: "",
    openingHook: "",
    mainPromise: "",
    primaryPressureSource: "",
    coreSellingPoint: "",
    escalationMode: "",
    protagonistChange: "",
    midVolumeRisk: "",
    climax: "",
    payoffType: "",
    nextVolumeHook: "",
    resetPoint: "",
    openPayoffs: [],
    chapters: titles.map((title, index) => ({
      id: `${id}-chapter-${index + 1}`,
      chapterOrder: index + 1,
      title,
      summary: `第 ${index + 1} 章摘要`,
      purpose: "",
      targetWordCount: null,
      conflictLevel: null,
      revealLevel: null,
      mustAvoid: "",
      taskSheet: "",
      sceneCards: null,
      payoffRefs: [],
    })),
  };
}

test("repairDirectorChapterTitles clears warning notice after titles are diversified", async () => {
  const baseWorkspace = {
    novelId: "novel_demo",
    workspaceVersion: "v2",
    source: "volume",
    activeVersionId: "version-1",
    derivedOutline: "",
    derivedStructuredOutline: "",
    readiness: {},
    strategyPlan: null,
    critiqueReport: null,
    beatSheets: [],
    rebalanceDecisions: [],
    volumes: [
      createVolume("volume-1", 1, [
        "医院的秘密1",
        "医院的秘密2",
        "医院的秘密3",
        "医院的秘密4",
      ]),
    ],
  };
  const repairedWorkspace = {
    ...baseWorkspace,
    volumes: [
      createVolume("volume-1", 1, [
        "我先把第一位大佬救回来",
        "诊室门口突然排起长队",
        "这张化验单藏着第二层危机",
        "他当场改口，要把整栋楼送我",
      ]),
    ],
  };

  const markTaskRunningCalls = [];
  const markTaskWaitingApprovalCalls = [];
  const volumeService = {
    getVolumes: async () => baseWorkspace,
    generateVolumes: async (_novelId, options) => {
      await options.onPhaseStart?.({
        scope: "chapter_list",
        phase: "load_context",
        label: "",
      });
      return repairedWorkspace;
    },
    updateVolumes: async () => repairedWorkspace,
  };
  const workflowService = {
    markTaskRunning: async (_taskId, payload) => {
      markTaskRunningCalls.push(payload);
    },
    markTaskWaitingApproval: async (_taskId, payload) => {
      markTaskWaitingApprovalCalls.push(payload);
    },
  };

  await repairDirectorChapterTitles({
    taskId: "task-1",
    novelId: "novel_demo",
    targetVolumeId: "volume-1",
    request: createRequest(),
    volumeService,
    workflowService,
    buildDirectorSeedPayload: (_request, novelId, extra) => ({
      novelId,
      ...extra,
    }),
  });

  assert.equal(markTaskRunningCalls.length, 1);
  assert.match(markTaskRunningCalls[0].itemLabel, /整理第 1 卷拆章上下文/);
  assert.equal(markTaskWaitingApprovalCalls.length, 1);
  assert.equal(markTaskWaitingApprovalCalls[0].volumeId, "volume-1");
  assert.equal(markTaskWaitingApprovalCalls[0].clearCheckpoint, true);
  assert.equal(markTaskWaitingApprovalCalls[0].seedPayload.taskNotice, null);
});

test("repairDirectorChapterTitles keeps warning notice when repaired titles are still too concentrated", async () => {
  const repetitiveTitles = Array.from({ length: 10 }, (_, index) => `医院的秘密${index + 1}`);
  const workspace = {
    novelId: "novel_demo",
    workspaceVersion: "v2",
    source: "volume",
    activeVersionId: "version-1",
    derivedOutline: "",
    derivedStructuredOutline: "",
    readiness: {},
    strategyPlan: null,
    critiqueReport: null,
    beatSheets: [],
    rebalanceDecisions: [],
    volumes: [
      createVolume("volume-1", 1, repetitiveTitles),
    ],
  };

  const markTaskWaitingApprovalCalls = [];
  const volumeService = {
    getVolumes: async () => workspace,
    generateVolumes: async () => workspace,
    updateVolumes: async () => workspace,
  };
  const workflowService = {
    markTaskRunning: async () => undefined,
    markTaskWaitingApproval: async (_taskId, payload) => {
      markTaskWaitingApprovalCalls.push(payload);
    },
  };

  await repairDirectorChapterTitles({
    taskId: "task-2",
    novelId: "novel_demo",
    targetVolumeId: "volume-1",
    request: createRequest(),
    volumeService,
    workflowService,
    buildDirectorSeedPayload: (_request, novelId, extra) => ({
      novelId,
      ...extra,
    }),
  });

  assert.equal(markTaskWaitingApprovalCalls.length, 1);
  assert.equal(markTaskWaitingApprovalCalls[0].seedPayload.taskNotice.code, "CHAPTER_TITLE_DIVERSITY");
  assert.equal(markTaskWaitingApprovalCalls[0].seedPayload.taskNotice.action.volumeId, "volume-1");
});
