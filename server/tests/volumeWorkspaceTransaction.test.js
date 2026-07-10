const test = require("node:test");
const assert = require("node:assert/strict");
const { prisma } = require("../dist/db/prisma.js");
const {
  VOLUME_WORKSPACE_TRANSACTION_TIMEOUT_MS,
  runVolumeWorkspaceTransaction,
} = require("../dist/services/novel/volume/volumeWorkspacePersistence.js");

test("runVolumeWorkspaceTransaction uses an explicit timeout for large volume writes", async () => {
  const originalTransaction = prisma.$transaction;
  let receivedOptions = null;

  prisma.$transaction = async (callback, options) => {
    receivedOptions = options;
    return callback({ ok: true });
  };

  try {
    const result = await runVolumeWorkspaceTransaction((tx) => tx.ok);
    assert.equal(result, true);
    assert.ok(receivedOptions);
    assert.equal(receivedOptions.timeout, VOLUME_WORKSPACE_TRANSACTION_TIMEOUT_MS);
    assert.ok(receivedOptions.timeout > 5000);
  } finally {
    prisma.$transaction = originalTransaction;
  }
});

test("runVolumeWorkspaceTransaction retries transient sqlite locks", async () => {
  const originalTransaction = prisma.$transaction;
  let attempts = 0;

  prisma.$transaction = async (callback, options) => {
    attempts += 1;
    if (attempts === 1) {
      throw new Error("database is locked");
    }
    assert.ok(options);
    return callback({ ok: "recovered" });
  };

  try {
    const result = await runVolumeWorkspaceTransaction((tx) => tx.ok);
    assert.equal(result, "recovered");
    assert.equal(attempts, 2);
  } finally {
    prisma.$transaction = originalTransaction;
  }
});

test("persistActiveVolumeWorkspace updates existing planning rows instead of recreating the whole workspace", async () => {
  const {
    persistActiveVolumeWorkspace,
  } = require("../dist/services/novel/volume/volumeWorkspacePersistence.js");
  const calls = [];
  const tx = {
    volumePlan: {
      findMany: async () => ([
        {
          id: "volume-1",
          sortOrder: 1,
          title: "第一卷",
          summary: "旧卷摘要",
          mainPromise: null,
          escalationMode: null,
          protagonistChange: null,
          climax: null,
          nextVolumeHook: null,
          resetPoint: null,
          openPayoffsJson: "[]",
          status: "active",
          sourceVersionId: "version-1",
          chapters: [{
            id: "chapter-1",
            volumeId: "volume-1",
            chapterOrder: 1,
            title: "第一章",
            summary: "旧章节摘要",
            purpose: null,
            conflictLevel: null,
            conflictLevelSource: null,
            revealLevel: null,
            targetWordCount: null,
            mustAvoid: null,
            taskSheet: null,
            sceneCards: null,
            payoffRefsJson: "[]",
          }, {
            id: "chapter-stale",
            volumeId: "volume-1",
            chapterOrder: 2,
            title: "旧章",
            summary: "旧章摘要",
            purpose: null,
            conflictLevel: null,
            conflictLevelSource: null,
            revealLevel: null,
            targetWordCount: null,
            mustAvoid: null,
            taskSheet: null,
            sceneCards: null,
            payoffRefsJson: "[]",
          }],
        },
      ]),
      update: async (args) => {
        calls.push(["volumePlan.update", args]);
      },
      upsert: async (args) => {
        calls.push(["volumePlan.upsert", args]);
      },
      deleteMany: async (args) => {
        calls.push(["volumePlan.deleteMany", args]);
      },
    },
    volumeChapterPlan: {
      create: async (args) => {
        calls.push(["volumeChapterPlan.create", args]);
      },
      update: async (args) => {
        calls.push(["volumeChapterPlan.update", args]);
      },
      upsert: async (args) => {
        calls.push(["volumeChapterPlan.upsert", args]);
      },
      deleteMany: async (args) => {
        calls.push(["volumeChapterPlan.deleteMany", args]);
      },
    },
    novel: {
      update: async (args) => {
        calls.push(["novel.update", args]);
      },
    },
    storyPlan: {
      deleteMany: async (args) => {
        calls.push(["storyPlan.deleteMany", args]);
      },
      findFirst: async () => null,
      create: async (args) => {
        calls.push(["storyPlan.create", args]);
      },
      update: async (args) => {
        calls.push(["storyPlan.update", args]);
      },
    },
  };
  const document = {
    novelId: "novel-1",
    workspaceVersion: "v2",
    volumes: [{
      id: "volume-1",
      novelId: "novel-1",
      sortOrder: 1,
      title: "第一卷",
      summary: "更新后的卷摘要",
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
        beatKey: null,
        title: "第一章",
        summary: "更新后的章节摘要",
        purpose: "细化目的",
        exclusiveEvent: null,
        endingState: null,
        nextChapterEntryState: null,
        conflictLevel: 50,
        revealLevel: 40,
        targetWordCount: 3000,
        mustAvoid: null,
        taskSheet: "任务书",
        sceneCards: "场景卡",
        styleContract: null,
        payoffRefs: [],
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
      }],
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    }],
    strategyPlan: null,
    critiqueReport: null,
    beatSheets: [],
    rebalanceDecisions: [],
    readiness: {
      canGenerateStrategy: true,
      canGenerateSkeleton: false,
      canGenerateBeatSheet: false,
      canGenerateChapterList: false,
      blockingReasons: [],
    },
    derivedOutline: "outline",
    derivedStructuredOutline: "structured",
    source: "volume",
    activeVersionId: "version-1",
  };

  await persistActiveVolumeWorkspace(tx, "novel-1", document, "version-1");

  assert.ok(calls.some(([name, args]) => name === "volumePlan.update" && args.where.id === "volume-1"));
  assert.ok(calls.some(([name, args]) => name === "volumeChapterPlan.update" && args.where.id === "chapter-1"));
  assert.ok(calls.some(([name, args]) => name === "volumeChapterPlan.deleteMany" && args.where.id.in.includes("chapter-stale")));
  assert.ok(!calls.some(([name, args]) => name === "volumePlan.deleteMany" && args.where?.novelId === "novel-1"));
});

function createVolumeWorkspaceTx(existingChapter, calls) {
  return {
    volumePlan: {
      findMany: async () => ([{
        id: "volume-1",
        sortOrder: 1,
        title: "第一卷",
        summary: "卷摘要",
        mainPromise: null,
        escalationMode: null,
        protagonistChange: null,
        climax: null,
        nextVolumeHook: null,
        resetPoint: null,
        openPayoffsJson: "[]",
        status: "active",
        sourceVersionId: "version-1",
        chapters: [existingChapter],
      }]),
      update: async (args) => calls.push(["volumePlan.update", args]),
      deleteMany: async (args) => calls.push(["volumePlan.deleteMany", args]),
    },
    volumeChapterPlan: {
      create: async (args) => calls.push(["volumeChapterPlan.create", args]),
      update: async (args) => calls.push(["volumeChapterPlan.update", args]),
      deleteMany: async (args) => calls.push(["volumeChapterPlan.deleteMany", args]),
    },
    novel: {
      update: async (args) => calls.push(["novel.update", args]),
    },
    storyPlan: {
      deleteMany: async (args) => calls.push(["storyPlan.deleteMany", args]),
      findFirst: async () => null,
      create: async (args) => calls.push(["storyPlan.create", args]),
      update: async (args) => calls.push(["storyPlan.update", args]),
    },
  };
}

function createVolumeWorkspaceDocument(chapterOverrides = {}) {
  return {
    novelId: "novel-1",
    workspaceVersion: "v2",
    volumes: [{
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
        chapterId: null,
        chapterOrder: 1,
        beatKey: null,
        title: "第一章",
        summary: "更新后的章节摘要",
        purpose: null,
        exclusiveEvent: null,
        endingState: null,
        nextChapterEntryState: null,
        revealLevel: null,
        targetWordCount: null,
        mustAvoid: null,
        taskSheet: null,
        sceneCards: null,
        styleContract: null,
        payoffRefs: [],
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
        ...chapterOverrides,
      }],
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    }],
    strategyPlan: null,
    critiqueReport: null,
    beatSheets: [],
    rebalanceDecisions: [],
    readiness: {
      canGenerateStrategy: true,
      canGenerateSkeleton: false,
      canGenerateBeatSheet: false,
      canGenerateChapterList: false,
      blockingReasons: [],
    },
    derivedOutline: "outline",
    derivedStructuredOutline: "structured",
    source: "volume",
    activeVersionId: "version-1",
  };
}

function createExistingVolumeChapter(overrides = {}) {
  return {
    id: "chapter-1",
    volumeId: "volume-1",
    chapterId: null,
    chapterOrder: 1,
    title: "第一章",
    summary: "旧章节摘要",
    purpose: null,
    conflictLevel: 72,
    conflictLevelSource: "user",
    revealLevel: null,
    targetWordCount: null,
    mustAvoid: null,
    taskSheet: null,
    sceneCards: null,
    payoffRefsJson: "[]",
    ...overrides,
  };
}

test("persistActiveVolumeWorkspace keeps existing conflict level when the draft omits the field", async () => {
  const {
    persistActiveVolumeWorkspace,
  } = require("../dist/services/novel/volume/volumeWorkspacePersistence.js");
  const calls = [];
  const tx = createVolumeWorkspaceTx(createExistingVolumeChapter(), calls);

  await persistActiveVolumeWorkspace(tx, "novel-1", createVolumeWorkspaceDocument(), "version-1");

  const updateCall = calls.find(([name, args]) => name === "volumeChapterPlan.update" && args.where.id === "chapter-1");
  assert.ok(updateCall, "chapter should still update non-conflict fields");
  assert.equal(Object.prototype.hasOwnProperty.call(updateCall[1].data, "conflictLevel"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(updateCall[1].data, "conflictLevelSource"), false);
});

test("persistActiveVolumeWorkspace does not let AI conflict levels overwrite user anchors", async () => {
  const {
    persistActiveVolumeWorkspace,
  } = require("../dist/services/novel/volume/volumeWorkspacePersistence.js");
  const calls = [];
  const tx = createVolumeWorkspaceTx(createExistingVolumeChapter(), calls);

  await persistActiveVolumeWorkspace(tx, "novel-1", createVolumeWorkspaceDocument({
    conflictLevel: 35,
    conflictLevelSource: "ai",
  }), "version-1");

  const updateCall = calls.find(([name, args]) => name === "volumeChapterPlan.update" && args.where.id === "chapter-1");
  assert.ok(updateCall, "chapter should still update non-conflict fields");
  assert.equal(Object.prototype.hasOwnProperty.call(updateCall[1].data, "conflictLevel"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(updateCall[1].data, "conflictLevelSource"), false);
});

test("persistActiveVolumeWorkspace releases a user anchor only with an explicit same-value AI handoff", async () => {
  const {
    persistActiveVolumeWorkspace,
  } = require("../dist/services/novel/volume/volumeWorkspacePersistence.js");
  const calls = [];
  const tx = createVolumeWorkspaceTx(createExistingVolumeChapter({
    conflictLevel: 72,
    conflictLevelSource: "user",
  }), calls);

  await persistActiveVolumeWorkspace(tx, "novel-1", createVolumeWorkspaceDocument({
    conflictLevel: 72,
    conflictLevelSource: "ai",
  }), "version-1");

  const updateCall = calls.find(([name, args]) => name === "volumeChapterPlan.update" && args.where.id === "chapter-1");
  assert.ok(updateCall);
  assert.equal(updateCall[1].data.conflictLevel, 72);
  assert.equal(updateCall[1].data.conflictLevelSource, "ai");
});

test("persistActiveVolumeWorkspace writes explicit user conflict anchors", async () => {
  const {
    persistActiveVolumeWorkspace,
  } = require("../dist/services/novel/volume/volumeWorkspacePersistence.js");
  const calls = [];
  const tx = createVolumeWorkspaceTx(createExistingVolumeChapter({
    conflictLevel: 40,
    conflictLevelSource: "ai",
  }), calls);

  await persistActiveVolumeWorkspace(tx, "novel-1", createVolumeWorkspaceDocument({
    conflictLevel: 88,
    conflictLevelSource: "user",
  }), "version-1");

  const updateCall = calls.find(([name, args]) => name === "volumeChapterPlan.update" && args.where.id === "chapter-1");
  assert.ok(updateCall);
  assert.equal(updateCall[1].data.conflictLevel, 88);
  assert.equal(updateCall[1].data.conflictLevelSource, "user");
});
