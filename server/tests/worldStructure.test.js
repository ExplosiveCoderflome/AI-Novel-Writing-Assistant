const test = require("node:test");
const assert = require("node:assert/strict");
const {
  applyStructuredWorldToLegacyFields,
  buildStructuredRulesFromAxiomTexts,
  buildWorldBindingSupport,
  buildWorldStructureFromLegacySource,
  buildWorldStructureSeedFromSource,
  normalizeWorldStructuredData,
  parseWorldStructurePayload,
} = require("../dist/services/world/worldStructure.js");
const {
  mergeWorldStructureSection,
} = require("../dist/services/world/worldServiceShared.js");

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

test("buildWorldStructureFromLegacySource projects generated json legacy fields into handbook structure", () => {
  const structure = buildWorldStructureFromLegacySource(createSource({
    name: "旧日",
    worldType: "克苏鲁神话 / 科幻克苏鲁",
    description: "现代世界表面正常，旧日入侵和神话势力在暗处维持脆弱平衡。",
    axioms: JSON.stringify([
      "规则 1：直接接触旧日存在会造成不可逆理智侵蚀。",
    ]),
    geography: "全球地理格局基本与现实一致，但存在若干关键异常区域：太平洋深处某处被列为国际禁航区，传言是克苏鲁异界入口；北极冰盖下隐藏着一个多国联合的秘密研究基地，用于监控和抑制冰封的旧日支配者；中国西南的昆仑山脉深处有上古结界，内有通往神话领域的通道；欧洲阿尔卑斯山区的某座古堡实为秘密组织的指挥中心。",
    politics: JSON.stringify({
      governance: "最高协调机构为三方联合委员会，设于北极基地。",
    }),
    factions: JSON.stringify([
      {
        name: "守夜人议会",
        description: "全球最大秘密组织，负责监控和遏制克苏鲁入侵，维护信息封锁。",
      },
      {
        name: "万神殿协议",
        description: "由中西方神话势力代表组成的松散联盟。",
      },
      {
        name: "泰坦星团",
        description: "由全球顶尖科技公司和军方研究机构组成的非公开联合体。",
      },
    ]),
    conflicts: JSON.stringify({
      primaryConflicts: [
        {
          type: "三方势力制衡博弈",
          parties: ["守夜人议会", "泰坦星团"],
          description: "泰坦星团试图扩大克苏鲁能量工程化应用，引发守夜人议会警惕。",
        },
      ],
      flashpoints: [
        {
          name: "北极基地控制权暗战",
          location: "北极冰盖下的三方联合委员会总部",
          description: "三方围绕基地安保和污染责任互相指责。",
        },
      ],
    }),
  }));

  assert.ok(structure.forces.some((item) => item.name === "守夜人议会"));
  assert.ok(structure.forces.some((item) => item.name === "泰坦星团"));
  assert.ok(structure.locations.some((item) => item.name === "太平洋深海禁航区"));
  assert.ok(structure.locations.some((item) => item.name === "昆仑山神话通道"));
  assert.ok(structure.locations.some((item) => item.name === "北极冰盖下的三方联合委员会总部"));
  assert.ok(structure.relations.forceRelations.some((item) => item.relation === "三方势力制衡博弈"));
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

test("mergeWorldStructureSection accepts factions section object with factions and forces", () => {
  const current = normalizeWorldStructuredData({});
  const merged = mergeWorldStructureSection(current, "factions", {
    factions: [
      {
        id: "faction-1",
        name: "守夜人议会",
        position: "负责压制旧日污染",
        doctrine: "信息封锁优先于公众知情。",
        goals: ["维持封印"],
        methods: ["秘密清除"],
        representativeForceIds: ["force-1"],
      },
    ],
    forces: [
      {
        id: "force-1",
        name: "守夜人议会行动局",
        type: "organization",
        factionId: "faction-1",
        summary: "负责异常事件现场处置。",
        baseOfPower: "全球异常档案和特工网络",
        currentObjective: "封锁北极基地污染外泄",
        pressure: "公众目击视频正在扩散",
        leader: null,
        narrativeRole: "高压清场者",
      },
    ],
  });

  assert.equal(merged.factions.length, 1);
  assert.equal(merged.forces.length, 1);
  assert.equal(merged.forces[0].name, "守夜人议会行动局");
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

test("normalizeWorldStructuredData trims dangling faction and location links", () => {
  const structure = normalizeWorldStructuredData({
    factions: [
      {
        id: "faction-1",
        name: "安稳者阵营",
        position: "维持现实秩序",
        doctrine: "稳定优先",
        goals: ["维持家庭体面"],
        methods: ["相亲撮合"],
        representativeForceIds: ["force-1", "force-missing"],
      },
    ],
    forces: [
      {
        id: "force-1",
        name: "本地家庭共同体",
        type: "家庭共同体",
        summary: "以相亲和房产资源维持阶层优势。",
        controlledLocationIds: ["location-1", "location-missing"],
      },
    ],
    locations: [
      {
        id: "location-1",
        name: "江心公园",
        summary: "相亲角所在地。",
        controllingForceIds: ["force-1", "force-missing"],
      },
    ],
  });

  assert.deepEqual(structure.factions[0].representativeForceIds, ["force-1"]);
  assert.deepEqual(structure.forces[0].controlledLocationIds, ["location-1"]);
  assert.deepEqual(structure.locations[0].controllingForceIds, ["force-1"]);
});
