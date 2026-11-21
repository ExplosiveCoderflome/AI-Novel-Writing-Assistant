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

const options = createDirectorProductionOptions();
const runs = new PrismaRunRepository(prisma);
const ledger = new PrismaArtifactLedger(prisma);
let server;
before(async () => {
  await ensureRuntimeDatabaseReady();
  const app = express();
  app.use(express.json());
  mountDirectorNext(app, createDirectorNextServices(options).http);
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
