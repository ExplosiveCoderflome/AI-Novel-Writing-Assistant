const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildNovelWorldHandbook,
  parseCommercialTags,
  safeJsonParse,
} = require("../dist/services/novel/worldContext/novelWorldProjection.js");

test("parseCommercialTags accepts json array and delimited text", () => {
  assert.deepEqual(parseCommercialTags('["玄幻", "升级", "", "群像"]'), ["玄幻", "升级", "群像"]);
  assert.deepEqual(parseCommercialTags("玄幻，升级; 群像\n权谋"), ["玄幻", "升级", "群像", "权谋"]);
  assert.deepEqual(parseCommercialTags(""), []);
});

test("safeJsonParse returns fallback for invalid payload", () => {
  assert.deepEqual(safeJsonParse("{bad", { ok: false }), { ok: false });
  assert.deepEqual(safeJsonParse('{"ok":true}', { ok: false }), { ok: true });
});

test("buildNovelWorldHandbook projects structured world into narrative handbook", () => {
  const structuredData = {
    profile: {
      summary: "星核枯竭的帝国边境，魔法资源正在成为战争导火索。",
      identity: "玄幻边境争霸",
      tone: "冷峻史诗",
      themes: ["资源枯竭", "边境求生"],
      coreConflict: "星核配额枯竭 vs 边境异化潮",
    },
    rules: {
      summary: "力量来自星核，透支会留下不可逆代价。",
      axioms: [{
        id: "rule-star-core",
        name: "星核代价",
        summary: "魔力来自星核，透支会损伤寿命。",
        cost: "寿命损耗",
        boundary: "不能无代价升级",
      }],
      taboo: ["不能把星核写成普通灵石"],
      sharedConsequences: ["忽视星核代价会引发边境灾变"],
    },
    factions: [{
      id: "faction-court",
      name: "星皇朝廷",
      position: "旧秩序中心",
      doctrine: "配额高于一切",
    }],
    forces: [{
      id: "force-court",
      name: "北境星核司",
      summary: "执行配额审查的边境机构。",
      pressure: "以配额和身份审查施压",
      narrativeRole: "主角资源压力来源",
    }, {
      id: "force-rebels",
      name: "裂星盟",
      summary: "反抗配额制度的地下组织。",
      pressure: "制造边境暴动",
      narrativeRole: "前期冲突推手",
    }],
    locations: [{
      id: "location-border",
      name: "北境冰原",
      summary: "星核矿脉最不稳定的前线。",
      narrativeFunction: "承载开局危机",
      risk: "星核风暴会暴露能力代价",
    }],
    relations: {
      forceRelations: [{
        sourceForceId: "force-court",
        targetForceId: "force-rebels",
        relation: "镇压",
        tension: "配额制度正在失控",
      }],
      locationControls: [],
    },
  };

  const handbook = buildNovelWorldHandbook({
    title: "紫霞界",
    coverSummary: "备用摘要",
    structuredDataJson: JSON.stringify(structuredData),
  });

  assert.ok(handbook);
  assert.equal(handbook.title, "紫霞界");
  assert.equal(handbook.summary, structuredData.profile.summary);
  assert.equal(handbook.identity, "玄幻边境争霸");
  assert.deepEqual(handbook.themes, ["资源枯竭", "边境求生"]);
  assert.deepEqual(handbook.coreRules.map((rule) => rule.name), ["星核代价"]);
  assert.deepEqual(handbook.forces.map((force) => force.name), ["北境星核司", "裂星盟"]);
  assert.deepEqual(handbook.locations.map((location) => location.name), ["北境冰原"]);
  assert.match(handbook.tensions.join("\n"), /星核配额枯竭/);
  assert.match(handbook.tensions.join("\n"), /北境星核司/);
  assert.match(handbook.generationGuidance.characterUses.join("\n"), /北境星核司/);
  assert.match(handbook.generationGuidance.outlineUses.join("\n"), /北境冰原/);
  assert.match(handbook.generationGuidance.chapterUses.join("\n"), /不能无代价升级/);
  assert.match(handbook.generationGuidance.avoidUses.join("\n"), /不能把星核写成普通灵石/);
});
