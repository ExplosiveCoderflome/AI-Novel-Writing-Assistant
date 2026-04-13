const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildWorldBlueprintPromptBlock,
} = require("../dist/services/world/worldGenerationBlueprint.js");

test("buildWorldBlueprintPromptBlock includes reference context and selected choice details", () => {
  const prompt = buildWorldBlueprintPromptBlock({
    selectedDimensions: JSON.stringify({
      foundation: true,
      society: true,
      conflict: true,
    }),
    selectedElements: JSON.stringify({
      version: 1,
      classicElements: [],
      propertySelections: [
        {
          optionId: "foundation-reality",
          name: "城市现实性保留程度",
          description: "决定这次架空改造保留多少现实都市质感。",
          targetLayer: "foundation",
          detail: "只允许在租住网络背后增加隐性规则。",
          choiceId: "hidden-rule",
          choiceLabel: "现实外壳下加入隐性规则",
          choiceSummary: "表面仍是现实都市，但行业与租住网络背后存在不公开的秩序。",
          source: "ai",
        },
      ],
      referenceContext: {
        mode: "adapt_world",
        preserveElements: ["现实都市基底", "成年人的情感拉扯"],
        allowedChanges: ["势力网络", "地点系统"],
        forbiddenElements: ["不要超凡化"],
        anchors: [
          {
            id: "anchor-1",
            label: "城市生活基底",
            content: "原作的现实都市生活感与租住场景必须保留。",
          },
        ],
        referenceSeeds: {
          rules: [
            {
              id: "rule-1",
              name: "城市关系要受现实代价约束",
              summary: "所有突破都必须付出可衡量的社会代价。",
            },
          ],
          factions: [
            {
              id: "faction-1",
              name: "现实求稳派",
              position: "优先维持现实生活秩序",
              doctrine: "不允许失真跳脱。",
            },
          ],
          forces: [
            {
              id: "force-1",
              name: "乐圣公司",
              type: "company",
              summary: "原作中可直接沿用的商业势力。",
            },
          ],
          locations: [
            {
              id: "location-1",
              name: "老城区出租屋",
              terrain: "城市居住区",
              summary: "承接主要日常互动的核心场景。",
            },
          ],
        },
        selectedSeedIds: {
          ruleIds: ["rule-1"],
          factionIds: ["faction-1"],
          forceIds: ["force-1"],
          locationIds: ["location-1"],
        },
      },
    }),
  });

  assert.match(prompt, /用户勾选的生成维度：基础层、社会层、冲突层/);
  assert.match(prompt, /选择方向：现实外壳下加入隐性规则/);
  assert.match(prompt, /只允许在租住网络背后增加隐性规则/);
  assert.match(prompt, /参考作品处理方式：基于原作做架空改造/);
  assert.match(prompt, /城市生活基底：原作的现实都市生活感与租住场景必须保留/);
  assert.match(prompt, /必须保留：现实都市基底、成年人的情感拉扯/);
  assert.match(prompt, /允许改造：势力网络、地点系统/);
  assert.match(prompt, /禁止偏离：不要超凡化/);
  assert.match(prompt, /直接沿用的原作规则：城市关系要受现实代价约束/);
  assert.match(prompt, /直接沿用的原作阵营：现实求稳派/);
  assert.match(prompt, /直接沿用的原作势力：乐圣公司/);
  assert.match(prompt, /直接沿用的原作地点：老城区出租屋/);
});
