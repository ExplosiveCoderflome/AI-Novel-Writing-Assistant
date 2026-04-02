const test = require("node:test");
const assert = require("node:assert/strict");
const { buildBookFramingSummary } = require("../dist/services/novel/bookFraming.js");
const { formatProjectContext } = require("../dist/services/novel/storyMacro/storyMacroPlanService.shared.js");
const { storyWorldSlicePrompt } = require("../dist/prompting/prompts/storyWorldSlice/storyWorldSlice.prompts.js");
const { buildWorldBindingSupport } = require("../dist/services/world/worldStructure.js");

function buildStructuredWorld() {
  return {
    profile: {
      summary: "现实都市里的高压关系网。",
      identity: "现实都市",
      tone: "冷峻压迫",
      themes: ["逆袭", "资源争夺"],
      coreConflict: "主角在现实压力里夺回主动权。",
    },
    rules: {
      summary: "所有冲突必须落回现实社会机制。",
      axioms: [{
        id: "rule-reality",
        name: "现实规则优先",
        summary: "机会和冲突都必须回到现实资源分配。",
        cost: "每次突破都要付出现实代价。",
        boundary: "不能靠超自然设定解决问题。",
        enforcement: "错误选择会持续反噬关系和地位。",
      }],
      taboo: [],
      sharedConsequences: [],
    },
    factions: [],
    forces: [{
      id: "force-company",
      name: "乐圣公司",
      type: "company",
      factionId: null,
      summary: "控制关键资源的公司。",
      baseOfPower: "资本和渠道",
      currentObjective: "继续压缩主角的空间",
      pressure: "卡资源和卡岗位",
      leader: "林总",
      narrativeRole: "外部压力源",
    }],
    locations: [{
      id: "location-office",
      name: "核心办公区",
      terrain: "office",
      summary: "主要职场战场。",
      narrativeFunction: "承接正面冲突和利益交换。",
      risk: "一次失误就会被放大。",
      entryConstraint: "必须有关系或业务入口",
      exitCost: "离开就会丢失机会",
      controllingForceIds: ["force-company"],
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

test("normalizeCommercialTags dedupes, truncates and limits output", async () => {
  const { formatCommercialTagsInput, normalizeCommercialTags } = await import("@ai-novel/shared/types/novelFraming");

  const normalized = normalizeCommercialTags("逆袭，强冲突，逆袭，持续追更钩子，情感拉扯，资源博弈，长线成长，第七个标签");

  assert.deepEqual(normalized, [
    "逆袭",
    "强冲突",
    "持续追更钩子",
    "情感拉扯",
    "资源博弈",
    "长线成长",
  ]);
  assert.equal(formatCommercialTagsInput(normalized), "逆袭，强冲突，持续追更钩子，情感拉扯，资源博弈，长线成长");
});

test("book framing summary flows into story macro context and world slice prompt", () => {
  const novel = {
    id: "novel-1",
    title: "楼上灯火",
    description: "主角在现实职场和关系链条里抢回主动权。",
    targetAudience: "爱看都市高压逆袭和关系拉扯的读者",
    bookSellingPoint: "每一次现实困局都会撬动更大的人情和利益链。",
    competingFeel: "现实职场压迫感里带冷幽默和持续反压。",
    first30ChapterPromise: "前 30 章必须让主角站稳第一阶段立场，并让核心对手浮出水面。",
    commercialTagsJson: JSON.stringify(["逆袭", "强冲突", "职场博弈"]),
    styleTone: "冷峻、克制",
    narrativePov: "third_person",
    pacePreference: "fast",
    emotionIntensity: "high",
    estimatedChapterCount: 120,
    genre: { name: "都市" },
  };

  const summary = buildBookFramingSummary(novel);
  assert.match(summary, /目标读者：爱看都市高压逆袭和关系拉扯的读者/);
  assert.match(summary, /核心商业标签：逆袭、强冲突、职场博弈/);
  assert.match(summary, /前 30 章承诺/);

  const projectContext = formatProjectContext(novel, "世界切片：现实都市基底");
  assert.match(projectContext, /书级 framing/);
  assert.match(projectContext, /本书核心卖点/);
  assert.match(projectContext, /世界切片：现实都市基底/);

  const structure = buildStructuredWorld();
  const rendered = storyWorldSlicePrompt.render({
    novel,
    structure,
    bindingSupport: buildWorldBindingSupport(structure),
    storyInput: "主角要在被压制的职场环境里完成第一次正面反击。",
    overrides: {
      primaryLocationId: "location-office",
      requiredForceIds: ["force-company"],
      requiredLocationIds: ["location-office"],
      requiredRuleIds: ["rule-reality"],
      scopeNote: "保留现实高压基底，不要越成超自然升级文。",
    },
    builderMode: "manual_refresh",
  });
  const prompt = {
    system: typeof rendered[0]?.content === "string" ? rendered[0].content : String(rendered[0]?.content ?? ""),
    user: typeof rendered[1]?.content === "string" ? rendered[1].content : String(rendered[1]?.content ?? ""),
  };

  assert.match(prompt.user, /书级 framing/);
  assert.match(prompt.user, /目标读者：爱看都市高压逆袭和关系拉扯的读者/);
  assert.match(prompt.user, /前 30 章承诺：前 30 章必须让主角站稳第一阶段立场/);
});
