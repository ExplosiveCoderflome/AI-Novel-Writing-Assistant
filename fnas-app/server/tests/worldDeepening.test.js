const test = require("node:test");
const assert = require("node:assert/strict");
const { WorldService } = require("../dist/services/world/WorldService.js");
const { prisma } = require("../dist/db/prisma.js");

test("answerDeepeningQuestions normalizes legacy targetField aliases before world update", async () => {
  const service = new WorldService();
  service.createSnapshot = async () => ({ id: "snapshot-1" });
  service.queueRagUpsert = () => {};

  const world = {
    id: "world-1",
    name: "测试世界",
    description: null,
    worldType: "history",
    templateKey: "custom",
    axioms: null,
    background: "既有背景",
    geography: null,
    cultures: null,
    magicSystem: null,
    politics: null,
    races: null,
    religions: null,
    technology: null,
    conflicts: "既有冲突",
    history: null,
    economy: null,
    factions: null,
    status: "draft",
    version: 1,
    selectedDimensions: null,
    selectedElements: null,
    layerStates: null,
    consistencyReport: null,
    overviewSummary: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const questions = [
    {
      id: "q1",
      worldId: "world-1",
      priority: "required",
      question: "您希望扮演的角色身份是什么？",
      targetLayer: "foundation",
      targetField: "角色定位",
      answer: null,
      integratedSummary: null,
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "q2",
      worldId: "world-1",
      priority: "required",
      question: "当前故事起始地点与时间？",
      targetLayer: "foundation",
      targetField: "时间地点",
      answer: null,
      integratedSummary: null,
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "q3",
      worldId: "world-1",
      priority: "recommended",
      question: "您面临的首要冲突类型？",
      targetLayer: "conflict",
      targetField: "核心冲突",
      answer: null,
      integratedSummary: null,
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  const original = {
    worldFindUnique: prisma.world.findUnique,
    worldUpdate: prisma.world.update,
    worldDeepeningFindMany: prisma.worldDeepeningQA.findMany,
    worldDeepeningUpdate: prisma.worldDeepeningQA.update,
    transaction: prisma.$transaction,
  };

  const qaUpdates = [];
  const worldUpdates = [];

  prisma.world.findUnique = async () => world;
  prisma.worldDeepeningQA.findMany = async () => questions;
  prisma.worldDeepeningQA.update = async (input) => {
    qaUpdates.push(input);
    return input;
  };
  prisma.world.update = async (input) => {
    worldUpdates.push(input);
    return { ...world, ...input.data };
  };
  prisma.$transaction = async (callback) => callback({
    worldDeepeningQA: {
      update: prisma.worldDeepeningQA.update,
    },
    world: {
      update: prisma.world.update,
    },
  });

  try {
    const result = await service.answerDeepeningQuestions("world-1", [
      { questionId: "q1", answer: "沦陷区地下抗日者" },
      { questionId: "q2", answer: "1937年卢沟桥附近" },
      { questionId: "q3", answer: "日军围剿与情报战" },
    ]);

    assert.equal(result.length, 3);
    assert.equal(qaUpdates.length, 3);
    assert.equal(qaUpdates[0].data.targetField, "background");
    assert.equal(qaUpdates[1].data.targetField, "background");
    assert.equal(qaUpdates[2].data.targetField, "conflicts");

    assert.equal(worldUpdates.length, 1);
    assert.deepEqual(worldUpdates[0], {
      where: { id: "world-1" },
      data: {
        background: [
          "既有背景",
          "Q: 您希望扮演的角色身份是什么？\nA: 沦陷区地下抗日者",
          "Q: 当前故事起始地点与时间？\nA: 1937年卢沟桥附近",
        ].join("\n\n"),
        conflicts: [
          "既有冲突",
          "Q: 您面临的首要冲突类型？\nA: 日军围剿与情报战",
        ].join("\n\n"),
      },
    });
  } finally {
    prisma.world.findUnique = original.worldFindUnique;
    prisma.world.update = original.worldUpdate;
    prisma.worldDeepeningQA.findMany = original.worldDeepeningFindMany;
    prisma.worldDeepeningQA.update = original.worldDeepeningUpdate;
    prisma.$transaction = original.transaction;
  }
});
