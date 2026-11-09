const test = require("node:test");
const assert = require("node:assert/strict");
const { setup } = require("./production/persistence/sqliteFixture.cjs");
const { pauseLegacyDirectorTask } = require("../dist/services/novel/director/commands/pausing");
const { DirectorTaskStateWriter } = require("../dist/services/novel/director/state/DirectorTaskStateWriter");
const { canExecuteLegacyTask } = require("../dist/modules/novel/director-routing");

test("legacy source-page pause persists both locks without changing saved prose, payload or another task", async t => {
  const { db } = await setup(t);
  await db.novel.update({ where: { id: "novel-1" }, data: { directorVersion: "v1", directorEpoch: 0 } });
  await db.novelWorkflowTask.create({ data: { id: "pause-task", novelId: "novel-1", lane: "auto_director", title: "测试任务", directorVersion: "v1", directorEpoch: 0, status: "running", checkpointSummary: "保留检查点" } });
  const payload = JSON.stringify({ workflowTaskId: "pause-task", completedChapterIds: ["chapter-1"] });
  await db.generationJob.create({ data: { id: "pause-job", novelId: "novel-1", startOrder: 1, endOrder: 3, status: "running", payload } });
  await db.generationJob.create({ data: { id: "other-job", novelId: "novel-1", startOrder: 4, endOrder: 5, status: "running", payload: JSON.stringify({ workflowTaskId: "other-task" }) } });
  const before = await db.chapter.findUniqueOrThrow({ where: { id: "chapter-1" } });
  const deps = { db, writer: new DirectorTaskStateWriter(), canExecute: canExecuteLegacyTask };
  await pauseLegacyDirectorTask("pause-task", deps);
  const task = await db.novelWorkflowTask.findUniqueOrThrow({ where: { id: "pause-task" } });
  const job = await db.generationJob.findUniqueOrThrow({ where: { id: "pause-job" } });
  assert.equal(task.pendingManualRecovery, true);
  assert.equal(task.checkpointSummary, "保留检查点");
  assert.equal(job.pendingManualRecovery, true);
  assert.equal(job.payload, payload);
  assert.equal((await db.generationJob.findUniqueOrThrow({ where: { id: "other-job" } })).pendingManualRecovery, false);
  assert.deepEqual(await db.chapter.findUniqueOrThrow({ where: { id: "chapter-1" } }), before);
  await pauseLegacyDirectorTask("pause-task", deps);
  assert.deepEqual(await db.novelWorkflowTask.findUniqueOrThrow({ where: { id: "pause-task" } }), task);
});
