const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createVolumeStrategySchema,
} = require("../dist/services/novel/volume/volumeGenerationSchemas.js");

function createValidStrategyPayload() {
  return {
    recommendedVolumeCount: 3,
    hardPlannedVolumeCount: 2,
    readerRewardLadder: "第一卷立钩，第二卷反压起势，第三卷中盘转向。",
    escalationLadder: "敌对压迫从局部围堵升级为公开追杀。",
    midpointShift: "第三卷暴露真正对手与更大局势。",
    notes: "先锁前两卷，第三卷只保留方向性承诺。",
    volumes: [
      {
        sortOrder: 1,
        planningMode: "hard",
        roleLabel: "开局立钩卷",
        coreReward: "快速建立主角困境与反击欲望。",
        escalationFocus: "压迫源第一次正面压制。",
        uncertaintyLevel: "low",
      },
      {
        sortOrder: 2,
        planningMode: "hard",
        roleLabel: "反压起势卷",
        coreReward: "主角第一次拿到阶段性主动权。",
        escalationFocus: "敌我资源与代价同步抬高。",
        uncertaintyLevel: "low",
      },
      {
        sortOrder: 3,
        planningMode: "soft",
        roleLabel: "中盘转向卷",
        coreReward: "揭露更大棋局并抬高后续期待。",
        escalationFocus: "局势从个人冲突升级到阵营冲突。",
        uncertaintyLevel: "medium",
      },
    ],
    uncertainties: [
      {
        targetType: "volume",
        targetRef: "3",
        level: "medium",
        reason: "第三卷依赖后续角色站队和世界规则补充。",
      },
    ],
  };
}

test("volume strategy schema accepts a structurally aligned strategy plan", () => {
  const schema = createVolumeStrategySchema(6);
  const parsed = schema.safeParse(createValidStrategyPayload());
  assert.equal(parsed.success, true);
});

test("volume strategy schema rejects mismatched volume count and ordering rules", () => {
  const schema = createVolumeStrategySchema(6);
  const payload = createValidStrategyPayload();
  payload.recommendedVolumeCount = 4;
  payload.volumes[1].sortOrder = 3;
  payload.volumes[2].planningMode = "hard";

  const parsed = schema.safeParse(payload);
  assert.equal(parsed.success, false);
  const messages = parsed.success ? [] : parsed.error.issues.map((issue) => issue.message);
  assert.ok(messages.some((message) => message.includes("volumes 数量必须与 recommendedVolumeCount 完全一致")));
  assert.ok(messages.some((message) => message.includes("sortOrder 必须按 1..N 连续递增")));
  assert.ok(messages.some((message) => message.includes("规划模式")));
});
