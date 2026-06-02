const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildCharacterCastContextBlocks,
  buildSupplementalCharacterContextBlocks,
} = require("../dist/prompting/prompts/novel/characterPreparation.contextBlocks.js");

test("character cast context includes world focus hints", () => {
  const blocks = buildCharacterCastContextBlocks({
    projectTitle: "星核边境",
    storyInput: "边境少年卷入星核配额争夺。",
    worldStage: "活跃势力：星皇朝廷、天机阁",
    worldFocusHints: {
      preferFaction: "天机阁",
      forceCompliance: true,
    },
  });
  const worldBlock = blocks.find((block) => block.id === "character_cast_world_stage");
  assert.ok(worldBlock);
  assert.match(worldBlock.content, /天机阁/);
  assert.match(worldBlock.content, /必须进行世界规则合规检查/);
});

test("supplemental character context includes world focus hints", () => {
  const blocks = buildSupplementalCharacterContextBlocks({
    projectTitle: "星核边境",
    modeLabel: "auto",
    targetRoleLabel: "auto",
    requestedCountText: "生成 1 个候选角色。",
    worldStage: "本书舞台：北境冰原",
    worldFocusHints: {
      forceCompliance: true,
    },
  });
  const worldBlock = blocks.find((block) => block.id === "supplemental_character_world_stage");
  assert.ok(worldBlock);
  assert.match(worldBlock.content, /北境冰原/);
  assert.match(worldBlock.content, /身份、能力来源、阵营归属、地点和禁忌搭配/);
});
