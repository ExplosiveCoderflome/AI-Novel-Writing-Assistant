const test = require("node:test");
const assert = require("node:assert/strict");
const { buildStatus } = require("../dist/services/novel/NovelSetupStatusService.js");

function buildNovel(overrides = {}) {
  return {
    id: "novel-setup-world",
    title: "星核边境",
    description: "边境少年在星核枯竭的帝国中寻找失踪父亲，同时卷入朝廷与地下势力争夺。",
    projectMode: "ai_led",
    narrativePov: "third_person",
    pacePreference: "balanced",
    styleTone: "热血悬疑",
    emotionIntensity: "medium",
    aiFreedom: "medium",
    primaryStoryMode: { name: "升级冒险" },
    secondaryStoryMode: { name: "权谋悬疑" },
    defaultChapterLength: 2500,
    outline: null,
    structuredOutline: null,
    genre: { name: "玄幻" },
    world: null,
    novelWorld: null,
    bible: {
      coreSetting: null,
      forbiddenRules: null,
      mainPromise: "主角要揭开星核枯竭真相，并夺回边境生存权。",
      characterArcs: null,
      worldRules: null,
    },
    _count: {
      characters: 0,
      chapters: 0,
    },
    ...overrides,
  };
}

test("setup status treats NovelWorld as the active world source", () => {
  const status = buildStatus(buildNovel({
    novelWorld: {
      title: "紫霞界",
      coverSummary: "星核枯竭的边境帝国，力量、身份和资源都要付出代价。",
      sourceType: "generated",
      sourceWorldId: null,
      storySliceJson: null,
      structuredDataJson: JSON.stringify({
        profile: {
          identity: "紫霞界",
          summary: "星核枯竭的边境帝国。",
          tone: "黑暗热血",
        },
        rules: {
          summary: "魔力来自星核，透支会损伤寿命。",
          axioms: [{
            id: "rule-star-core",
            name: "星核代价",
            summary: "力量不能无代价升级。",
          }],
          taboo: [],
          sharedConsequences: [],
        },
        factions: [],
        forces: [],
        locations: [],
      }),
    },
  }));

  const byKey = Object.fromEntries(status.checklist.map((item) => [item.key, item]));
  assert.equal(byKey.world.status, "ready");
  assert.equal(byKey.world_rules.status, "ready");
  assert.match(byKey.world.currentValue, /紫霞界/);
  assert.match(byKey.world_rules.currentValue, /魔力来自星核/);
});

test("setup status treats Bible world rules as notes instead of ready NovelWorld rules", () => {
  const status = buildStatus(buildNovel({
    bible: {
      coreSetting: "边境帝国依赖星核矿脉维持秩序。",
      forbiddenRules: "不能无代价复活。",
      mainPromise: "主角要揭开星核枯竭真相，并夺回边境生存权。",
      characterArcs: null,
      worldRules: "星核力量会透支寿命。",
    },
  }));

  const byKey = Object.fromEntries(status.checklist.map((item) => [item.key, item]));
  assert.equal(byKey.world.status, "partial");
  assert.equal(byKey.world_rules.status, "partial");
  assert.match(byKey.world_rules.summary, /整理进本书世界手册/);
  assert.match(byKey.world_rules.currentValue, /星核力量/);
});
