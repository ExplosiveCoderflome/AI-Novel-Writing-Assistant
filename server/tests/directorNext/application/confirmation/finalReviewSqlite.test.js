const { before, after, test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os");
const { once } = require("node:events");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "director-final-review-"));
Object.assign(process.env, {
  AI_NOVEL_RUNTIME: "desktop",
  AI_NOVEL_APP_DATA_DIR: dir,
  DATABASE_URL: "file:" + path.join(dir, "review.db").replaceAll("\\", "/"),
});
const { prisma } = require("../../../../dist/db/prisma");
const { ensureRuntimeDatabaseReady } = require("../../../../dist/db/runtimeMigrations");
const { finalReviewRouter } = require("../../../../dist/app/director/finalReview");
const runner = require("../../../../dist/prompting/core/promptRunner");
const { proseParagraphs } = require("@ai-novel/shared/types/director/proseReview/discussion");
const { novelExportService } = require("../../../../dist/modules/export");
let server, root;
before(async () => {
  await ensureRuntimeDatabaseReady();
  const express = require("express"),
    app = express();
  app.use(express.json());
  app.use("/api/director-next", finalReviewRouter());
  app.use(require("../../../../dist/middleware/errorHandler").errorHandler);
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  root = "http://127.0.0.1:" + server.address().port + "/api/director-next/novels/";
});
after(async () => {
  if (server) await new Promise((done) => server.close(done));
  await prisma.$disconnect();
});
const post = (url, data = {}) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
const get = async (url) => {
  const r = await fetch(url);
  assert.equal(r.status, 200);
  return (await r.json()).data;
};
async function seed(id) {
  await prisma.novel.create({
    data: { id, title: "失钥", estimatedChapterCount: 3, directorVersion: "v2", description: "保管人归还钥匙。" },
  });
  for (const [index, content] of [
    "钥匙落进了井里。",
    "　空手回家。\r\n\r\n　她拿出钥匙。\r\n　她拿出钥匙。\r\n",
    "她在井边揭开了真相。",
  ].entries()) {
    await prisma.chapter.create({
      data: {
        id: id + index,
        novelId: id,
        title: "来信" + index,
        order: index + 1,
        content,
        chapterStatus: "completed",
        generationState: "approved",
      },
    });
  }
  return root + id + "/final-review";
}
test("a completed V2 book reviews every chapter, discusses one evidenced issue and exports only the author's accepted paragraphs", async (t) => {
  const url = await seed("finished");
  const report = await prisma.auditReport.create({
    data: {
      novelId: "finished",
      chapterId: "finished1",
      auditType: "continuity",
      issues: {
        create: {
          auditType: "continuity",
          code: "key",
          severity: "medium",
          description: "钥匙去向",
          evidence: "拿出钥匙",
          fixSuggestion: "交代钥匙的位置",
        },
      },
    },
  });
  const book = await get(url);
  assert.deepEqual(
    book.chapters.map((c) => c.findings),
    [null, null, null],
  );
  const [first, second, last] = book.chapters;
  const addr = (c) => url + "/chapters/" + c.id + "/" + c.sourceHash;
  assert.equal((await fetch(url + "/exports/" + book.version)).status, 409);
  await assert.rejects(() => novelExportService.buildExportContent("finished", "txt"), { statusCode: 409 });
  let scans = 0,
    invalid = true,
    dialogues = 0;
  const finding = {
    paragraph: 2,
    quote: "她拿出钥匙。",
    problem: "钥匙上一章落井了。",
    advice: "交代她拿出的究竟是什么。",
  };
  const {anchorFinalFindings} = require("../../../../dist/app/director/finalReview/inspection");
  assert.throws(() => anchorFinalFindings([finding], {"1": finding.quote, "3": finding.quote}), /未能定位/);
  assert.deepEqual(anchorFinalFindings([{...finding, paragraph: 19}], {"18": finding.quote}), [{...finding, paragraph: 18}]);
  t.mock.method(runner, "runStructuredPrompt", async ({ asset, promptInput }) => {
    if (asset.id === "novel.director.final_inspection") {
      scans++;
      if (promptInput.chapter.order !== 2) return { output: { findings: [] } };
      assert.match(promptInput.previousEnding, /井/);
      assert.match(promptInput.nextOpening, /真相/);
      assert.match(promptInput.book.ending, /真相/);
      assert.match(promptInput.earlierConcerns.join(" "), /钥匙去向/);
      return { output: { findings: [{ ...finding, quote: invalid ? "无此句" : finding.quote }] } };
    }
    assert.equal(asset.id, "novel.director.prose_dialogue");
    assert.deepEqual(promptInput.finding, finding);
    assert.match(promptInput.inspectionContext.previousEnding, /井/);
    assert.equal(promptInput.chapter.order, 2);
    dialogues++;
    if (dialogues === 2) {
      assert.equal(promptInput.editor["2"], "她摸到空钥匙环。");
      assert.ok(promptInput.history.some((i) => i.author === "只改矛盾的描写"));
      return { output: { replyText: "可以保留另一处。", changes: [] } };
    }
    return {
      output: {
        replyText: "可以只改一处。",
        changes: [
          { paragraph: 2, value: "她摸到空钥匙环。", reason: "交代物件" },
          { paragraph: 1, value: "她推门进屋。", reason: "简化动作" },
        ],
      },
    };
  });
  assert.equal((await post(addr(first) + "/inspect")).status, 200);
  assert.equal((await post(addr(second) + "/inspect")).status, 422);
  assert.equal((await post(url + "/confirm", { version: book.version, edits: [] })).status, 409);
  invalid = false;
  for (const c of [first, second, last]) assert.equal((await post(addr(c) + "/inspect")).status, 200);
  assert.equal(scans, 4);
  assert.deepEqual((await get(url)).chapters[1].findings, [finding]);
  const convo = addr(second) + "/findings/0/conversation",
    form = proseParagraphs(second.content);
  const input = { requestId: "focus-on-second", requestText: "只改矛盾的描写", base: form.fields, draft: form.fields };
  async function reply(id) {
    for (let i = 0; i < 100; i++) {
      const turn = (await get(convo)).find((x) => x.id === id);
      if (turn?.status === "completed") return turn;
      if (turn?.status === "failed") assert.fail(turn.replyText);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.fail("missing reply");
  }
  assert.equal((await post(convo + "/turns", input)).status, 202);
  const change = (await reply(input.requestId)).result.changes[0];
  assert.equal(change.before, finding.quote);
  const draft = { ...form.fields, [change.field]: change.value };
  const follow = {
    ...input,
    draft,
    requestId: "ask-more",
    requestText: "另一处可以保留吗？",
    parentResultId: input.requestId,
  };
  assert.equal(
    (
      await post(addr(first) + "/findings/all/conversation/turns", {
        ...follow,
        base: proseParagraphs(first.content).fields,
        draft: proseParagraphs(first.content).fields,
      })
    ).status,
    409,
  );
  assert.equal((await post(convo + "/turns", follow)).status, 202);
  await reply(follow.requestId);
  const edited = form.render(draft),
    intent = { version: book.version, edits: [{ chapterId: second.id, content: edited }] };
  assert.equal(
    (
      await post(url + "/confirm", {
        ...intent,
        edits: [...intent.edits, { chapterId: "other-book", content: "不能保存" }],
      })
    ).status,
    409,
  );
  assert.equal((await prisma.chapter.findUniqueOrThrow({ where: { id: second.id } })).content, second.content);
  const saved = await post(url + "/confirm", intent);
  assert.equal(saved.status, 200);
  const receipt = (await saved.json()).data;
  const repeated = await post(url + "/confirm", intent);
  assert.deepEqual((await repeated.json()).data, receipt);
  const file = await fetch(url + "/exports/" + receipt.confirmedVersion);
  assert.equal(file.status, 200);
  assert.match(file.headers.get("content-disposition"), /\.txt/);
  const txt = await file.text();
  assert.ok(txt.includes("空手回家。"));
  assert.ok(txt.includes("她摸到空钥匙环。"));
  assert.equal(txt.split("她拿出钥匙。").length - 1, 1);
  assert.ok(
    txt.indexOf(first.title) < txt.indexOf(second.title) && txt.indexOf(second.title) < txt.indexOf(last.title),
  );
  assert.equal((await novelExportService.buildExportContent("finished", "txt")).content, txt);
  assert.equal((await get(url)).confirmedVersion, receipt.confirmedVersion);
  assert.equal(await prisma.auditIssue.count({ where: { reportId: report.id, status: "open" } }), 1);
  assert.equal(
    await prisma.novelSideEffectJob.count({ where: { novelId: "finished", jobType: "chapter.manualSync" } }),
    1,
  );
  await prisma.chapter.update({ where: { id: first.id }, data: { title: "变更过的章名" } });
  assert.equal((await fetch(url + "/exports/" + receipt.confirmedVersion)).status, 409);
  assert.equal((await post(url + "/confirm", intent)).status, 409);
  await assert.rejects(() => novelExportService.buildExportContent("finished", "zip"), { statusCode: 409 });
});
test("empty findings are valid, partial books and other director versions cannot enter final review", async (t) => {
  const url = await seed("clean"),
    book = await get(url);
  t.mock.method(runner, "runStructuredPrompt", async () => ({ output: { findings: [] } }));
  for (const c of book.chapters)
    assert.equal((await post(url + "/chapters/" + c.id + "/" + c.sourceHash + "/inspect")).status, 200);
  assert.equal((await post(url + "/confirm", { version: book.version, edits: [] })).status, 200);
  await prisma.chapter.update({ where: { id: "clean2" }, data: { content: "" } });
  assert.equal((await fetch(url)).status, 409);
  await prisma.novel.update({ where: { id: "clean" }, data: { directorVersion: "v1" } });
  assert.equal((await fetch(url)).status, 409);
});
test("changing neighboring prose while the model reads discards its result and a pending director gate blocks delivery", async (t) => {
  const url = await seed("drift"),
    book = await get(url),
    middle = book.chapters[1];
  const route = url + "/chapters/" + middle.id + "/" + middle.sourceHash + "/inspect";
  t.mock.method(runner, "runStructuredPrompt", async () => {
    await prisma.chapter.update({ where: { id: "drift0" }, data: { content: "钥匙换了主人。" } });
    return { output: { findings: [] } };
  });
  assert.equal((await post(route)).status, 409);
  assert.equal(await prisma.directorFinalChapterCheck.count({ where: { chapterId: middle.id } }), 0);
  await prisma.directorNextRun.create({
    data: {
      id: "drift-run",
      novelId: "drift",
      driver: "assisted",
      planVersion: "review",
      contractJson: "{}",
      control: { create: { novelId: "drift", status: "waiting_gate" } },
    },
  });
  assert.equal((await fetch(url)).status, 409);
  assert.equal((await post(route)).status, 409);
});
