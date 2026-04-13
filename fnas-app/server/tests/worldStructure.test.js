const test = require("node:test");
const assert = require("node:assert/strict");
const {
  applyStructuredWorldToLegacyFields,
  buildStructuredRulesFromAxiomTexts,
  buildWorldBindingSupport,
  buildWorldStructureSeedFromSource,
  normalizeWorldStructuredData,
  parseWorldStructurePayload,
} = require("../dist/services/world/worldStructure.js");

function createSource(overrides = {}) {
  return {
    id: "world-structure-1",
    name: "钢潮边境",
    worldType: "dieselpunk",
    description: "一个被多方势力撕扯的边境世界。",
    overviewSummary: null,
    axioms: null,
    background: null,
    geography: null,
    cultures: null,
    magicSystem: null,
    politics: null,
    races: null,
    religions: null,
    technology: null,
    conflicts: null,
    history: null,
    economy: null,
    factions: null,
    selectedElements: null,
    structureJson: null,
    bindingSupportJson: null,
    structureSchemaVersion: 1,
    ...overrides,
  };
}

test("buildWorldStructureSeedFromSource maps organization and terrain blueprint items", () => {
  const structure = buildWorldStructureSeedFromSource(createSource({
    selectedElements: JSON.stringify({
      version: 1,
      classicElements: ["王权更替"],
      propertySelections: [
        {
          optionId: "org-1",
          name: "黑潮议会",
          description: "控制地下航运网络的组织。",
          targetLayer: "society",
          source: "library",
          libraryItemId: "lib-org-1",
          sourceCategory: "organization",
        },
        {
          optionId: "terrain-1",
          name: "裂谷海岸",
          description: "常年浓雾与暗礁并存的海岸带。",
          targetLayer: "foundation",
          source: "library",
          libraryItemId: "lib-terrain-1",
          sourceCategory: "terrain",
        },
      ],
    }),
  }));

  assert.ok(structure.profile.themes.includes("王权更替"));
  assert.ok(structure.factions.some((item) => item.name === "黑潮议会"));
  assert.ok(structure.forces.some((item) => item.name === "黑潮议会"));
  assert.ok(structure.locations.some((item) => item.name === "裂谷海岸"));
});

test("buildWorldStructureSeedFromSource keeps selected reference seeds and trims invalid links", () => {
  const structure = buildWorldStructureSeedFromSource(createSource({
    selectedElements: JSON.stringify({
      version: 1,
      classicElements: [],
      propertySelections: [],
      referenceContext: {
        mode: "adapt_world",
        preserveElements: ["现实都市基底"],
        allowedChanges: ["势力网络"],
        forbiddenElements: ["不要超凡化"],
        anchors: [],
        referenceSeeds: {
          rules: [
            {
              id: "reference-rule-1",
              name: "现实突破必须付出代价",
              summary: "任何越级突破都会留下可追溯的社会代价。",
            },
          ],
          factions: [
            {
              id: "reference-faction-1",
              name: "求稳秩序派",
              position: "优先维持现实生活表层稳定",
              doctrine: "一切改造都不能破坏现实外壳。",
              goals: ["压住失控冲突"],
              methods: ["制度化约束"],
              representativeForceIds: ["reference-force-1", "reference-force-2"],
            },
          ],
          forces: [
            {
              id: "reference-force-1",
              name: "乐圣公司",
              type: "company",
              factionId: "reference-faction-1",
              summary: "可直接沿用的商业势力。",
              baseOfPower: "品牌与渠道",
              currentObjective: "扩大城市商业影响力",
              pressure: "资金链与人脉博弈并存",
              leader: "丁元英",
              narrativeRole: "高位牵引者",
            },
            {
              id: "reference-force-2",
              name: "未被选中的旧势力",
              type: "network",
              factionId: "reference-faction-1",
              summary: "这条用于验证未选中时不会被错误挂上。",
            },
          ],
          locations: [
            {
              id: "reference-location-1",
              name: "古城老街",
              terrain: "城市街区",
              summary: "承接现实生活与商业往来的核心地点。",
              narrativeFunction: "日常关系交汇点",
              risk: "一旦曝光会引发舆论压力",
              entryConstraint: "必须通过熟人介绍进入圈子",
              exitCost: "退出后会失去主要资源入口",
              controllingForceIds: ["reference-force-1", "reference-force-2"],
            },
          ],
        },
        selectedSeedIds: {
          ruleIds: ["reference-rule-1"],
          factionIds: ["reference-faction-1"],
          forceIds: ["reference-force-1"],
          locationIds: ["reference-location-1"],
        },
      },
    }),
  }));

  const inheritedRule = structure.rules.axioms.find((item) => item.name === "现实突破必须付出代价");
  const inheritedFaction = structure.factions.find((item) => item.name === "求稳秩序派");
  const inheritedForce = structure.forces.find((item) => item.name === "乐圣公司");
  const inheritedLocation = structure.locations.find((item) => item.name === "古城老街");

  assert.ok(inheritedRule);
  assert.ok(inheritedFaction);
  assert.ok(inheritedForce);
  assert.ok(inheritedLocation);
  assert.deepEqual(inheritedFaction.representativeForceIds, ["reference-force-1"]);
  assert.deepEqual(inheritedLocation.controllingForceIds, ["reference-force-1"]);
  assert.equal(inheritedForce.factionId, "reference-faction-1");
  assert.equal(structure.metadata.seededFrom, "wizard-blueprint");
});

test("applyStructuredWorldToLegacyFields syncs structured world into legacy text fields", () => {
  const structure = normalizeWorldStructuredData({
    profile: {
      summary: "旧帝国边境在停战后滑向新的冷战。",
      identity: "柴油朋克边境世界",
      tone: "压抑而锋利",
      themes: ["旧秩序崩塌", "边境交易"],
      coreConflict: "黑潮议会与铁卫边防军争夺裂谷海岸的控制权。",
    },
    rules: {
      summary: "蒸汽核心只能在边境矿脉附近稳定运转。",
      axioms: [
        {
          id: "rule-1",
          name: "蒸汽核心受矿脉约束",
          summary: "离开边境矿脉越远，装置越容易失控。",
          cost: "维护成本极高",
          boundary: "无法远距离跨区运转",
          enforcement: "超载会引发区域停摆",
        },
      ],
      taboo: ["禁止私运高阶蒸汽核心"],
      sharedConsequences: ["任何跨区军运都会抬高边境紧张度"],
    },
    factions: [
      {
        id: "faction-1",
        name: "铁卫联盟",
        position: "维护停战线",
        doctrine: "以秩序压住边境流血",
        goals: ["封锁黑市"],
        methods: ["重兵驻守"],
        representativeForceIds: ["force-1"],
      },
    ],
    forces: [
      {
        id: "force-1",
        name: "铁卫边防军",
        type: "organization",
        factionId: "faction-1",
        summary: "掌控停战线检查站的武装力量。",
        baseOfPower: "边境军港",
        currentObjective: "清理私运航道",
        pressure: "边境补给持续紧张",
        leader: "严洛",
        narrativeRole: "高压守线者",
      },
      {
        id: "force-2",
        name: "黑潮议会",
        type: "organization",
        factionId: null,
        summary: "在暗港经营军火与情报买卖。",
        baseOfPower: "地下航运网络",
        currentObjective: "夺回裂谷海岸暗港",
        pressure: "铁卫封锁线步步收紧",
        leader: "雾港主事人",
        narrativeRole: "黑市挑动者",
      },
    ],
    locations: [
      {
        id: "location-1",
        name: "裂谷海岸",
        terrain: "迷雾海岸",
        summary: "走私与伏击最频繁的海岸线。",
        narrativeFunction: "冲突引爆点",
        risk: "海雾与暗礁让追击极易失控",
        entryConstraint: "必须通过废弃灯塔暗号进入",
        exitCost: "一旦暴露航线就要放弃整条补给链",
        controllingForceIds: ["force-2"],
      },
    ],
    relations: {
      forceRelations: [
        {
          id: "force-relation-1",
          sourceForceId: "force-1",
          targetForceId: "force-2",
          relation: "对抗",
          tension: "停战线随时可能再度开火",
          detail: "双方都把裂谷海岸视作下一轮布局的钥匙。",
        },
      ],
      locationControls: [
        {
          id: "location-control-1",
          forceId: "force-2",
          locationId: "location-1",
          relation: "控制",
          detail: "依靠暗港和雇佣船队维持地面影响力。",
        },
      ],
    },
    metadata: {
      schemaVersion: 1,
      seededFrom: "test",
    },
  });

  const bindingSupport = buildWorldBindingSupport(structure);
  const mapped = applyStructuredWorldToLegacyFields(structure, {}, bindingSupport);
  const parsed = parseWorldStructurePayload(mapped.structureJson, mapped.bindingSupportJson);

  assert.equal(mapped.description, "旧帝国边境在停战后滑向新的冷战。");
  assert.match(mapped.axioms ?? "", /蒸汽核心受矿脉约束/);
  assert.match(mapped.factions ?? "", /铁卫边防军/);
  assert.match(mapped.factions ?? "", /手段：重兵驻守/);
  assert.match(mapped.politics ?? "", /黑潮议会/);
  assert.match(mapped.politics ?? "", /施压方式：铁卫封锁线步步收紧/);
  assert.match(mapped.geography ?? "", /裂谷海岸/);
  assert.match(mapped.conflicts ?? "", /对抗/);
  assert.equal(parsed.hasStructuredData, true);
  assert.equal(parsed.structure.locations[0].name, "裂谷海岸");
  assert.ok(parsed.bindingSupport.highPressureForces.some((item) => item.includes("铁卫边防军")));
});

test("buildStructuredRulesFromAxiomTexts turns plain texts into structured rules", () => {
  const rules = buildStructuredRulesFromAxiomTexts([
    "现实突破必须付出代价：任何越级突破都会留下社会账本",
    "现实突破必须付出代价：重复输入会被去重",
    "人脉网络不能脱离现实资源",
  ]);

  assert.equal(rules.length, 2);
  assert.equal(rules[0].name, "现实突破必须付出代价");
  assert.match(rules[0].summary, /任何越级突破都会留下社会账本/);
  assert.equal(rules[1].name, "规则 3");
  assert.equal(rules[1].summary, "人脉网络不能脱离现实资源");
});

test("normalizeWorldStructuredData fills missing sections for partial payloads", () => {
  const structure = normalizeWorldStructuredData({
    profile: {
      summary: "只有一个极简概要。",
    },
  });

  assert.equal(structure.profile.summary, "只有一个极简概要。");
  assert.deepEqual(structure.rules.axioms, []);
  assert.deepEqual(structure.factions, []);
  assert.deepEqual(structure.forces, []);
  assert.deepEqual(structure.locations, []);
  assert.deepEqual(structure.relations.forceRelations, []);
});
