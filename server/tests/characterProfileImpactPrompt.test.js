const test = require("node:test");
const assert = require("node:assert/strict");
const {getRegisteredPromptAsset} = require("../dist/prompting/registry");

const asset = getRegisteredPromptAsset("novel.director.character_profile_impact", "v1");

const candidate = (overrides = {}) => ({
  id: "synopsis:novel-1:description",
  resourceType: "synopsis",
  resourceId: "novel-1",
  title: "小说简介与卖点",
  field: "description",
  before: "旧简介里提到林默。",
  evidence: "旧简介里提到林默。",
  updatedAt: "2026-11-23T00:00:00.000Z",
  applyMode: "replace",
  ...overrides,
});

test("角色资料影响提示词只接受候选资料中的唯一建议", () => {
  const input = {character: {name: "林默", before: {}, after: {}}, candidates: [candidate()]};
  const output = asset.outputSchema.parse({suggestions: [{
    candidateId: input.candidates[0].id,
    resourceType: "synopsis",
    resourceId: "novel-1",
    title: "小说简介与卖点",
    field: "description",
    before: "旧简介里提到林默。",
    after: "新简介里保留主角的核心冲突。",
    reason: "角色改名后简介仍引用旧名。",
    confidence: 0.91,
    applyMode: "replace",
    updatedAt: input.candidates[0].updatedAt,
  }]});
  assert.deepEqual(asset.postValidate(output, input), output);
});

test("角色资料影响提示词拒绝重复候选和正文直接覆盖", () => {
  const synopsis = candidate();
  const prose = candidate({id: "prose:chapter-1:content", resourceType: "prose", resourceId: "chapter-1", title: "第 1 章", field: "content", applyMode: "review", paragraphs: [{paragraph: 1, before: "正文段落。"}]});
  const input = {character: {name: "林默", before: {}, after: {}}, candidates: [synopsis, prose]};
  const suggestion = {
    candidateId: synopsis.id, resourceType: synopsis.resourceType, resourceId: synopsis.resourceId,
    title: synopsis.title, field: synopsis.field, before: synopsis.before, after: "新简介。",
    reason: "需要同步简介。", confidence: 0.8, applyMode: synopsis.applyMode, updatedAt: synopsis.updatedAt,
  };
  assert.throws(() => asset.postValidate({suggestions: [suggestion, suggestion]}, input), /不能重复/);
  assert.throws(() => asset.postValidate({suggestions: [{
    candidateId: prose.id, resourceType: prose.resourceType, resourceId: prose.resourceId,
    title: prose.title, field: prose.field, before: prose.before, after: "整章改写", reason: "需要核对正文。",
    confidence: 0.7, applyMode: "review", updatedAt: prose.updatedAt,
  }]}, input), /正文影响只能先进入核对清单/);
});

test("角色资料影响提示词要求正文建议绑定候选段落", () => {
  const prose = candidate({id: "prose:chapter-1:content", resourceType: "prose", resourceId: "chapter-1", title: "第 1 章", field: "content", applyMode: "review", paragraphs: [{paragraph: 2, before: "正文段落。"}]});
  const input = {character: {name: "林默", before: {}, after: {}}, candidates: [prose]};
  const suggestion = {
    candidateId: prose.id, resourceType: prose.resourceType, resourceId: prose.resourceId,
    title: prose.title, field: prose.field, before: prose.before, after: null, reason: "需要核对正文。",
    confidence: 0.7, applyMode: "review", updatedAt: prose.updatedAt,
  };
  assert.throws(() => asset.postValidate({suggestions: [suggestion]}, input), /必须引用候选中的具体段落/);
  assert.deepEqual(asset.postValidate({suggestions: [{...suggestion, paragraphs: prose.paragraphs}]}, input).suggestions[0].paragraphs, prose.paragraphs);
});
