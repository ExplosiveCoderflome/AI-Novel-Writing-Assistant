const test = require("node:test");
const assert = require("node:assert/strict");
const { prisma } = require("../dist/db/prisma.js");
const {
  DIRECTOR_BLUEPRINT_TRANSACTION_TIMEOUT_MS,
  persistDirectorBlueprint,
} = require("../dist/services/novel/director/novelDirectorPersistence.js");

test("persistDirectorBlueprint uses an explicit timeout for bulk story plan writes", async () => {
  const originalTransaction = prisma.$transaction;
  let receivedOptions = null;
  const calls = [];

  prisma.$transaction = async (callback, options) => {
    receivedOptions = options;
    return callback({
      storyPlan: {
        create: async ({ data }) => {
          calls.push(["storyPlan.create", data.level]);
          return {
            id: `plan-${calls.length}`,
            ...data,
            scenes: [],
          };
        },
        findUniqueOrThrow: async ({ where }) => ({
          id: where.id,
          scenes: [],
        }),
      },
      chapter: {
        create: async ({ data }) => {
          calls.push(["chapter.create", data.order]);
          return { id: `chapter-${data.order}` };
        },
      },
      chapterPlanScene: {
        createMany: async ({ data }) => {
          calls.push(["chapterPlanScene.createMany", data.length]);
        },
      },
      novel: {
        update: async ({ data }) => {
          calls.push(["novel.update", data.projectStatus]);
        },
      },
    });
  };

  try {
    await persistDirectorBlueprint("novel-1", {
      bookPlan: {
        title: "全书计划",
        objective: "完成整本故事",
        participants: ["主角"],
        reveals: [],
        riskNotes: [],
        hookTarget: null,
      },
      arcs: [{
        title: "第一幕",
        summary: "建立主线",
        objective: "让主角进入冲突",
        participants: ["主角"],
        reveals: [],
        riskNotes: [],
        hookTarget: null,
        phaseLabel: "开局",
        chapters: [{
          title: "第一章",
          expectation: "进入事件",
          objective: "启动冲突",
          participants: ["主角"],
          reveals: [],
          riskNotes: [],
          mustAdvance: ["启动冲突"],
          mustPreserve: ["保持动机"],
          hookTarget: null,
          planRole: "setup",
          scenes: [],
        }],
      }],
    });

    assert.ok(receivedOptions);
    assert.equal(receivedOptions.timeout, DIRECTOR_BLUEPRINT_TRANSACTION_TIMEOUT_MS);
    assert.ok(receivedOptions.timeout > 5000);
    assert.deepEqual(calls.map((item) => item[0]), [
      "storyPlan.create",
      "storyPlan.create",
      "chapter.create",
      "storyPlan.create",
      "novel.update",
    ]);
  } finally {
    prisma.$transaction = originalTransaction;
  }
});
