const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildStoryWorldSliceView,
  normalizeStoryWorldSlice,
  parseStoryWorldSliceOverrides,
  STORY_WORLD_SLICE_SCHEMA_VERSION,
} = require("../dist/services/novel/storyWorldSlice/storyWorldSlicePersistence.js");
const { buildWorldStructureFromLegacySource, buildWorldBindingSupport } = require("../dist/services/world/worldStructure.js");

function buildStructuredWorld() {
  return {
    profile: {
      summary: "现实都市下的商业和人际压力。",
      identity: "现实都市",
      tone: "克制压抑",
      themes: ["租房", "阶层压力"],
      coreConflict: "人在现实压力下如何守住关系与尊严",
    },
    rules: {
      summary: "世界遵循现实商业和社会规则。",
      axioms: [{
        id: "rule-reality",
        name: "现实规则优先",
        summary: "一切机会和冲突都必须能落回现实社会机制。",
        cost: "任何突破都要付出现实代价。",
        boundary: "不能靠超自然力量解决问题。",
        enforcement: "社会评价和资源分配会持续回收代价。",
      }],
      taboo: ["不要脱离现实基础"],
      sharedConsequences: ["错误决策会反噬角色关系"],
    },
    factions: [{
      id: "faction-market",
      name: "市场逐利派",
      position: "利益优先",
      doctrine: "先活下来再谈体面",
      goals: ["争夺稀缺资源"],
      methods: ["压价", "结盟"],
      representativeForceIds: ["force-lesheng"],
    }],
    forces: [{
      id: "force-lesheng",
      name: "乐圣公司",
      type: "company",
      factionId: "faction-market",
      summary: "控制关键商业资源的强势公司。",
      baseOfPower: "资本和渠道",
      currentObjective: "巩固市场优势",
      pressure: "用资源卡位和利益交换迫使角色让步。",
      leader: "林总",
      narrativeRole: "外部高压来源",
    }],
    locations: [{
      id: "location-office",
      name: "核心办公区",
      terrain: "city_office",
      summary: "商业竞争最直接的主舞台。",
      narrativeFunction: "承接职场冲突和资源交换。",
      risk: "人情与利益捆绑，失误会被放大。",
      entryConstraint: "必须有业务或关系入口",
      exitCost: "离开会失去机会和信息",
      controllingForceIds: ["force-lesheng"],
    }],
    relations: {
      forceRelations: [],
      locationControls: [],
    },
    metadata: {
      schemaVersion: 1,
      seededFrom: null,
      lastBackfilledAt: null,
      lastGeneratedAt: null,
      lastSectionGenerated: null,
    },
  };
}

test("normalizeStoryWorldSlice keeps required force/location/rule overrides", () => {
  const structure = buildStructuredWorld();
  const bindingSupport = buildWorldBindingSupport(structure);
  const slice = normalizeStoryWorldSlice({
    raw: {
      coreWorldFrame: "都市现实压力会不断压缩角色选择空间。",
      appliedRules: [],
      activeForces: [],
      activeLocations: [],
      activeElements: [],
      conflictCandidates: ["利益交换导致关系撕裂"],
      pressureSources: [],
      mysterySources: [],
      suggestedStoryAxes: ["现实情感"],
      recommendedEntryPoints: [],
      forbiddenCombinations: [],
      storyScopeBoundary: "保留现实职场压力，不要转玄幻。",
    },
    storyId: "novel-1",
    worldId: "world-1",
    sourceWorldUpdatedAt: "2026-03-20T00:00:00.000Z",
    storyInputDigest: "digest-1",
    builtFromStructuredData: true,
    builderMode: "outline",
    structure,
    bindingSupport,
    overrides: {
      primaryLocationId: "location-office",
      requiredForceIds: ["force-lesheng"],
      requiredLocationIds: ["location-office"],
      requiredRuleIds: ["rule-reality"],
      scopeNote: "保留现实职场压力，不要转玄幻。",
    },
  });

  assert.equal(slice.metadata.schemaVersion, STORY_WORLD_SLICE_SCHEMA_VERSION);
  assert.equal(slice.activeForces[0].id, "force-lesheng");
  assert.equal(slice.activeLocations[0].id, "location-office");
  assert.equal(slice.appliedRules[0].id, "rule-reality");
  assert.match(slice.storyScopeBoundary, /保留现实职场压力/);
});

test("legacy world can build structure fallback for story slice inputs", () => {
  const structure = buildWorldStructureFromLegacySource({
    id: "world-legacy",
    name: "旧版现实都市",
    worldType: "现实都市",
    description: "围绕商业、租房和情感拉扯展开。",
    overviewSummary: "现实都市中的情感与资源博弈。",
    axioms: JSON.stringify(["所有冲突都必须落回现实规则"]),
    geography: "城市办公区、出租屋和商业街区。",
    factions: "乐圣公司、周边商业圈和租房链条互相牵制。",
    politics: "资源决定话语权。",
    conflicts: "现实压力与情感关系持续碰撞。",
  });

  assert.match(structure.profile.identity, /现实都市/);
  assert.ok(structure.rules.axioms.length >= 1);
  assert.ok(structure.forces.length >= 1);
  assert.ok(structure.locations.length >= 1);
});

test("parseStoryWorldSliceOverrides returns empty object for invalid payload", () => {
  assert.deepEqual(parseStoryWorldSliceOverrides("{bad json"), {});
});

test("buildStoryWorldSliceView exposes available options from structure", () => {
  const structure = buildStructuredWorld();
  const view = buildStoryWorldSliceView({
    worldId: "world-1",
    worldName: "都市试验场",
    slice: null,
    overrides: {},
    structure,
    isStale: true,
    storyInputSource: "story_macro",
  });

  assert.equal(view.hasWorld, true);
  assert.equal(view.availableRules[0].id, "rule-reality");
  assert.equal(view.availableForces[0].id, "force-lesheng");
  assert.equal(view.availableLocations[0].id, "location-office");
  assert.equal(view.isStale, true);
});
