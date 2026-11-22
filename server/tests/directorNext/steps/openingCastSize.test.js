const {test, before, after} = require("node:test");
const assert = require("node:assert/strict");
const {mkdtempSync} = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const dir = mkdtempSync(path.join(os.tmpdir(), "director-cast-size-"));
Object.assign(process.env, {AI_NOVEL_RUNTIME: "desktop", AI_NOVEL_APP_DATA_DIR: dir, DATABASE_URL: "file:" + path.join(dir, "cast.db").split(path.sep).join("/")});
const {prisma} = require("../../../dist/db/prisma");
const {ensureRuntimeDatabaseReady} = require("../../../dist/db/runtimeMigrations");
const runner = require("../../../dist/prompting/core/promptRunner");
const {StructuredOutputError} = require("../../../dist/llm/structuredOutput");
const {generateAutoCharacterCastDraft, appendCharacterCastOptionsDraft} = require("../../../dist/services/novel/characterPrep/characterCastGeneration");
const {CharacterPreparationService} = require("../../../dist/services/novel/characterPrep/CharacterPreparationService");
const {NovelProductionService} = require("../../../dist/services/novel/NovelProductionService");
const {readDirectorWorkspace} = require("../../../dist/app/director/workspace");
const {characterCastOptionSchema} = require("../../../dist/prompting/prompts/novel/characterPreparation.promptSchemas");
const {novelProductionCharactersPrompt} = require("../../../dist/prompting/prompts/novel/production.prompts");
const apply = new CharacterPreparationService();
before(ensureRuntimeDatabaseReady);
after(() => prisma.$disconnect());

function roster(size) {
  const members = Array.from({length: size}, (_, i) => ({
    name: "林" + i, role: "调查者", castRole: i < 2 ? "protagonist" : "ally", gender: "unknown", storyFunction: "循线寻找证据",
  }));
  const relations = members.slice(1).map(member => ({sourceName: members[0].name, targetName: member.name, surfaceRelation: "同行"}));
  return {title: "开书阵容", summary: "循线调查", members, relations};
}

for (const [size, staged, chapters, storyInput] of [
  [1, true, 9, "只写一位守灯人的独角戏，没有其他登场人物。"],
  [2, false, 24, "两名失散的姐妹都是主角，交替讲述她们的寻亲经过。"],
  [8, true, 80, "三座城的调查线同时推进，请按各条线需要安排群像。"],
  [16, false, 120, "保留作者设定的十六位船员，其中两位是主角。"],
]) {
  test(`${size} opening characters survive ${staged ? "staged" : "direct"} generation, apply and workspace reload`, async t => {
    const novelId = "cast-" + size;
    const expected = roster(size);
    await prisma.novel.create({data: {id: novelId, title: "阵容测试", directorVersion: "v2", estimatedChapterCount: chapters}});
    const calls = [];
    t.mock.method(runner, "runStructuredPrompt", async ({asset, promptInput, contextBlocks}) => {
      calls.push(asset.id);
      if (asset.id === "novel.character.castAuto" && staged) throw new StructuredOutputError({category: size > 6 ? "output_budget_exhausted" : "incomplete_json", message: "fixture", diagnostics: {}});
      let raw;
      if (asset.id.endsWith(".relations")) {
        assert.deepEqual(promptInput.protagonistNames, expected.members.slice(0, 2).map(member => member.name));
        raw = {relations: expected.relations};
      } else {
        assert.ok(contextBlocks.some(block => block.content.includes(storyInput) && block.content.includes(chapters + " 章")));
        raw = asset.id.endsWith(".members") ? expected : {option: expected};
      }
      const output = asset.outputSchema.parse(raw);
      return {output: asset.postValidate ? asset.postValidate(output, promptInput) : output};
    });
    const draft = await generateAutoCharacterCastDraft(novelId, {storyInput, useWorldContext: false});
    const [id] = await appendCharacterCastOptionsDraft(novelId, storyInput, {options: [draft.parsed.option]});
    const saved = await apply.applyCharacterCastOption(novelId, id, {requireEmptyCast: true, postApplyMode: "deferred"});
    assert.equal(saved.createdCount, size);
    assert.equal(saved.relationCount, size - 1);
    const book = await readDirectorWorkspace(novelId);
    assert.equal(book.materials.characterCount, size);
    assert.deepEqual(book.materials.characters.map(member => member.name).sort(), expected.members.map(member => member.name).sort());
    assert.equal(book.materials.characters.filter(member => member.castRole === "protagonist").length, Math.min(size, 2));
    if (size === 16) {
      const express = require("express");
      const {once} = require("node:events");
      const {registerNovelBaseRoutes} = require("../../../dist/modules/novel/setup/http/novelBaseRoutes");
      const app = express();
      registerNovelBaseRoutes({router: app, novelService: {}});
      const http = app.listen(0, "127.0.0.1");
      await once(http, "listening");
      try {
        const response = await fetch(`http://127.0.0.1:${http.address().port}/${novelId}/simple-shelf`);
        const body = await response.json();
        assert.equal(response.status, 200, JSON.stringify(body));
        assert.equal(body.data.materials.characterCount, size);
        assert.equal(body.data.materials.characters.length, size);
      } finally { await new Promise(resolve => http.close(resolve)); }
    }
    assert.equal(calls.length, staged ? (size === 1 ? 2 : 3) : 1);
    await assert.rejects(apply.applyCharacterCastOption(novelId, id, {requireEmptyCast: true, postApplyMode: "deferred"}), /已有角色/);
    assert.equal(await prisma.character.count({where: {novelId}}), size);
  });
}

test("cast validation rejects ambiguous names, missing endpoints, self links and duplicate links", () => {
  for (const invalidate of [
    option => { option.members[1].name = option.members[0].name; option.relations = []; },
    option => { option.relations[0].targetName = "名单外角色"; },
    option => { option.relations[0].targetName = option.relations[0].sourceName; },
    option => { option.relations.push({...option.relations[0]}); },
  ]) {
    const option = roster(2);
    invalidate(option);
    assert.equal(characterCastOptionSchema.safeParse(option).success, false);
  }
});

test("concurrent first saves reuse one complete roster", async () => {
  const {saveOpeningCast} = require("../../../dist/services/novel/characterPrep/opening/saveOpeningCast");
  const novelId = "concurrent";
  await prisma.novel.create({data: {id: novelId, title: "并发创建"}});
  const members = roster(8).members.map(({name, role}) => ({name, role}));
  const results = await Promise.all([saveOpeningCast(novelId, members), saveOpeningCast(novelId, members)]);
  assert.equal(results.filter(result => result.reused).length, 1);
  assert.deepEqual(new Set(results[0].characters.map(row => row.id)), new Set(results[1].characters.map(row => row.id)));
  assert.equal(await prisma.character.count({where: {novelId}}), members.length);
});

test("bad saved relation rolls back all inserted members and leaves the option available", async () => {
  const novelId = "bad-relation";
  await prisma.novel.create({data: {id: novelId, title: "旧候选"}});
  const option = characterCastOptionSchema.parse(roster(8));
  option.relations[0].targetName = "外部人物";
  assert.equal(characterCastOptionSchema.safeParse(option).success, false);
  const [id] = await appendCharacterCastOptionsDraft(novelId, "旧候选", {options: [option]});
  await assert.rejects(apply.applyCharacterCastOption(novelId, id, {requireEmptyCast: true, postApplyMode: "deferred"}), /无效的人物关系/);
  assert.equal(await prisma.character.count({where: {novelId}}), 0);
  assert.equal((await prisma.characterCastOption.findUniqueOrThrow({where: {id}})).status, "draft");
});

test("creative production delegates size to the model and honors explicit counts before saving", async t => {
  const service = new NovelProductionService();
  t.mock.method(service.novelService, "rebuildCharacterDynamics", async () => {});
  const {generateNovelCharactersInput} = require("../../../dist/agents/tools/novelToolShared");
  for (const count of [1, 2, 13]) assert.equal(generateNovelCharactersInput.parse({count}).count, count);
  assert.equal(generateNovelCharactersInput.safeParse({count: 0}).success, false);
  let requestedSize;
  t.mock.method(runner, "runStructuredPrompt", async ({asset, promptInput}) => {
    assert.equal(promptInput.desiredCount, requestedSize);
    const output = roster(requestedSize ?? 2).members.map(({name, role}) => ({name, role}));
    return {output: asset.postValidate(asset.outputSchema.parse(output), promptInput)};
  });
  for (const count of [undefined, 1, 13]) {
    requestedSize = count;
    const novelId = "creative-" + (count ?? "auto");
    await prisma.novel.create({data: {id: novelId, title: "创作中枢"}});
    const result = await service.generateNovelCharacters({novelId, count});
    assert.equal(result.characterCount, count ?? 2);
    assert.equal((await service.generateNovelCharacters({novelId})).reused, true);
  }
  assert.throws(() => novelProductionCharactersPrompt.postValidate([{name: "甲", role: "主角"}], {desiredCount: 3}), /指定了 3/);
});

test("supplemental candidates preserve the full recommended or requested roster and await author selection", async t => {
  const {supplementalCharacterGenerationInputSchema} = require("../../../dist/prompting/prompts/novel/characterPreparation.promptSchemas");
  const novelId = "additional";
  await prisma.novel.create({data: {id: novelId, title: "补充人物", characters: {create: {name: "原角色", role: "主角"}}}});
  const candidates = roster(7).members.map(member => ({...member, summary: "寻找证据的人物"}));
  t.mock.method(runner, "runStructuredPrompt", async ({asset, promptInput}) => {
    const output = asset.outputSchema.parse({mode: "independent", recommendedCount: 7, candidates});
    return {output: asset.postValidate(output, promptInput)};
  });
  for (const count of [undefined, 7]) {
    const options = supplementalCharacterGenerationInputSchema.parse({mode: "independent", useWorldContext: false, count});
    const result = await apply.generateSupplementalCharacters(novelId, options);
    assert.equal(result.candidates.length, 7);
    assert.equal(result.recommendedCount, 7);
  }
  await assert.rejects(apply.generateSupplementalCharacters(novelId, {useWorldContext: false, count: 8}), /指定补充 8/);
  assert.equal(await prisma.character.count({where: {novelId}}), 1);
});
