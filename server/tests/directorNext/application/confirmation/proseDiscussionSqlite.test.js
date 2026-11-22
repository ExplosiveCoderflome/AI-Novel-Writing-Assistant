const { before, after, test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { once } = require("node:events");
const dir = require("node:fs").mkdtempSync(path.join(require("node:os").tmpdir(), "director-prose-review-"));
Object.assign(process.env, {
  AI_NOVEL_RUNTIME: "desktop",
  AI_NOVEL_APP_DATA_DIR: dir,
  DATABASE_URL: "file:" + path.join(dir, "review.db").replaceAll("\\", "/"),
});
const { prisma } = require("../../../../dist/db/prisma");
const { ensureRuntimeDatabaseReady } = require("../../../../dist/db/runtimeMigrations");
const { createDirectorNextServices } = require("../../../../dist/modules/director");
const { PrismaRunRepository, PrismaArtifactLedger } = require("../../../../dist/modules/director/infrastructure");
const { mountDirectorNext } = require("../../../../dist/modules/director/http");
const { createDirectorProductionOptions } = require("../../../../dist/app/director/productionComposition");
const { proseConversationRouter } = require("../../../../dist/app/director/revisions/proseReview");
const { readDirectorWorkspace } = require("../../../../dist/app/director/workspace");
const { proseParagraphs } = require("@ai-novel/shared/types/director/proseReview/discussion");
const {
  CHAPTER_ARTIFACT_BOUNDARY_TYPE,
  buildChapterArtifactContentHash,
} = require("../../../../dist/services/novel/runtime/artifactSync");
const {
  chapterArtifactBackgroundSyncService,
} = require("../../../../dist/services/novel/runtime/ChapterArtifactBackgroundSyncService");
const {
  ChapterArtifactRecoveryService,
} = require("../../../../dist/services/novel/runtime/artifactSync/ChapterArtifactRecoveryService");
const {
  chapterArtifactDeltaOutputSchema,
} = require("../../../../dist/prompting/prompts/novel/chapterArtifactDelta.prompts");
const options = createDirectorProductionOptions(),
  services = createDirectorNextServices(options);
const runs = new PrismaRunRepository(),
  ledger = new PrismaArtifactLedger();
let server, root;
before(async () => {
  await ensureRuntimeDatabaseReady();
  const express = require("express"),
    app = express();
  app.use(express.json());
  mountDirectorNext(app, services.http);
  app.use("/api/director-next", proseConversationRouter());
  app.use(require("../../../../dist/middleware/errorHandler").errorHandler);
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  root = "http://127.0.0.1:" + server.address().port + "/api/director-next";
});
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
});
async function fixture(novelId, target = 6) {
  await prisma.novel.create({
    data: { id: novelId, title: "转身", directorVersion: "v2", directorEpoch: 2, estimatedChapterCount: target },
  });
  const runId = novelId + "-run",
    range = { from: 2, to: 3 };
  const contract = options.contractFactory({
    runId,
    novelId,
    driver: "assisted",
    stepIdsInScope: ["chapter_batch"],
    launchInput: {
      storyInput: "查明证词的去向",
      worldMode: "skip",
      targetMode: "opening",
      estimatedChapterCount: target,
      executionRange: range,
      provider: "openai",
      model: "fixture",
    },
  });
  contract.executionEpoch = 2;
  await runs.open(contract);
  await runs.transition(runId, { type: "start" }, 0);
  for (const order of [1, 2, 3]) {
    const content = "　门开了。\r\n\r\n　他停下来。\r\n　他停下来。\r\n";
    const chapter = await prisma.chapter.create({
      data: {
        id: novelId + "c" + order,
        novelId,
        order,
        title: "证人" + order,
        content,
        generationState: "approved",
        chapterStatus: "completed",
      },
    });
    await prisma.chapterArtifactSyncCheckpoint.create({
      data: {
        novelId,
        chapterId: chapter.id,
        artifactType: CHAPTER_ARTIFACT_BOUNDARY_TYPE,
        status: "succeeded",
        syncMode: "fixture",
        contentHash: buildChapterArtifactContentHash(content),
        metadataJson: JSON.stringify({ outcome: "completed", completedArtifacts: ["artifact_delta"] }),
      },
    });
  }
  for (const [type, status] of [
    ["chapter_execution_contract", "confirmed"],
    ["chapter_batch_closed", "draft"],
  ]) {
    await ledger.record({
      novelId,
      type,
      scope: contract.scope,
      status,
      protectedUserContent: false,
      contentRef: type,
      contentHash: "seed",
      producedByRunId: runId,
    });
  }
  await runs.transition(runId, { type: "open_gate", gateId: "batch", artifactTypes: ["chapter_batch_closed"] }, 1);
  const book = await readDirectorWorkspace(novelId);
  const chapters = book.chapters.filter((c) => c.order >= 2);
  const review = { chapters: chapters.map((c) => ({ chapterId: c.id, baseHash: book.proseReviewHashes[c.id] })) };
  const url = (id, hash = book.proseReviewHashes[id]) =>
    root +
    "/novels/" +
    novelId +
    "/runs/" +
    runId +
    "/prose-review/2/versions/" +
    hash +
    "/chapters/" +
    id +
    "/conversation";
  const confirm = (key, review) =>
    post(root + "/commands", {
      type: "resolve_gate",
      runId,
      expectedVersion: 2,
      decision: review.chapters.some((c) => c.content !== undefined) ? "confirm_after_edit" : "confirm",
      proseReview: review,
      idempotencyKey: runId + key,
    });
  return {
    runId,
    novelId,
    chapters,
    review,
    url,
    confirm,
    books: () => prisma.directorNextRun.findMany({ where: { novelId } }),
  };
}
const post = (url, body) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
async function turn(url, id) {
  for (let i = 0; i < 200; i++) {
    const res = await fetch(url);
    assert.equal(res.status, 200);
    const item = (await res.json()).data.find((row) => row.id === id);
    if (item && item.status !== "running") return item;
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
  assert.fail("discussion did not finish");
}
test("a chosen paragraph in chapter three is synchronized before the authorized next batch is queued", async (t) => {
  const f = await fixture("review"),
    [second, third] = f.chapters;
  const story = proseParagraphs(third.content),
    url = f.url(third.id),
    calls = [];
  const runner = require("../../../../dist/prompting/core/promptRunner");
  t.mock.method(runner, "runStructuredPrompt", async (req) => {
    assert.equal(req.asset.id, "novel.director.prose_dialogue");
    calls.push(req.promptInput);
    return {
      output: {
        replyText: "让停顿带出迟疑。",
        changes:
          calls.length === 1
            ? [
                { paragraph: 2, value: "他握住门闩。", reason: "动作代替解释" },
                { paragraph: 1, value: "门被推开了。", reason: "另一种开场" },
                { paragraph: 3, value: story.fields["3"], reason: "保留原句" },
              ]
            : [],
      },
    };
  });
  const base = { requestId: "prose-turn", requestText: "调整第二段", base: story.fields, draft: story.fields };
  assert.equal((await fetch(f.url("reviewc1", f.review.chapters[0].baseHash))).status, 404);
  assert.equal((await fetch(f.url(third.id, "0".repeat(64)))).status, 409);
  assert.equal((await post(url + "/turns", base)).status, 202);
  const reply = await turn(url, base.requestId);
  assert.equal(reply.status, "completed", reply.replyText);
  assert.match(reply.replyText, /1 项建议与当前稿一致，另有 2 项修改/);
  assert.equal(reply.result.changes.length, 2);
  const picked = reply.result.changes[0],
    draft = { ...story.fields, [picked.field]: picked.value };
  assert.equal(picked.before, "他停下来。");
  assert.equal(calls[0].chapter.order, 3);
  const follow = { ...base, requestId: "follow-up", parentResultId: reply.result.id, requestText: "为什么？", draft };
  assert.equal((await post(f.url(second.id) + "/turns", follow)).status, 409);
  assert.equal((await post(url + "/turns", follow)).status, 202);
  assert.equal((await turn(url, follow.requestId)).result, null);
  assert.equal(calls[1].editor["2"], picked.value);
  assert.equal(calls[1].history[0].author, "调整第二段");
  assert.equal((await f.books()).length, 1);
  const content = story.render(draft);
  assert.equal(content, "　门开了。\r\n\r\n　他握住门闩。\r\n　他停下来。\r\n");
  const review = {
    chapters: [f.review.chapters[0], { ...f.review.chapters[1], content }],
    nextRange: { from: 4, to: 6 },
  };
  const stale = {
    chapters: [
      { ...f.review.chapters[0], content: "不应写入" },
      { ...f.review.chapters[1], baseHash: "0".repeat(64) },
    ],
  };
  assert.equal((await f.confirm("stale", stale)).status, 409);
  assert.equal((await prisma.chapter.findUnique({ where: { id: second.id } })).content, second.content);
  assert.equal((await f.confirm("wrong-range", { ...review, nextRange: { from: 5, to: 6 } })).status, 409);
  let fail = true;
  const delta = {
    async extractChapterArtifacts(input) {
      if (fail) throw Error("延后同步");
      assert.equal(input.content, content);
      return {
        contentHash: buildChapterArtifactContentHash(content),
        output: chapterArtifactDeltaOutputSchema.parse({
          summary: "证人迟疑",
          stateDeltas: {},
          syncPlan: { reason: "正文修改" },
          confidence: 0.9,
        }),
      };
    },
    async applyChapterArtifactConsumer() {
      return {};
    },
    toSyncResult(extracted, aggregate) {
      return { ...extracted, ...aggregate, requiresFullReconcile: false };
    },
  };
  t.mock.method(
    chapterArtifactBackgroundSyncService,
    "getArtifactRecoveryService",
    () => new ChapterArtifactRecoveryService({ deltaService: delta, prepareCandidates: async (_input, out) => out }),
  );
  t.mock.method(chapterArtifactBackgroundSyncService, "shouldRunPayoffFullReconcile", async () => false);
  const failed = await f.confirm("save", review);
  assert.equal(failed.status, 409, await failed.text());
  assert.equal((await runs.getControl(f.runId)).status, "waiting_gate");
  assert.equal((await f.books()).length, 1);
  assert.equal((await prisma.chapter.findUnique({ where: { id: third.id } })).content, content);
  fail = false;
  const saved = await f.confirm("save", review);
  assert.equal(saved.status, 202, await saved.text());
  assert.equal((await f.confirm("save", review)).status, 202);
  assert.equal((await f.confirm("save", { ...review, nextRange: undefined })).status, 400);
  assert.equal((await fetch(url)).status, 409);
  const books = await f.books();
  assert.equal(books.length, 2);
  const next = JSON.parse(books.find((book) => book.id !== f.runId).contractJson);
  assert.deepEqual(next.chapterRange, review.nextRange);
  assert.equal(next.executionEpoch, 2);
  assert.equal(next.driver, "assisted");
  assert.equal(next.launchInput.model, "fixture");
  assert.equal((await runs.getControl(f.runId)).status, "completed");
  assert.equal((await runs.getControl(next.runId)).status, "queued");
  assert.equal(
    (await ledger.listByNovel(f.novelId)).find((a) => a.type === "chapter_batch_closed").protectedUserContent,
    true,
  );
  assert.equal(
    await prisma.novelSideEffectJob.count({ where: { novelId: f.novelId, jobType: "chapter.manualSync" } }),
    1,
  );
  // Supply a prepared next window and capture the body that the next writing step can actually read.
  for (const step of options.plan.steps.filter((step) => step.id !== "chapter_batch")) {
    await ledger.record({
      novelId: f.novelId,
      scope: next.scope,
      type: step.produces,
      status: "confirmed",
      protectedUserContent: false,
      producedByRunId: next.runId,
      contentHash: "prepared",
      contentRef: "prepared",
    });
  }
  let priorText;
  const getStep = options.stepRegistry.get.bind(options.stepRegistry);
  t.mock.method(options.stepRegistry, "get", (id) =>
    id !== "chapter_batch"
      ? getStep(id)
      : async (context) => {
          assert.equal(context.runId, next.runId);
          priorText = (await prisma.chapter.findUniqueOrThrow({ where: { id: third.id } })).content;
          return {
            artifact: {
              scope: next.scope,
              status: "draft",
              protectedUserContent: false,
              contentRef: "next-batch",
              contentHash: "next-batch",
            },
          };
        },
  );
  for (let i = 0; i < 6 && (await runs.getControl(next.runId)).status !== "waiting_gate"; i++)
    await services.worker.tick();
  assert.equal(priorText, content);
  assert.deepEqual((await runs.getControl(next.runId)).gate.artifactTypes, ["chapter_batch_closed"]);
});
test("confirming only the saved batch and reaching the last chapter never start another run", async () => {
  for (const [id, target] of [
    ["stop", 6],
    ["finished", 3],
  ]) {
    const f = await fixture(id, target);
    if (target === 3)
      assert.equal((await f.confirm("beyond", { ...f.review, nextRange: { from: 4, to: 4 } })).status, 409);
    const res = await f.confirm("confirm", f.review);
    assert.equal(res.status, 202, await res.text());
    for (let i = 0; i < 4 && (await runs.getControl(f.runId)).status === "running"; i++) await services.worker.tick();
    assert.equal((await runs.getControl(f.runId)).status, "completed");
    assert.equal((await f.books()).length, 1);
  }
});
