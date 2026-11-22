const {test, before, after} = require("node:test");
const assert = require("node:assert/strict");
const {mkdtempSync} = require("node:fs");
const {tmpdir} = require("node:os");
const path = require("node:path");
const {once} = require("node:events");
const express = require("express");

const dir = mkdtempSync(path.join(tmpdir(), "director-review-assets-"));
Object.assign(process.env, {AI_NOVEL_RUNTIME: "desktop", AI_NOVEL_APP_DATA_DIR: dir, DATABASE_URL: "file:" + path.join(dir, "test.db").split(path.sep).join("/")});
const {prisma} = require("../../../dist/db/prisma");
const {ensureRuntimeDatabaseReady} = require("../../../dist/db/runtimeMigrations");
const {errorHandler} = require("../../../dist/middleware/errorHandler");
const {createDirectorNextServices} = require("../../../dist/modules/director");
const {mountDirectorNext} = require("../../../dist/modules/director/http");
const {PrismaArtifactLedger, PrismaRunRepository} = require("../../../dist/modules/director/infrastructure");
const {createDirectorProductionOptions} = require("../../../dist/app/director/productionComposition");
const {readEditedArtifact} = require("../../../dist/app/director/savedContent");
const {castConversationRouter} = require("../../../dist/app/director/revisions/castDiscussion");

const options = createDirectorProductionOptions();
const services = createDirectorNextServices(options);
const runs = new PrismaRunRepository(prisma);
const ledger = new PrismaArtifactLedger(prisma);
let server;
before(async () => {
  await ensureRuntimeDatabaseReady();
  const app = express();
  app.use(express.json());
  mountDirectorNext(app, services.http);
  app.use("/api/director-next", castConversationRouter());
  app.use(errorHandler);
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
});
after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await prisma.$disconnect();
});

async function openGate(novelId, type) {
  const runId = "run-" + novelId;
  const contract = options.contractFactory({runId, novelId, driver: "assisted", stepIdsInScope: null,
    launchInput: {storyInput: "寻找寄信人", estimatedChapterCount: 80, worldMode: "skip", targetMode: "opening", provider: "openai", model: "fixture"}});
  contract.executionEpoch = 0;
  await runs.open(contract);
  await runs.transition(runId, {type: "start"}, 0);
  const saved = await prisma.$transaction(tx => readEditedArtifact({contract, type, contentRef: type}, tx));
  await ledger.record({novelId, type, scope: contract.scope, status: "draft", protectedUserContent: false, ...saved, producedByRunId: runId});
  await runs.transition(runId, {type: "open_gate", gateId: "gate", artifactTypes: [type]}, 1);
  return async (key, fields, expectedStatus) => {
    const reply = await fetch(`http://127.0.0.1:${server.address().port}/api/director-next/commands`, {
      method: "POST", headers: {"Content-Type": "application/json"},
      body: JSON.stringify({type: "resolve_gate", runId, expectedVersion: 2, decision: "confirm_after_edit", idempotencyKey: novelId + "-" + key, ...fields}),
    });
    assert.equal(reply.status, expectedStatus, await reply.text());
  };
}

test("a character discussion stays at its gate and only saved choices reach the volume strategy prompt", async t => {
  const novelId = "cast-discussion", runId = "run-" + novelId;
  await prisma.novel.create({data: {id: novelId, title: "寻找寄信人", directorVersion: "v2"}});
  for (let n = 1; n <= 7; n++) {
    await prisma.character.create({data: {id: "cast-" + n, novelId, name: n === 7 ? "妹妹" : "证人" + n,
      role: "配角", personality: "谨慎", currentGoal: "守店", storyFunction: "提供线索"}});
  }
  const confirm = await openGate(novelId, "character_cast");
  for (const type of ["novel_seed", "story_macro", "book_contract", "world_skeleton"]) {
    await ledger.record({novelId, type, scope: "book", status: "confirmed", protectedUserContent: true,
      contentRef: type + ":" + novelId, contentHash: "fixture-" + type, producedByRunId: runId});
  }
  const runner = require("../../../dist/prompting/core/promptRunner");
  const base = {personality: "谨慎", currentGoal: "守店", storyFunction: "提供线索"};
  const draft = {...base, personality: "谨慎但不服输"};
  const suggestions = [{field: "currentGoal", value: "追查寄信人的旧地址", reason: "给妹妹一个主动选择"},
    {field: "storyFunction", value: "代替兄长赴约", reason: "让她掌握线索"}];
  const wanted = {field: "currentGoal", before: base.currentGoal, after: suggestions[0].value, id: "cast-7"};
  const prompts = [];
  const volumeCalls = [];
  t.mock.method(runner, "runStructuredPrompt", async call => {
    if (call.asset.id.startsWith("novel.volume.")) {
      volumeCalls.push(call.options.scope);
      const content = call.contextBlocks.find(block => block.id === "book_contract").content;
      assert.match(content, /妹妹/);
      assert.match(content, /追查寄信人的旧地址/);
      assert.doesNotMatch(content, /代替兄长赴约/);
      if (call.options.scope === "strategy") return {output: {recommendedVolumeCount: 1, hardPlannedVolumeCount: 1,
        readerRewardLadder: "查出真相", escalationLadder: "寄信人失踪", midpointShift: "追到旧址", notes: "旧信线索",
        uncertainties: [], volumes: [{sortOrder: 1, planningMode: "hard", roleLabel: "查证", coreReward: "找到寄信人", escalationFocus: "证人离开", uncertaintyLevel: "low"}]}};
      if (call.options.scope === "strategy_critique") return {output: {overallRisk: "low", summary: "可用", issues: [], recommendedActions: []}};
      return {output: {volumes: [{title: "旧址", summary: "妹妹追查寄信人", openingHook: "第一封信", mainPromise: "查明身份",
        primaryPressureSource: "搬迁期限", coreSellingPoint: "旧地址", escalationMode: "现场查证", protagonistChange: "愿意信任",
        midVolumeRisk: "线索中断", climax: "见到寄信人", payoffType: "相认", nextVolumeHook: "第二封信", resetPoint: "重回老店", openPayoffs: []}]}};
    }
    assert.equal(call.asset.id, "novel.director.cast_dialogue");
    assert.equal(call.options.model, "fixture");
    assert.equal(call.options.taskId, runId);
    prompts.push(call.promptInput);
    return {output: {replyText: "让妹妹去查旧地址。", changes: prompts.length === 1 ? suggestions : []}};
  });
  const root = `http://127.0.0.1:${server.address().port}/api/director-next/novels/${novelId}/runs/${runId}/cast-review/2/characters/`;
  const url = id => root + id + "/conversation";
  const postTurn = (id, body) => fetch(url(id) + "/turns", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)});
  async function finished(id) {
    for (let n = 0; n < 150; n++) {
      const {data} = await (await fetch(url("cast-7"))).json();
      const turn = data.find(turn => turn.id === id);
      if (turn && turn.status !== "running") { assert.equal(turn.status, "completed", turn.replyText); return turn; }
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.fail("discussion did not complete");
  }
  const first = {requestId: "cast-turn-1", requestText: "让妹妹自己去查信，保留兄妹感情。", base, draft};
  assert.equal((await postTurn("cast-7", first)).status, 202);
  const turn = await finished(first.requestId);
  assert.deepEqual(turn.result.changes.map(change => change.before), [base.currentGoal, base.storyFunction]);
  assert.equal(prompts[0].character.personality, draft.personality);
  assert.match(prompts[0].storyInput, /寻找寄信人/);
  assert.equal(prompts[0].cast.length, 7);
  assert.equal((await postTurn("cast-7", first)).status, 202);
  assert.equal(prompts.length, 1, "replay uses the same receipt");
  const follow = {...first, requestId: "cast-turn-2", parentResultId: turn.result.id, requestText: "为什么？",
    draft: {...draft, currentGoal: wanted.after}};
  assert.equal((await postTurn("cast-6", follow)).status, 409);
  assert.deepEqual((await (await fetch(url("cast-6"))).json()).data, []);
  assert.equal((await postTurn("cast-7", follow)).status, 202);
  assert.equal((await finished(follow.requestId)).result, null, "a question can produce just an explanation");
  assert.equal(prompts[1].priorProposal.length, 2);
  assert.equal(prompts[1].history[0].author, first.requestText);
  assert.equal(prompts[1].character.currentGoal, wanted.after);
  assert.equal((await runs.getControl(runId)).status, "waiting_gate");
  const readPerson = () => prisma.character.findUniqueOrThrow({where: {id: "cast-7"}});
  assert.equal((await readPerson()).currentGoal, base.currentGoal);
  assert.equal((await postTurn("cast-7", {...first, requestId: "outdated", base: {...base, personality: "过期稿"}})).status, 409);
  const edit = {assetEdit: {type: "character_cast", changes: [wanted]}};
  await confirm("accepted", edit, 202);
  await confirm("accepted", edit, 202);
  assert.equal((await readPerson()).storyFunction, base.storyFunction);
  assert.equal((await readPerson()).currentGoal, wanted.after);
  assert.equal((await runs.getControl(runId)).status, "running");
  assert.equal((await postTurn("cast-7", {...first, requestId: "closed"})).status, 409);
  for (let i = 0; i < 4 && (await runs.getControl(runId)).status === "running"; i++) await services.worker.tick();
  const next = await runs.getControl(runId);
  assert.equal(next.status, "waiting_gate", JSON.stringify(next));
  assert.deepEqual(next.gate.artifactTypes, ["volume_strategy"]);
  assert.deepEqual(volumeCalls, ["strategy", "strategy_critique", "skeleton"]);
  assert.equal((await prisma.volumePlan.findFirstOrThrow({where: {novelId}})).title, "旧址");
});

for (const type of ["character_cast", "volume_strategy"]) {
  test(type + " saves only actual source-page edits, rolls back stale changes and replays safely", async () => {
    const novelId = type;
    const id = "asset-" + type;
    await prisma.novel.create({data: {id: novelId, title: "局部编辑", outline: "作者独立保存的大纲"}});
    await prisma.chapter.create({data: {novelId, order: 1, title: "作者章节", content: "作者正文"}});
    const isCast = type === "character_cast";
    if (isCast) {
      await prisma.character.create({data: {id, novelId, name: "林渡", role: "主角", personality: "冷静", background: "保留身世"}});
    } else {
      const volume = {id, sortOrder: 1, title: "第一卷", summary: "旧卷纲", chapters: [], openingHook: "保留抓手", customNote: "保留版本扩展"};
      await prisma.volumePlanVersion.create({data: {id: "v1", novelId, status: "active", version: 1, contentJson: JSON.stringify({volumes: [volume]})}});
      await prisma.volumePlan.create({data: {id, novelId, title: volume.title, sortOrder: 1, summary: volume.summary, sourceVersionId: "v1"}});
      await prisma.storyPlan.create({data: {novelId, level: "arc", externalRef: "volume:1", title: volume.title, objective: "旧目标", rawPlanJson: JSON.stringify({summary: volume.summary, chapters: ["保留章节进度"]})}});
    }
    const post = await openGate(novelId, type);
    const field = isCast ? "personality" : "summary";
    const before = isCast ? "冷静" : "旧卷纲";
    const after = isCast ? "胆大心细" : "循信找到证人";
    const change = {field, id, before, after};
    const patch = (...changes) => ({assetEdit: {type, changes}});
    await post("bare", {}, 400);
    await post("unchanged", patch({...change, after: before}), 400);
    await post("duplicate", patch(change, change), 400);
    await post("wrong-gate", {assetEdit: {type: isCast ? "volume_strategy" : "character_cast", changes: [{...change, field: isCast ? "summary" : "personality"}]}}, 400);
    await post("wrong-decision", {...patch(change), decision: "confirm"}, 400);
    await post("stale-control", {...patch(change), expectedVersion: 1}, 409);
    await post("stale-field", patch(change, {id, field: isCast ? "currentGoal" : "climax", before: "另一个版本", after: "改写"}), 409);
    const delegate = isCast ? prisma.character : prisma.volumePlan;
    assert.equal((await delegate.findUniqueOrThrow({where: {id}}))[field], before);
    assert.equal((await runs.getControl("run-" + novelId)).status, "waiting_gate");
    assert.equal(await prisma.directorNextArtifact.count({where: {novelId, type}}), 1);
    await post("save", patch(change), 202);
    await post("save", patch(change), 202);
    const artifacts = await prisma.directorNextArtifact.findMany({where: {novelId, type}, orderBy: {version: "asc"}});
    assert.equal(artifacts.length, 2);
    assert.equal(artifacts[1].status, "user_edited");
    assert.equal(artifacts[1].protectedUserContent, true);
    assert.notEqual(artifacts[0].contentHash, artifacts[1].contentHash);
    assert.equal((await delegate.findUniqueOrThrow({where: {id}}))[field], after);
    assert.equal((await runs.getControl("run-" + novelId)).status, "running");
    assert.equal((await prisma.chapter.findFirstOrThrow({where: {novelId}})).content, "作者正文");
    if (isCast) {
      assert.equal((await delegate.findUniqueOrThrow({where: {id}})).background, "保留身世");
    } else {
      const saved = JSON.parse((await prisma.volumePlanVersion.findUniqueOrThrow({where: {id: "v1"}})).contentJson);
      assert.equal(saved.volumes[0].summary, after);
      assert.equal(saved.volumes[0].customNote, "保留版本扩展");
      assert.equal(saved.volumes[0].openingHook, "保留抓手");
      const arc = await prisma.storyPlan.findFirstOrThrow({where: {novelId, level: "arc"}});
      assert.equal(arc.objective, after);
      assert.deepEqual(JSON.parse(arc.rawPlanJson).chapters, ["保留章节进度"]);
      assert.equal((await prisma.novel.findUniqueOrThrow({where: {id: novelId}})).outline, "作者独立保存的大纲");
    }
  });
}

test("an older version-only plan can be edited, and direct acceptance keeps a generated asset unprotected", async () => {
  const novelId = "legacy-volumes";
  await prisma.novel.create({data: {id: novelId, title: "旧版卷纲"}});
  await prisma.volumePlanVersion.create({data: {novelId, status: "active", version: 1, contentJson: JSON.stringify({
    volumes: [{id: "version-only", title: "第一卷", sortOrder: 1, summary: "旧摘要", chapters: []}],
  })}});
  const post = await openGate(novelId, "volume_strategy");
  await post("save", {assetEdit: {type: "volume_strategy", changes: [{id: "version-only", field: "summary", before: "旧摘要", after: "新摘要"}]}}, 202);
  const version = await prisma.volumePlanVersion.findFirstOrThrow({where: {novelId}});
  assert.equal(JSON.parse(version.contentJson).volumes[0].summary, "新摘要");
  assert.equal(await prisma.volumePlan.count({where: {novelId}}), 0);

  const direct = "ordinary-confirm";
  await prisma.novel.create({data: {id: direct, title: "直接确认", characters: {create: {name: "林渡", role: "主角"}}}});
  const accept = await openGate(direct, "character_cast");
  await accept("accept", {decision: "confirm"}, 202);
  const versions = await prisma.directorNextArtifact.findMany({where: {novelId: direct, type: "character_cast"}});
  assert.equal(versions.length, 1);
  assert.equal(versions[0].status, "confirmed");
  assert.equal(versions[0].protectedUserContent, false);
});
