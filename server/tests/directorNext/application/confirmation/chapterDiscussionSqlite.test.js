const { before, after, test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { once } = require("node:events");
const dir = require("node:fs").mkdtempSync(path.join(require("node:os").tmpdir(), "director-chapter-chat-"));
Object.assign(process.env, {
  AI_NOVEL_RUNTIME: "desktop",
  AI_NOVEL_APP_DATA_DIR: dir,
  DATABASE_URL: "file:" + path.join(dir, "test.db").replaceAll("\\", "/"),
});
const { prisma } = require("../../../../dist/db/prisma");
const { ensureRuntimeDatabaseReady } = require("../../../../dist/db/runtimeMigrations");
const { createDirectorNextServices } = require("../../../../dist/modules/director");
const { mountDirectorNext } = require("../../../../dist/modules/director/http");
const { PrismaRunRepository, PrismaArtifactLedger } = require("../../../../dist/modules/director/infrastructure");
const { createDirectorProductionOptions } = require("../../../../dist/app/director/productionComposition");
const { chapterConversationRouter } = require("../../../../dist/app/director/revisions/chapterReview");
const { readDirectorWorkspace } = require("../../../../dist/app/director/workspace");
const {
  chapterReviewForm,
  chapterEditFromDraft,
  sceneFieldKey,
} = require("@ai-novel/shared/types/director/chapterReview/discussion");
const { NovelVolumeService } = require("../../../../dist/services/novel/volume/NovelVolumeService");
const options = createDirectorProductionOptions(),
  services = createDirectorNextServices(options);
const runs = new PrismaRunRepository(),
  ledger = new PrismaArtifactLedger();
let server, root;
before(async () => {
  await ensureRuntimeDatabaseReady();
  const express = require("express"),
    app = express();
  app.use(express.json({ limit: "2mb" }));
  mountDirectorNext(app, services.http);
  app.use("/api/director-next", chapterConversationRouter());
  app.use(require("../../../../dist/middleware/errorHandler").errorHandler);
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  root = "http://127.0.0.1:" + server.address().port + "/api/director-next";
});
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
});

async function fixture(novelId) {
  const runId = "run-" + novelId,
    volumeId = novelId + "-v";
  await prisma.novel.create({
    data: { id: novelId, title: "追查旧信", directorVersion: "v2", estimatedChapterCount: 12 },
  });
  const sceneCards = JSON.stringify({
    targetWordCount: 2400,
    scenes: [1, 2, 3].map((i) => ({
      key: "scene" + i,
      title: "核对证词" + i,
      purpose: "核对证词",
      entryState: "证词有缺口",
      exitState: "发现证据",
      resistance: "证人犹豫",
      turn: "找到证物",
      targetWordCount: 800,
      mustPreserve: ["保留证人身份"],
      mustAdvance: ["核实旧信"],
      forbiddenExpansion: [],
    })),
  });
  const chapters = [1, 2, 3].map((i) => ({
    id: novelId + "-p" + i,
    chapterOrder: i,
    title: "来信" + i,
    summary: "在邮局查访失踪的证人",
    purpose: "核实线索",
    exclusiveEvent: "取得信件" + i,
    endingState: "找到旧地址",
    nextChapterEntryState: "前往旧址",
    conflictLevel: 40,
    revealLevel: 35,
    targetWordCount: 2400,
    mustAvoid: "保留身份",
    taskSheet: "核对证词" + i,
    sceneCards,
  }));
  await new NovelVolumeService().updateVolumesWithOptions(
    novelId,
    { volumes: [{ id: volumeId, sortOrder: 1, title: "旧址", chapters }] },
    { syncPayoffLedger: false, emitEvent: false, syncToChapterExecution: false },
  );
  const contract = options.contractFactory({
    runId,
    novelId,
    driver: "assisted",
    stepIdsInScope: ["chapter_detail_bundle", "execution_contract_sync", "chapter_batch"],
    launchInput: {
      storyInput: "失踪证人留下的旧信",
      estimatedChapterCount: 12,
      worldMode: "skip",
      targetMode: "selected_volume",
      targetVolumeId: volumeId,
      executionRange: { from: 2, to: 3 },
      provider: "openai",
      model: "fixture",
    },
  });
  contract.executionEpoch = 0;
  await runs.open(contract);
  await runs.transition(runId, { type: "start" }, 0);
  for (const [type, status] of [
    ["volume_chapter_list", "confirmed"],
    ["chapter_task_sheet", "draft"],
  ]) {
    await ledger.record({
      novelId,
      type,
      scope: contract.scope,
      status,
      protectedUserContent: false,
      contentRef: type,
      contentHash: "fixture",
      producedByRunId: runId,
    });
  }
  await runs.transition(runId, { type: "open_gate", gateId: "detail", artifactTypes: ["chapter_task_sheet"] }, 1);
  const book = await readDirectorWorkspace(novelId),
    planVersionId = book.planning.activeVersionId;
  assert.deepEqual(
    book.reviewContexts[0].chapterPlans.map((c) => c.chapterOrder),
    [2, 3],
  );
  const plans = book.planning.volumes[0].chapters;
  const url = (id, version = planVersionId) =>
    root +
    "/novels/" +
    novelId +
    "/runs/" +
    runId +
    "/chapter-review/2/plans/" +
    version +
    "/chapters/" +
    id +
    "/conversation";
  const confirm = (key, chapterPlanEdit, decision = "confirm_after_edit") =>
    post(root + "/commands", {
      runId,
      type: "resolve_gate",
      expectedVersion: 2,
      decision,
      chapterPlanEdit,
      idempotencyKey: runId + key,
    });
  return {
    novelId,
    runId,
    plans,
    url,
    confirm,
    approval: { planVersionId, approveForProse: book.chapterReviewFingerprint },
  };
}
const post = (url, body) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
async function finished(url, id) {
  for (let i = 0; i < 150; i++) {
    const { data } = await (await fetch(url)).json(),
      turn = data.find((row) => row.id === id);
    if (turn && turn.status !== "running") return turn;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail("chapter discussion did not finish");
}
async function tickUntilGate(runId) {
  for (let i = 0; i < 6 && (await runs.getControl(runId)).status === "running"; i++) await services.worker.tick();
  return runs.getControl(runId);
}
test("review of a non-opening chapter reaches the prose step only with the saved scene and task choices", async (t) => {
  const { novelId, runId, plans, url, confirm, approval } = await fixture("selected");
  const [outside, other, chapter] = plans,
    form = chapterReviewForm(chapter),
    otherForm = chapterReviewForm(other);
  const turnKey = sceneFieldKey("scene2", "turn"),
    newTurn = "证人交出会牵连自己的账册",
    requests = [];
  const runner = require("../../../../dist/prompting/core/promptRunner");
  t.mock.method(runner, "runStructuredPrompt", async (call) => {
    assert.equal(call.asset.id, "novel.director.chapter_dialogue");
    assert.equal(call.options.taskId, runId);
    requests.push(call.promptInput);
    return {
      output: {
        replyText: "让证人自己决定是否交出账册。",
        changes:
          requests.length === 1
            ? [
                { target: "scene", sceneKey: "scene2", field: "turn", value: newTurn, reason: "把代价放在选择上" },
                { target: "chapter", field: "mustAvoid", value: "放弃保密", reason: "另一种写法" },
              ]
            : [],
      },
    };
  });
  const origGet = options.stepRegistry.get.bind(options.stepRegistry),
    writing = [];
  t.mock.method(options.stepRegistry, "get", (id) =>
    id !== "chapter_batch"
      ? origGet(id)
      : async (ctx) => {
          writing.push(
            ...(await prisma.chapter.findMany({
              where: { novelId, order: { gte: 2, lte: 3 } },
              orderBy: { order: "asc" },
            })),
          );
          return {
            artifact: {
              scope: ctx.contract.scope,
              status: "draft",
              protectedUserContent: false,
              contentHash: "fixture-body",
              contentRef: "fixture-body",
            },
          };
        },
  );
  const send = (id, body) => post(url(id) + "/turns", body);
  const first = {
    requestId: "scene-first",
    requestText: "加强第二场转折",
    base: form.fields,
    draft: { ...form.fields, taskSheet: "追查账册" },
  };
  assert.equal((await fetch(url(outside.id))).status, 404);
  assert.equal((await fetch(url(chapter.id, "wrong-version"))).status, 409);
  assert.equal((await send(chapter.id, first)).status, 202);
  const turn = await finished(url(chapter.id), first.requestId);
  assert.equal(turn.status, "completed", turn.replyText);
  assert.equal(turn.result.changes[0].field, turnKey);
  assert.equal(turn.result.changes[0].before, form.fields[turnKey]);
  assert.equal(requests[0].chapter.order, 3);
  assert.equal(requests[0].chapter.exclusiveEvent, "取得信件3");
  assert.equal(requests[0].chapter.nextChapterEntryState, "前往旧址");
  assert.equal(requests[0].editor.taskSheet, "追查账册");
  const follow = {
    ...first,
    requestId: "why",
    parentResultId: turn.result.id,
    requestText: "这个选择的代价是什么？",
    draft: { ...first.draft, [turnKey]: newTurn },
  };
  assert.equal((await send(other.id, { ...follow, base: otherForm.fields, draft: otherForm.fields })).status, 409);
  assert.deepEqual((await (await fetch(url(other.id))).json()).data, []);
  assert.equal((await send(chapter.id, follow)).status, 202);
  assert.equal((await finished(url(chapter.id), "why")).result, null);
  assert.equal(requests[1].history[0].author, first.requestText);
  assert.equal((await runs.getControl(runId)).status, "waiting_gate");
  const read = (id) => prisma.volumeChapterPlan.findUniqueOrThrow({ where: { id } });
  const before = await read(chapter.id);
  assert.notEqual(JSON.parse(before.sceneCards).scenes[1].turn, newTurn);
  const edit = chapterEditFromDraft(form, follow.draft).data;
  const edits = [
    { chapterId: chapter.id, edit },
    { chapterId: other.id, edit: chapterEditFromDraft(otherForm, { ...otherForm.fields, mustAvoid: "保留信封" }).data },
  ];
  for (const [key, patch] of [
    ["stale", { ...edits[1], edit: { ...edits[1].edit, baseRevision: "stale" } }],
    ["outside", { ...edits[1], chapterId: outside.id }],
  ]) {
    assert.equal((await confirm(key, { ...approval, chapters: [edits[0], patch] })).status, 409);
    assert.deepEqual(await read(chapter.id), before);
  }
  assert.deepEqual(writing, []);
  const approved = { ...approval, chapters: edits };
  const receipt = await confirm("approved", approved);
  assert.equal(receipt.status, 202, await receipt.text());
  assert.equal((await confirm("approved", approved)).status, 202);
  assert.equal((await fetch(url(chapter.id))).status, 409);
  const next = await tickUntilGate(runId);
  assert.deepEqual(
    next.gate?.artifactTypes,
    ["chapter_batch_closed"],
    JSON.stringify({ next, events: await services.http.eventLog.list(runId) }),
  );
  assert.deepEqual(
    writing.map((row) => row.order),
    [2, 3],
  );
  assert.equal(writing[0].mustAvoid, "保留信封");
  assert.equal(writing[1].taskSheet, "追查账册");
  assert.equal(writing[1].mustAvoid, form.fields.mustAvoid);
  const scenes = JSON.parse(writing[1].sceneCards).scenes;
  assert.equal(scenes[1].turn, newTurn);
  assert.equal(scenes[0].turn, "找到证物");
  assert.deepEqual(scenes[1].mustPreserve, ["保留证人身份"]);
  assert.equal((await read(outside.id)).taskSheet, outside.taskSheet);
});
test("approval of an unchanged draft is scoped to that exact batch, with manual review if it changes before sync", async () => {
  const { runId, plans, approval, confirm } = await fixture("drift");
  assert.equal(
    (await confirm("old", { ...approval, chapters: [], approveForProse: "f".repeat(64) }, "confirm")).status,
    409,
  );
  const result = await confirm("original", { ...approval, chapters: [] }, "confirm");
  assert.equal(result.status, 202, await result.text());
  await prisma.volumeChapterPlan.update({ where: { id: plans[2].id }, data: { taskSheet: "随后修改的任务" } });
  const next = await tickUntilGate(runId);
  assert.deepEqual(next.gate?.artifactTypes, ["chapter_execution_contract"], JSON.stringify(next));
  assert.equal((await ledger.listByNovel("drift")).find((a) => a.type === "chapter_task_sheet").status, "confirmed");
});
