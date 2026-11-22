const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
const { once } = require("node:events");
const { setTimeout: delay } = require("node:timers/promises");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "director-delivery-"));
Object.assign(process.env, {
  NODE_ENV: "test",
  AI_NOVEL_RUNTIME: "desktop",
  AI_NOVEL_APP_DATA_DIR: dir,
  DATABASE_URL: "file:" + path.join(dir, "book.db").replaceAll("\\", "/"),
  PRODUCTION_KERNEL_V2_CHAPTERS: "false",
  OPENAI_API_KEY: "fixture",
  OPENAI_BASE_URL: "http://127.0.0.1:1/v1",
});
const { prisma } = require("../../../dist/db/prisma");
const { ensureRuntimeDatabaseReady } = require("../../../dist/db/runtimeMigrations");
const { getDirectorProductionServices } = require("../../../dist/app/director/services");
const { mountDirectorNext } = require("../../../dist/modules/director/http");
const { PrismaRunRepository } = require("../../../dist/modules/director/infrastructure");
const { createOriginalOpeningEntry, executeOpeningCommand } = require("../../../dist/app/director/opening");
const openingRouter = require("../../../dist/services/novel/director/http/novelDirector").default;
const { castConversationRouter } = require("../../../dist/app/director/revisions/castDiscussion");
const { volumeConversationRouter } = require("../../../dist/app/director/revisions/volumeDiscussion");
const { chapterConversationRouter } = require("../../../dist/app/director/revisions/chapterReview");
const { proseConversationRouter } = require("../../../dist/app/director/revisions/proseReview");
const { finalReviewRouter } = require("../../../dist/app/director/finalReview");
const {
  chapterReviewForm,
  chapterEditFromDraft,
} = require("@ai-novel/shared/types/director/chapterReview/discussion");
const { proseParagraphs } = require("@ai-novel/shared/types/director/proseReview/discussion");
const { candidate, chosen, declined, fieldsRead, modelReply } = require("./model");
const { installWritingJob, draft } = require("./writing");

test("one assisted book carries selected edits across planning, four writing batches, inspection and the downloaded TXT", async (t) => {
  await ensureRuntimeDatabaseReady();
  const observed = { written: [], batchEdit: null },
    modelCalls = new Set();
  t.mock.method(require("../../../dist/prompting/core/promptRunner"), "runStructuredPrompt", async (call) => {
    modelCalls.add(call.asset.id);
    return { output: modelReply(call) };
  });
  installWritingJob(t, observed);
  const services = getDirectorProductionServices(),
    runs = new PrismaRunRepository();
  const express = require("express"),
    app = express();
  app.use(express.json());
  const scheduled = [];
  app.use(
    "/opening",
    createOriginalOpeningEntry({
      readTask: (id) => prisma.novelWorkflowTask.findUnique({ where: { id }, select: { novelId: true } }),
      schedule: (id) => scheduled.push(id),
    }),
    openingRouter,
  );
  mountDirectorNext(app, services.http);
  app.use(
    "/api/director-next",
    castConversationRouter(),
    volumeConversationRouter(),
    chapterConversationRouter(),
    proseConversationRouter(),
    finalReviewRouter(),
  );
  app.use(require("../../../dist/middleware/errorHandler").errorHandler);
  const server = app.listen(0, "127.0.0.1");
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await prisma.$disconnect();
  });
  await once(server, "listening");
  const addr = "http://127.0.0.1:" + server.address().port;
  async function request(url, body) {
    const res = await fetch(
      addr + url,
      body === undefined
        ? {}
        : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    );
    const raw = await res.text();
    assert.ok(res.ok, url + " " + res.status + " " + raw);
    return JSON.parse(raw).data;
  }
  async function discuss(url, args, count = 2) {
    const requestId = randomUUID();
    await request(url + "/turns", { requestId, requestText: "给我两项可分别采纳的修改", ...args });
    for (let i = 0; i < 200; i++) {
      const item = (await request(url)).find((turn) => turn.id === requestId);
      if (item && item.status !== "running") {
        assert.equal(item.status, "completed", item.replyText);
        assert.equal(item.result.changes.length, count);
        return item.result;
      }
      await delay(15);
    }
    assert.fail("讨论未结束 " + url);
  }
  const idea = "修表铺寻找失主",
    settings = {
      idea,
      provider: "openai",
      model: "fixture",
      estimatedChapterCount: 12,
      worldSetupMode: "skip",
      runMode: "stage_review",
      directorVersion: "v2",
    };
  async function openingCommand(url, body) {
    const receipt = await request(url, body);
    assert.equal(scheduled.shift(), receipt.commandId);
    await executeOpeningCommand(receipt.commandId);
    return receipt.taskId;
  }
  const taskId = await openingCommand("/opening/tasks", { taskType: "generate_candidates", payload: settings });
  const task = await prisma.novelWorkflowTask.findUniqueOrThrow({ where: { id: taskId } });
  assert.equal(task.checkpointType, "candidate_selection_required");
  const {
    batches: [batch],
  } = JSON.parse(task.seedPayloadJson);
  assert.equal(batch.candidates.length, 2);
  const selected = batch.candidates.find((c) => c.logline === candidate.logline);
  const opening =
    "/opening/tasks/" + taskId + "/batches/" + batch.id + "/candidates/" + selected.id + "/conversation";
  const proposal = await discuss(opening, { revision: 0 });
  const accepted = await request(opening + "/proposals/" + proposal.id + "/apply", { fields: ["hookStrategy"] });
  assert.deepEqual(accepted, { ...selected, hookStrategy: chosen.hook, reviewRevision: 1 });
  await openingCommand("/opening/tasks/" + taskId + "/commands", {
    commandType: "confirm_candidate",
    payload: { ...settings, batchId: batch.id, round: batch.round, candidate: accepted },
  });
  const { novelId } = await prisma.novelWorkflowTask.findUniqueOrThrow({ where: { id: taskId } });
  const api = "/api/director-next",
    book = api + "/novels/" + novelId,
    workspace = () => request(book + "/workspace");
  let runId = await runs.findActiveRunIdByNovel(novelId);
  async function until(expected) {
    for (let i = 0; i < 32; i++) {
      const state = await runs.getControl(runId);
      if (["running", "queued"].includes(state.status)) {
        await services.worker.tick();
        continue;
      }
      assert.equal(
        state.status,
        expected ? "waiting_gate" : "completed",
        JSON.stringify({
          state,
          failures: (await services.http.eventLog.list(runId)).filter((e) => e.type === "execution_failure"),
        }),
      );
      if (expected) assert.deepEqual(state.gate.artifactTypes, [expected]);
      return state.version;
    }
    assert.fail("创作未到达 " + expected);
  }
  const command = (body) => request(api + "/commands", { ...body, idempotencyKey: randomUUID() });
  const confirm = (expectedVersion, data) =>
    command({ type: "resolve_gate", decision: "confirm_after_edit", runId, expectedVersion, ...data });
  const scope = () => book + "/runs/" + runId;
  for (const [type, stage, resource, keys] of [
    ["character_cast", "cast", "characters", ["currentGoal", "personality", "storyFunction"]],
    ["volume_strategy", "volume", "volumes", ["summary", "mainPromise", "climax", "nextVolumeHook"]],
  ]) {
    const version = await until(type),
      view = await workspace(),
      isCast = stage === "cast";
    const row = isCast
      ? view.materials.characters.find((person) => person.name === "叶敏")
      : view.planning.volumes[0];
    const plan = view.planning.activeVersionId;
    const base = Object.fromEntries(keys.map((k) => [k, row[k] ?? ""]));
    const url =
      scope() +
      "/" +
      stage +
      "-review/" +
      version +
      (isCast ? "" : "/plans/" + plan) +
      "/" +
      resource +
      "/" +
      row.id +
      "/conversation";
    const { changes } = await discuss(url, { base, draft: base }),
      [pick, leave] = changes;
    await confirm(version, {
      assetEdit: { type, changes: [{ id: row.id, field: pick.field, before: pick.before, after: pick.value }] },
      ...(!isCast && { expectedVolumePlanVersionId: plan }),
    });
    const updated = await workspace(),
      saved = isCast ? updated.materials.characters.find((c) => c.id === row.id) : updated.planning.volumes[0];
    assert.equal(saved[pick.field], pick.value);
    assert.equal(saved[leave.field] ?? "", base[leave.field]);
  }
  await until(null);
  const planned = await workspace();
  fieldsRead(planned.continuationStoryInput, chosen.hook);
  await command({
    type: "open_run",
    novelId,
    driver: "assisted",
    stepIdsInScope: null,
    launchInput: {
      storyInput: planned.continuationStoryInput,
      worldMode: "skip",
      targetMode: "opening",
      estimatedChapterCount: 12,
      executionRange: { from: 1, to: 3 },
      provider: "openai",
      model: "fixture",
    },
  });
  const confirmed = [];
  for (let from = 1; from <= 12; from += 3) {
    runId = await runs.findActiveRunIdByNovel(novelId);
    const version = await until("chapter_task_sheet"),
      view = await workspace(),
      volume = view.planning.volumes[0];
    const chapter = volume.chapters.find((c) => c.chapterOrder === from + 2),
      form = chapterReviewForm(chapter),
      edits = [];
    if (from === 1) {
      const discussion =
        scope() +
        "/chapter-review/" +
        version +
        "/plans/" +
        view.planning.activeVersionId +
        "/chapters/" +
        chapter.id +
        "/conversation";
      const {
        changes: [scene, task],
      } = await discuss(discussion, { base: form.fields, draft: form.fields }, 3);
      const edit = chapterEditFromDraft(form, {
        ...form.fields,
        [scene.field]: scene.value,
        [task.field]: task.value,
      });
      assert.ok(edit.success);
      edits.push({ chapterId: chapter.id, edit: edit.data });
    }
    await confirm(version, {
      decision: edits.length ? "confirm_after_edit" : "confirm",
      chapterPlanEdit: {
        planVersionId: view.planning.activeVersionId,
        approveForProse: view.chapterReviewFingerprint,
        chapters: edits,
      },
    });
    const proseVersion = await until("chapter_batch_closed"),
      written = await workspace();
    const rows = written.chapters.filter((c) => c.order >= from && c.order <= from + 2);
    if (from === 1) {
      const contract = await runs.getContract(runId);
      const { readExistingAssets } = require("../../../dist/app/director/existingAssets");
      const complete = await readExistingAssets(contract);
      const mixed = await readExistingAssets({ ...contract, chapterRange: { from: 3, to: 5 } });
      for (const type of ["chapter_task_sheet", "chapter_execution_contract"]) {
        assert.ok(
          complete.some((asset) => asset.type === type && asset.usable),
          type,
        );
        assert.ok(
          !mixed.some((asset) => asset.type === type && asset.usable),
          type + " 不应由第 3 章代替第 4、5 章确认",
        );
      }
    }
    const review = rows.map((c) => ({ chapterId: c.id, baseHash: written.proseReviewHashes[c.id] }));
    for (const row of rows) {
      assert.equal(row.content, draft(row.order));
      confirmed.push({ ...row });
    }
    if (from === 1) {
      const last = rows[2],
        form = proseParagraphs(last.content);
      const url =
        scope() +
        "/prose-review/" +
        proseVersion +
        "/versions/" +
        review[2].baseHash +
        "/chapters/" +
        last.id +
        "/conversation";
      const {
        changes: [pick],
      } = await discuss(url, { base: form.fields, draft: form.fields });
      observed.batchEdit = form.render({ ...form.fields, [pick.field]: pick.value });
      review[2].content = confirmed[2].content = observed.batchEdit;
    }
    const next = (await request(api + "/runs/" + runId)).nextLaunchRange;
    assert.deepEqual(next, from === 10 ? null : { from: from + 3, to: from + 5 });
    await confirm(proseVersion, {
      decision: from === 1 ? "confirm_after_edit" : "confirm",
      proseReview: { chapters: review, ...(next && { nextRange: next }) },
    });
  }
  await until(null);
  assert.equal((await workspace()).bookCompletion.status, "completed");
  const final = book + "/final-review",
    manuscript = await request(final);
  assert.deepEqual(
    manuscript.chapters.map((c) => c.content),
    confirmed.map((c) => c.content),
  );
  const chapterUrl = (c) => final + "/chapters/" + c.id + "/" + c.sourceHash;
  for (const c of manuscript.chapters) await request(chapterUrl(c) + "/inspect", {});
  const checked = await request(final),
    third = checked.chapters[2],
    form = proseParagraphs(third.content);
  assert.ok(third.findings.length);
  const {
    changes: [pick],
  } = await discuss(chapterUrl(third) + "/findings/0/conversation", { base: form.fields, draft: form.fields });
  confirmed[2].content = form.render({ ...form.fields, [pick.field]: pick.value });
  const { confirmedVersion } = await request(final + "/confirm", {
    version: checked.version,
    edits: [{ chapterId: third.id, content: confirmed[2].content }],
  });
  const exported = await fetch(addr + final + "/exports/" + confirmedVersion);
  assert.equal(exported.status, 200);
  const expected = ["《" + accepted.workingTitle + "》", "", "【简介】", candidate.logline, ""];
  for (const c of confirmed)
    expected.push("=".repeat(48), "第" + c.order + "章 " + c.title, "-".repeat(48), c.content, "");
  const bytes = Buffer.from(await exported.arrayBuffer());
  assert.deepEqual(bytes, Buffer.from(expected.join("\n"), "utf8"));
  const ordinaryTxt = await require("../../../dist/modules/export").novelExportService.buildExportContent(
    novelId,
    "txt",
  );
  assert.deepEqual(Buffer.from(ordinaryTxt.content, "utf8"), bytes);
  assert.ok(!bytes.includes(Buffer.from(declined)));
  assert.deepEqual(
    observed.written,
    Array.from({ length: 12 }, (_, i) => i + 1),
  );
  for (const id of [
    "novel.character.castAuto",
    "novel.volume.chapter_execution_contract",
    "novel.chapter.artifact_delta.extract",
    "novel.director.final_inspection",
  ])
    assert.ok(modelCalls.has(id), id);
});
