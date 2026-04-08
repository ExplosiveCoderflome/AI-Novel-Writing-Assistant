const assert = require("node:assert/strict");
const test = require("node:test");
const { prisma } = require("../dist/db/prisma.js");
const { persistStoryPlan } = require("../dist/services/planner/plannerPersistence.js");

test("persistStoryPlan syncs chapter assets and promotes empty chapters to pending_generation", async () => {
  const original = {
    findFirst: prisma.storyPlan.findFirst,
    findUnique: prisma.storyPlan.findUnique,
    transaction: prisma.$transaction,
  };
  const captured = {
    chapterUpdate: null,
    persistedSceneRows: null,
  };

  prisma.storyPlan.findFirst = async () => null;
  prisma.$transaction = async (callback) => callback({
    storyPlan: {
      create: async () => ({ id: "plan-1" }),
    },
    chapterPlanScene: {
      deleteMany: async () => undefined,
      createMany: async ({ data }) => {
        captured.persistedSceneRows = data;
      },
    },
    chapter: {
      findUnique: async () => ({
        content: "",
        chapterStatus: "unplanned",
      }),
      update: async ({ data }) => {
        captured.chapterUpdate = data;
        return { id: "chapter-1", ...data };
      },
    },
  });
  prisma.storyPlan.findUnique = async () => ({
    id: "plan-1",
    novelId: "novel-1",
    chapterId: "chapter-1",
    level: "chapter",
    title: "第1章计划",
    objective: "推进主线冲突并建立章节悬念",
    participantsJson: JSON.stringify(["主角", "对手"]),
    revealsJson: JSON.stringify(["关键线索"]),
    riskNotesJson: JSON.stringify(["不要提前泄底"]),
    mustAdvanceJson: JSON.stringify(["推动冲突升级"]),
    mustPreserveJson: JSON.stringify(["保留主角求生动机"]),
    sourceIssueIdsJson: JSON.stringify([]),
    replannedFromPlanId: null,
    hookTarget: "结尾抛出更大的风险",
    status: "draft",
    externalRef: null,
    rawPlanJson: JSON.stringify({ ok: true }),
    createdAt: new Date(),
    updatedAt: new Date(),
    scenes: [{
      id: "scene-1",
      planId: "plan-1",
      sortOrder: 1,
      title: "初次交锋",
      objective: "把主角逼进选择",
      conflict: "双方试探并施压",
      reveal: "线索第一次露面",
      emotionBeat: "压迫感上升",
      createdAt: new Date(),
      updatedAt: new Date(),
    }],
  });

  try {
    const persisted = await persistStoryPlan({
      novelId: "novel-1",
      chapterId: "chapter-1",
      level: "chapter",
      title: "第1章计划",
      objective: "推进主线冲突并建立章节悬念",
      participants: ["主角", "对手"],
      reveals: ["关键线索"],
      riskNotes: ["不要提前泄底"],
      mustAdvance: ["推动冲突升级"],
      mustPreserve: ["保留主角求生动机"],
      sourceIssueIds: [],
      replannedFromPlanId: null,
      hookTarget: "结尾抛出更大的风险",
      scenes: [{
        title: "初次交锋",
        objective: "把主角逼进选择",
        conflict: "双方试探并施压",
        reveal: "线索第一次露面",
        emotionBeat: "压迫感上升",
      }],
    });

    assert.equal(persisted.id, "plan-1");
    assert.equal(captured.persistedSceneRows.length, 1);
    assert.equal(captured.chapterUpdate.expectation, "推进主线冲突并建立章节悬念");
    assert.equal(captured.chapterUpdate.chapterStatus, "pending_generation");
    assert.match(captured.chapterUpdate.taskSheet, /章节目标：推进主线冲突并建立章节悬念/);
    assert.match(captured.chapterUpdate.taskSheet, /必须推进：/);
    assert.match(captured.chapterUpdate.taskSheet, /收尾钩子：结尾抛出更大的风险/);
    assert.match(captured.chapterUpdate.sceneCards, /场景1：初次交锋/);
    assert.match(captured.chapterUpdate.sceneCards, /冲突：双方试探并施压/);
    assert.equal(captured.chapterUpdate.hook, "结尾抛出更大的风险");
  } finally {
    prisma.storyPlan.findFirst = original.findFirst;
    prisma.storyPlan.findUnique = original.findUnique;
    prisma.$transaction = original.transaction;
  }
});

test("persistStoryPlan keeps chapter status unchanged when正文 already exists", async () => {
  const original = {
    findFirst: prisma.storyPlan.findFirst,
    findUnique: prisma.storyPlan.findUnique,
    transaction: prisma.$transaction,
  };
  let chapterUpdate = null;

  prisma.storyPlan.findFirst = async () => null;
  prisma.$transaction = async (callback) => callback({
    storyPlan: {
      create: async () => ({ id: "plan-2" }),
    },
    chapterPlanScene: {
      deleteMany: async () => undefined,
      createMany: async () => undefined,
    },
    chapter: {
      findUnique: async () => ({
        content: "已有正文",
        chapterStatus: "pending_review",
      }),
      update: async ({ data }) => {
        chapterUpdate = data;
        return { id: "chapter-2", ...data };
      },
    },
  });
  prisma.storyPlan.findUnique = async () => ({
    id: "plan-2",
    novelId: "novel-1",
    chapterId: "chapter-2",
    level: "chapter",
    title: "第2章计划",
    objective: "调整后续冲突节奏",
    participantsJson: JSON.stringify([]),
    revealsJson: JSON.stringify([]),
    riskNotesJson: JSON.stringify([]),
    mustAdvanceJson: JSON.stringify([]),
    mustPreserveJson: JSON.stringify([]),
    sourceIssueIdsJson: JSON.stringify([]),
    replannedFromPlanId: null,
    hookTarget: null,
    status: "draft",
    externalRef: null,
    rawPlanJson: JSON.stringify({ ok: true }),
    createdAt: new Date(),
    updatedAt: new Date(),
    scenes: [],
  });

  try {
    await persistStoryPlan({
      novelId: "novel-1",
      chapterId: "chapter-2",
      level: "chapter",
      title: "第2章计划",
      objective: "调整后续冲突节奏",
      participants: [],
      reveals: [],
      riskNotes: [],
      mustAdvance: [],
      mustPreserve: [],
      sourceIssueIds: [],
      replannedFromPlanId: null,
      hookTarget: null,
      scenes: [],
    });

    assert.equal(chapterUpdate.expectation, "调整后续冲突节奏");
    assert.equal("chapterStatus" in chapterUpdate, true);
    assert.equal(chapterUpdate.chapterStatus, undefined);
  } finally {
    prisma.storyPlan.findFirst = original.findFirst;
    prisma.storyPlan.findUnique = original.findUnique;
    prisma.$transaction = original.transaction;
  }
});
