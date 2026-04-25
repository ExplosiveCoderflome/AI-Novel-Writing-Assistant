const test = require("node:test");
const assert = require("node:assert/strict");

const { prisma } = require("../dist/db/prisma.js");
const characterDynamicsLlm = require("../dist/services/novel/dynamics/characterDynamicsLlm.js");
const { CharacterDynamicsMutationService } = require("../dist/services/novel/dynamics/CharacterDynamicsMutationService.js");
const { collapseVolumeProjectionAssignments } = require("../dist/services/novel/dynamics/characterDynamicsUtils.js");

test("collapseVolumeProjectionAssignments merges duplicate character-volume rows", () => {
  const result = collapseVolumeProjectionAssignments([
    {
      characterName: "主角",
      volumeSortOrder: 1,
      roleLabel: "核心视角",
      responsibility: "接住卷首冲突",
      appearanceExpectation: null,
      plannedChapterOrders: [1, 3],
      isCore: true,
      absenceWarningThreshold: 3,
      absenceHighRiskThreshold: 5,
    },
    {
      characterName: " 主角 ",
      volumeSortOrder: 1,
      roleLabel: null,
      responsibility: "推动卷内主线升级",
      appearanceExpectation: "保持高频在场",
      plannedChapterOrders: [2, 3],
      isCore: false,
      absenceWarningThreshold: 4,
      absenceHighRiskThreshold: 6,
    },
    {
      characterName: "女二",
      volumeSortOrder: 1,
      roleLabel: "情报支点",
      responsibility: "补足情报链",
      appearanceExpectation: null,
      plannedChapterOrders: [4],
      isCore: false,
      absenceWarningThreshold: 3,
      absenceHighRiskThreshold: 5,
    },
  ]);

  assert.deepEqual(result, [
    {
      characterName: "主角",
      volumeSortOrder: 1,
      roleLabel: "核心视角",
      responsibility: "推动卷内主线升级",
      appearanceExpectation: "保持高频在场",
      plannedChapterOrders: [1, 2, 3],
      isCore: true,
      absenceWarningThreshold: 4,
      absenceHighRiskThreshold: 6,
    },
    {
      characterName: "女二",
      volumeSortOrder: 1,
      roleLabel: "情报支点",
      responsibility: "补足情报链",
      appearanceExpectation: null,
      plannedChapterOrders: [4],
      isCore: false,
      absenceWarningThreshold: 3,
      absenceHighRiskThreshold: 5,
    },
  ]);
});

test("CharacterDynamicsMutationService rebuildDynamics persists duplicate projection rows only once per character-volume pair", async () => {
  const originals = {
    novelFindUnique: prisma.novel.findUnique,
    relationStageFindMany: prisma.characterRelationStage.findMany,
    transaction: prisma.$transaction,
    generateVolumeProjection: characterDynamicsLlm.generateVolumeProjection,
  };

  const assignmentCreates = [];
  const overviewCalls = [];

  prisma.novel.findUnique = async () => ({
    id: "novel-1",
    title: "测试小说",
    description: "测试简介",
    targetAudience: "新手作者",
    bookSellingPoint: "角色冲突明确",
    first30ChapterPromise: "尽快建立人物关系张力",
    outline: "大纲",
    structuredOutline: "结构化大纲",
    characters: [
      {
        id: "character-1",
        name: "主角",
        role: "主角",
        castRole: "protagonist",
        relationToProtagonist: "self",
        storyFunction: "推进主线",
        currentGoal: "完成逆袭",
        currentState: "被压制",
      },
    ],
    characterRelations: [],
    characterCastOptions: [],
    volumePlans: [
      {
        id: "volume-1",
        sortOrder: 1,
        title: "第一卷",
        summary: "卷摘要",
        mainPromise: "建立压迫",
        escalationMode: "逐步升级",
        protagonistChange: "开始反击",
        climax: "第一次正面碰撞",
        nextVolumeHook: "更大危机",
        chapters: [
          { chapterOrder: 1, title: "第一章" },
          { chapterOrder: 2, title: "第二章" },
          { chapterOrder: 3, title: "第三章" },
        ],
      },
    ],
  });
  prisma.characterRelationStage.findMany = async () => [];
  prisma.$transaction = async (callback) => callback({
    characterVolumeAssignment: {
      deleteMany: async () => ({ count: 0 }),
      create: async (input) => {
        assignmentCreates.push(input);
        return input;
      },
    },
    characterFactionTrack: {
      deleteMany: async () => ({ count: 0 }),
      create: async (input) => input,
    },
    characterRelationStage: {
      deleteMany: async () => ({ count: 0 }),
      create: async (input) => input,
    },
  });
  characterDynamicsLlm.generateVolumeProjection = async () => ({
    assignments: [
      {
        characterName: "主角",
        volumeSortOrder: 1,
        roleLabel: "核心视角",
        responsibility: "接住卷首冲突",
        appearanceExpectation: null,
        plannedChapterOrders: [1, 3],
        isCore: true,
        absenceWarningThreshold: 3,
        absenceHighRiskThreshold: 5,
      },
      {
        characterName: " 主角 ",
        volumeSortOrder: 1,
        roleLabel: null,
        responsibility: "推动卷内主线升级",
        appearanceExpectation: "保持高频在场",
        plannedChapterOrders: [2, 3],
        isCore: false,
        absenceWarningThreshold: 4,
        absenceHighRiskThreshold: 6,
      },
    ],
    factionTracks: [],
    relationStages: [],
  });

  const service = new CharacterDynamicsMutationService({
    getOverview: async (novelId) => {
      overviewCalls.push(novelId);
      return { novelId, summary: "ok" };
    },
  });

  try {
    const result = await service.rebuildDynamics("novel-1", { sourceType: "rebuild_projection" });

    assert.deepEqual(result, { novelId: "novel-1", summary: "ok" });
    assert.deepEqual(overviewCalls, ["novel-1"]);
    assert.equal(assignmentCreates.length, 1);
    assert.deepEqual(assignmentCreates[0], {
      data: {
        novelId: "novel-1",
        characterId: "character-1",
        volumeId: "volume-1",
        roleLabel: "核心视角",
        responsibility: "推动卷内主线升级",
        appearanceExpectation: "保持高频在场",
        plannedChapterOrdersJson: JSON.stringify([1, 2, 3]),
        isCore: true,
        absenceWarningThreshold: 4,
        absenceHighRiskThreshold: 6,
      },
    });
  } finally {
    prisma.novel.findUnique = originals.novelFindUnique;
    prisma.characterRelationStage.findMany = originals.relationStageFindMany;
    prisma.$transaction = originals.transaction;
    characterDynamicsLlm.generateVolumeProjection = originals.generateVolumeProjection;
  }
});
