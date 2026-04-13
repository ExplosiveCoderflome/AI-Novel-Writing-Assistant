const test = require("node:test");
const assert = require("node:assert/strict");

const { resolveChapterPlanParticipants } = require("../dist/services/planner/plannerParticipantResolution.js");

function createCharacters() {
  return [
    {
      id: "char-extra",
      name: "路人甲",
      role: "配角",
      currentGoal: null,
      currentState: null,
    },
    {
      id: "char-main",
      name: "林焰",
      role: "主角",
      currentGoal: "抢回主动权",
      currentState: "被压制",
    },
    {
      id: "char-female",
      name: "苏雨",
      role: "女主",
      currentGoal: "补足情报链",
      currentState: "保持观望",
    },
    {
      id: "char-side",
      name: "周衡",
      role: "盟友",
      currentGoal: null,
      currentState: null,
    },
  ];
}

function createOverview() {
  return {
    novelId: "novel-1",
    currentVolume: {
      id: "volume-1",
      title: "第一卷",
      sortOrder: 1,
      startChapterOrder: 1,
      endChapterOrder: 20,
      currentChapterOrder: 5,
    },
    summary: "第一卷需要完成第一次反压，同时把情报链角色拉回台前。",
    pendingCandidateCount: 1,
    characters: [
      {
        characterId: "char-main",
        name: "林焰",
        role: "主角",
        castRole: "主角位",
        currentState: "被压制",
        currentGoal: "抢回主动权",
        volumeRoleLabel: "破局者",
        volumeResponsibility: "完成第一次反压",
        isCoreInVolume: true,
        plannedChapterOrders: [5, 6],
        appearanceCount: 3,
        lastAppearanceChapterOrder: 4,
        absenceSpan: 1,
        absenceRisk: "none",
        factionLabel: "主角阵营",
        stanceLabel: "进攻",
      },
      {
        characterId: "char-female",
        name: "苏雨",
        role: "女主",
        castRole: "情报位",
        currentState: "保持观望",
        currentGoal: "补足情报链",
        volumeRoleLabel: "暗线持钥者",
        volumeResponsibility: "补足情报链",
        isCoreInVolume: true,
        plannedChapterOrders: [5],
        appearanceCount: 1,
        lastAppearanceChapterOrder: 1,
        absenceSpan: 4,
        absenceRisk: "high",
        factionLabel: "主角阵营",
        stanceLabel: "试探合作",
      },
      {
        characterId: "char-side",
        name: "周衡",
        role: "盟友",
        castRole: "观察位",
        currentState: null,
        currentGoal: null,
        volumeRoleLabel: "承压盟友",
        volumeResponsibility: "提供外部压力信息",
        isCoreInVolume: false,
        plannedChapterOrders: [7],
        appearanceCount: 2,
        lastAppearanceChapterOrder: 4,
        absenceSpan: 1,
        absenceRisk: "info",
        factionLabel: "主角阵营",
        stanceLabel: "观望",
      },
    ],
    relations: [
      {
        id: "relation-stage-1",
        novelId: "novel-1",
        relationId: "relation-1",
        sourceCharacterId: "char-main",
        targetCharacterId: "char-female",
        sourceCharacterName: "林焰",
        targetCharacterName: "苏雨",
        volumeId: "volume-1",
        volumeTitle: "第一卷",
        chapterId: null,
        chapterOrder: 5,
        stageLabel: "互试探合作",
        stageSummary: "双方仍在试探底线",
        nextTurnPoint: "交换关键情报",
        sourceType: "planner",
        confidence: 0.8,
        isCurrent: true,
        createdAt: "2026-04-02T00:00:00.000Z",
        updatedAt: "2026-04-02T00:00:00.000Z",
      },
    ],
    candidates: [
      {
        id: "candidate-1",
        novelId: "novel-1",
        sourceChapterId: null,
        sourceChapterOrder: 4,
        proposedName: "林策",
        proposedRole: "情报商",
        summary: "待确认候选",
        evidence: ["第4章提到过这个名字"],
        matchedCharacterId: null,
        status: "pending",
        confidence: 0.62,
        createdAt: "2026-04-02T00:00:00.000Z",
        updatedAt: "2026-04-02T00:00:00.000Z",
      },
    ],
    factionTracks: [],
    assignments: [],
  };
}

test("planner participant resolver augments AI output with high-priority dynamic roles", () => {
  const participants = resolveChapterPlanParticipants({
    outputParticipants: ["林焰"],
    characters: createCharacters(),
    characterDynamicsOverview: createOverview(),
    chapterOrder: 5,
  });

  assert.deepEqual(participants.slice(0, 2), ["林焰", "苏雨"]);
});

test("planner participant resolver blocks pending candidate names from entering the plan", () => {
  const participants = resolveChapterPlanParticipants({
    outputParticipants: ["林策", "林焰"],
    characters: createCharacters(),
    characterDynamicsOverview: createOverview(),
    chapterOrder: 5,
  });

  assert.ok(!participants.includes("林策"));
  assert.ok(participants.includes("林焰"));
  assert.ok(participants.includes("苏雨"));
});

test("planner participant resolver falls back to dynamic core roles instead of raw roster order", () => {
  const participants = resolveChapterPlanParticipants({
    outputParticipants: [],
    characters: createCharacters(),
    characterDynamicsOverview: createOverview(),
    chapterOrder: 5,
  });

  assert.deepEqual(participants.slice(0, 2), ["苏雨", "林焰"]);
  assert.ok(!participants.slice(0, 2).includes("路人甲"));
});
