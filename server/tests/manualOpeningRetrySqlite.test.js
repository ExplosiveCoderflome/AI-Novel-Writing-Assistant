const {test} = require("node:test");
const assert = require("node:assert/strict");
const {mkdtempSync} = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {once} = require("node:events");

test("manual opening retries an interrupted attachment and replays concurrent requests as one book", async t => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "manual-opening-"));
  Object.assign(process.env, {AI_NOVEL_RUNTIME: "desktop", AI_NOVEL_APP_DATA_DIR: dir,
    DATABASE_URL: "file:" + path.join(dir, "test.db").replaceAll("\\", "/")});
  const {ensureRuntimeDatabaseReady} = require("../dist/db/runtimeMigrations");
  const {prisma} = require("../dist/db/prisma");
  await ensureRuntimeDatabaseReady();
  const {novelCreateResourceRecommendationService: recommendations} = require("../dist/services/novel/NovelCreateResourceRecommendationService");
  t.mock.method(recommendations, "resolveRequired", async () => ({}));
  const server = require("../dist/app").createApp().listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await new Promise(resolve => {server.closeAllConnections(); server.close(resolve);});
    await prisma.$disconnect();
  });
  const post = async (route, body) => {
    const response = await fetch("http://127.0.0.1:" + server.address().port + "/api/" + route,
      {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)});
    return {status: response.status, body: await response.json()};
  };
  const taskId = "manual-create-" + "a".repeat(32);
  const bootstrap = () => post("novel-workflows/bootstrap", {workflowTaskId: taskId, lane: "manual_create", seedPayload: {basicForm: {title: "原稿"}}});
  for (const result of await Promise.all([bootstrap(), bootstrap()])) {
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.equal(result.body.data.id, taskId);
  }
  await prisma.$executeRawUnsafe(`CREATE TRIGGER fail_test_attachment BEFORE UPDATE OF novelId ON NovelWorkflowTask
    WHEN NEW.title = '模拟关联失败' BEGIN SELECT RAISE(ABORT, 'test attachment error'); END`);
  const open = (title, id = taskId) => post("novels", {title, manualWorkflowTaskId: id});
  const rejected = await open("模拟关联失败");
  assert.ok(rejected.status >= 400);
  assert.equal(await prisma.novel.count(), 0);
  assert.equal((await prisma.novelWorkflowTask.findUniqueOrThrow({where: {id: taskId}})).novelId, null);

  const books = await Promise.all([open("保留的书"), open("保留的书")]);
  const replay = await open("响应丢失后重试");
  for (const result of [...books, replay]) {
    assert.equal(result.status, 201, JSON.stringify(result.body));
    assert.equal(result.body.data.id, books[0].body.data.id);
    assert.equal(result.body.data.title, "保留的书");
  }
  assert.equal(await prisma.novel.count(), 1);
  assert.equal(await prisma.novelWorkflowTask.count(), 1);
  const saved = await prisma.novelWorkflowTask.findUniqueOrThrow({where: {id: taskId}});
  assert.equal(saved.novelId, replay.body.data.id);
  assert.equal(JSON.parse(saved.resumeTargetJson).taskId, taskId);

  await prisma.novelWorkflowTask.create({data: {id: "other-lane", lane: "auto_director", title: "另一个任务"}});
  assert.equal((await open("不能关联", "other-lane")).status, 404);
  assert.equal(await prisma.novel.count(), 1);
  const legacy = await prisma.novelWorkflowTask.create({data: {lane: "manual_create", title: "历史任务", novelId: saved.novelId}});
  assert.equal((await open("恢复旧任务", legacy.id)).body.data.id, saved.novelId);
});
