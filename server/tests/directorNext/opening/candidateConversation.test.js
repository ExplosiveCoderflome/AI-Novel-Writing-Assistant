const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { randomUUID } = require("node:crypto");
const { setTimeout: delay } = require("node:timers/promises");
const express = require("express");

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "candidate-conversation-"));
const file = path.join(directory, "review.sqlite");
Object.assign(process.env, { NODE_ENV: "test", AI_NOVEL_RUNTIME: "desktop", DATABASE_URL: "file:" + file,
  AI_NOVEL_APP_DATA_DIR: directory, DIRECTOR_NEXT_ENABLED: "true" });
const { ensureRuntimeDatabaseReady } = require("../../../dist/db/runtimeMigrations");
const { prisma } = require("../../../dist/db/prisma");
const { CandidateConversation } = require("../../../dist/modules/novel/setup/candidateReview/CandidateConversation");
const { candidateConversationRouter } = require("../../../dist/modules/novel/setup/candidateReview");
const { DirectorCommandService } = require("../../../dist/services/novel/director/commands/DirectorCommandService");
const { errorHandler } = require("../../../dist/middleware/errorHandler");

const candidate = {
  id: "direction", workingTitle: "修表铺", logline: "陌生人来修表", positioning: "小城悬疑", sellingPoint: "老店旧物",
  protagonistPath: "学徒继承老店", coreConflict: "旧案重启", hookStrategy: "匿名电话",
  progressionLoop: "追查失主", endingDirection: "失主归来", whyItFits: "适合慢热悬疑",
  toneKeywords: ["小城", "悬疑"], targetChapterCount: 80,
};
const edits = [
  { field: "hookStrategy", value: "老太太送来一块走慢的表", reason: "从日常小事引出悬念" },
  { field: "coreConflict", value: "失主与收据各执一词", reason: "让主角面对具体选择" },
];
test.before(() => ensureRuntimeDatabaseReady());
test.after(() => prisma.$disconnect());

async function fixture(invoke) {
  const taskId = randomUUID();
  const batch = { id: "first", round: 1, roundLabel: "第一轮", idea: "修表铺里的悬疑", presets: [],
    candidates: [candidate], createdAt: new Date().toISOString() };
  const other = { ...batch, id: "second", round: 2, candidates: [{ ...candidate, logline: "另一轮方向" }] };
  const seed = { idea: batch.idea, batches: [batch, other], provider: "openai", model: "fixture", runMode: "stage_review",
    resumeTarget: { route: "/novels/auto-director" }, directorRuntime: { legacy: true } };
  await prisma.$transaction(tx => tx.novelWorkflowTask.create({ data: { id: taskId, title: "开书", lane: "auto_director",
    status: "waiting_approval", checkpointType: "candidate_selection_required", directorVersion: "v2", seedPayloadJson: JSON.stringify(seed) } }));
  const service = new CandidateConversation(prisma, invoke);
  const address = { taskId, batchId: "first", candidateId: candidate.id };
  async function saved() {
    const task = await prisma.novelWorkflowTask.findUniqueOrThrow({ where: { id: taskId } });
    return JSON.parse(task.seedPayloadJson);
  }
  return { taskId, service, address, saved, seed };
}
async function finished(id) {
  for (let i = 0; i < 150; i++) {
    const turn = await prisma.agentConversationTurn.findUniqueOrThrow({ where: { id } });
    if (turn.status !== "running") return turn;
    await delay(20);
  }
  assert.fail("turn did not finish");
}
test("candidate dialogue through HTTP keeps proposals scoped, selectable and separate from confirmation", async t => {
  const inputs = [];
  const f = await fixture(async (input, options) => {
    inputs.push(input);
    assert.equal(options.model, "fixture");
    if (inputs.length === 1) return { replyText: "先看看主角为什么愿意帮忙。", changes: [] };
    return { replyText: "可以从这两个地方改起。", changes: edits };
  });
  const app = express().use(express.json()).use(candidateConversationRouter(f.service)).use(errorHandler);
  const server = await new Promise(resolve => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/tasks/${f.taskId}/batches/first/candidates/direction/conversation`;
  const post = (path, body) => fetch(url + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  async function send(text, parentResultId) {
    const input = { requestId: randomUUID(), revision: 0, requestText: text, parentResultId };
    assert.equal((await post("/turns", input)).status, 202);
    assert.equal((await finished(input.requestId)).status, "completed");
    return input;
  }
  const discussion = await send("先解释一下。");
  assert.equal((await finished(discussion.requestId)).resultId, null);
  const first = await send("换个开场。");
  const next = await send("保留修表铺，让矛盾更现实。", first.requestId);
  assert.equal(inputs[2].priorProposal.id, first.requestId);
  assert.equal(inputs[2].history.length, 2);
  assert.equal((await post("/turns", next)).status, 202);
  assert.equal(inputs.length, 3);
  assert.deepEqual(await f.saved(), f.seed);
  const history = (await (await fetch(url)).json()).data;
  assert.equal(history[1].result.status, "superseded");
  assert.equal(history[2].result.changes[0].before, candidate.hookStrategy);
  const other = { ...f.address, batchId: "second" };
  await assert.rejects(f.service.apply(other, next.requestId, ["hookStrategy"]), /找不到/);
  await assert.rejects(f.service.send(other, { ...next, requestId: randomUUID() }), /这套方向/);
  const applyUrl = "/proposals/" + next.requestId + "/apply";
  assert.equal((await post(applyUrl, { fields: ["workingTitle"] })).status, 400);
  assert.equal((await post(applyUrl, { fields: ["hookStrategy"] })).status, 200);
  assert.equal((await post(applyUrl, { fields: ["hookStrategy"] })).status, 200);
  assert.equal((await post(applyUrl, { fields: ["coreConflict"] })).status, 409);
  const saved = await f.saved();
  const adopted = { ...candidate, reviewRevision: 1, hookStrategy: edits[0].value };
  assert.deepEqual(saved.batches[0].candidates, [adopted]);
  assert.deepEqual(saved.batches[1], f.seed.batches[1]);
  assert.deepEqual(saved.resumeTarget, f.seed.resumeTarget);
  assert.deepEqual(saved.directorRuntime, f.seed.directorRuntime);
  assert.equal(await prisma.directorRunCommand.count({ where: { taskId: f.taskId } }), 0);
  assert.equal(await prisma.novel.count(), 0);
  const confirm = { workflowTaskId: f.taskId, directorVersion: "v2", runMode: "stage_review",
    idea: f.seed.idea, batchId: "first", round: 1, candidate };
  const commands = new DirectorCommandService();
  await assert.rejects(commands.enqueueConfirmCandidateCommand(confirm), /有更新/);
  await assert.rejects(commands.enqueueRefineCandidatesCommand({ workflowTaskId: f.taskId, directorVersion: "v2",
    idea: f.seed.idea, previousBatches: f.seed.batches, presets: [], feedback: "换个方向" }), /有新修改/);
  assert.deepEqual(await f.saved(), saved);
  const response = await commands.enqueueConfirmCandidateCommand({ ...confirm, candidate: adopted });
  const persisted = await prisma.directorRunCommand.findUniqueOrThrow({ where: { id: response.commandId } });
  assert.deepEqual(JSON.parse(persisted.payloadJson).confirmRequest.candidate, adopted);
});

test("racing proposals cannot both replace the same saved direction", async () => {
  const f = await fixture(async () => ({ replyText: "有两处可调整", changes: edits }));
  const ids = [randomUUID(), randomUUID()];
  for (const id of ids) {
    await f.service.send(f.address, { requestId: id, requestText: "讨论开场", revision: 0 });
    assert.equal((await finished(id)).status, "completed");
  }
  const decisions = await Promise.allSettled(ids.map(id => f.service.apply(f.address, id, ["hookStrategy"])));
  assert.equal(decisions.filter(result => result.status === "fulfilled").length, 1);
  assert.deepEqual((await f.service.history(f.address)).map(item => item.result.status).sort(), ["applied", "stale"]);
  assert.equal((await f.saved()).batches[0].candidates[0].reviewRevision, 1);
});

test("an adoption between direction preparation and command acceptance wins over the stale batch", async t => {
  const f = await fixture(async () => ({ replyText: "换个开场", changes: edits }));
  const id = randomUUID();
  await f.service.send(f.address, { requestId: id, requestText: "改开场", revision: 0 });
  assert.equal((await finished(id)).status, "completed");
  const commands = new DirectorCommandService();
  const enqueue = commands.enqueueExecutionCommand.bind(commands);
  const gap = t.mock.method(commands, "enqueueExecutionCommand", async input => {
    await f.service.apply(f.address, id, ["hookStrategy"]);
    return enqueue(input);
  });
  const request = { workflowTaskId: f.taskId, directorVersion: "v2", runMode: "stage_review",
    provider: "openai", model: "fixture", idea: f.seed.idea, previousBatches: f.seed.batches, presets: [], feedback: "换个节奏" };
  await assert.rejects(commands.enqueueRefineCandidatesCommand(request), /有更新/);
  assert.equal(await prisma.directorRunCommand.count({ where: { taskId: f.taskId } }), 0);
  gap.mock.restore();
  const { batches } = await f.saved();
  assert.equal(batches[0].candidates[0].reviewRevision, 1);
  const fresh = await commands.enqueueRefineCandidatesCommand({ ...request, previousBatches: batches });
  assert.ok(fresh.commandId);
});

test("interruption and leaving candidate selection fence late model results", async () => {
  for (const interrupt of [true, false]) {
    let release;
    const deferred = new Promise(resolve => { release = resolve; });
    let started;
    const ready = new Promise(resolve => { started = resolve; });
    const f = await fixture(async () => { started(); return deferred; });
    const input = { requestId: randomUUID(), revision: 0, requestText: "调整开场" };
    await f.service.send(f.address, input);
    await ready;
    await assert.rejects(f.service.send(f.address, { ...input, requestId: randomUUID() }), /正在处理/);
    if (interrupt) await f.service.interrupt(f.address, input.requestId);
    else await prisma.novelWorkflowTask.update({ where: { id: f.taskId }, data: { status: "queued" } });
    release({ replyText: "读完了", changes: edits });
    assert.equal((await finished(input.requestId)).status, interrupt ? "interrupted" : "failed");
    assert.equal(await prisma.openingCandidateProposal.count({ where: { id: input.requestId } }), 0);
    assert.deepEqual(await f.saved(), f.seed);
  }
});
