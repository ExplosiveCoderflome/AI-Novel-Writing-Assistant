const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { initializeTemporarySqliteDatabase } = require("../../testInfrastructure/tempSqliteDatabase.cjs");

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "book-delivery-"));
Object.assign(process.env, {
  DATABASE_URL: initializeTemporarySqliteDatabase(directory, "test.db"),
  NODE_ENV: "test",
  AI_NOVEL_RUNTIME: "desktop",
  AI_NOVEL_APP_DATA_DIR: directory,
});
const { prisma } = require("../../../dist/db/prisma");
const { readDirectorWorkspace } = require("../../../dist/app/director/workspace");
const { novelExportService } = require("../../../dist/modules/export/novelExport.service");
test.after(() => prisma.$disconnect());

test("whole-book delivery waits for the full directory and current confirmation", async () => {
  const novelId = "delivery-book";
  await prisma.novel.create({ data: { id: novelId, title: "完本", directorVersion: "v2", estimatedChapterCount: 3 } });
  await prisma.chapter.createMany({ data: [
    { id: "first", novelId, order: 1, title: "开篇", content: "开篇正文", chapterStatus: "completed" },
    { id: "second", novelId, order: 2, title: "中篇", content: "保存的草稿", chapterStatus: "pending_review" },
    { id: "last", novelId, order: 3, title: "结尾", content: "结尾正文", chapterStatus: "completed" },
  ] });
  await prisma.directorNextRun.create({ data: { id: "delivery-run", novelId, driver: "auto", planVersion: "test",
    contractJson: JSON.stringify({ executionEpoch: 0, launchInput: { estimatedChapterCount: 3 } }) } });
  const control = (status) => prisma.directorNextRunControl.update({ where: { runId: "delivery-run" }, data: { status } });
  await prisma.directorNextRunControl.create({ data: { novelId, runId: "delivery-run", status: "completed" } });

  const read = async () => (await readDirectorWorkspace(novelId)).bookCompletion;
  assert.deepEqual(await read(), { status: "writing", completedChapters: 2, targetChapters: 3, firstChapterId: null });
  await prisma.chapter.update({ where: { id: "second" }, data: {
    chapterStatus: "completed", riskFlags: JSON.stringify({ qualityLoop: { terminalAction: "defer_and_continue" } }),
  } });
  await control("waiting_gate");
  assert.equal((await read()).status, "needs_attention");
  await control("completed");
  assert.deepEqual(await read(), { status: "completed", completedChapters: 3, targetChapters: 3, firstChapterId: "first" });

  await prisma.chapter.update({ where: { id: "last" }, data: { order: 4 } });
  assert.equal((await read()).status, "writing", "a gap cannot be covered by a later chapter");
});

test("completion, first chapter and TXT export use the active manuscript directory", async () => {
  const novelId = "delivery-manuscript";
  await prisma.novel.create({ data: { id: novelId, title: "有效目录", directorVersion: "v1", estimatedChapterCount: 3 } });
  const projectId = "delivery-project";
  const sourceId = "delivery-source";
  await prisma.manuscriptProject.create({ data: { id: projectId, novelId, status: "confirmed" } });
  await prisma.manuscriptSource.create({ data: {
    id: sourceId, projectId, version: 1, sourceText: "已导入", rawBytes: Buffer.from("已导入"), encoding: "utf-8",
    sourceHash: "delivery-source-hash", rawHash: "delivery-raw-hash", charCount: 3,
  } });
  for (const [index, active, title] of [[1, false, "停用正文"], [2, true, "有效首章"], [3, true, "有效末章"]]) {
    const chapter = await prisma.chapter.create({ data: {
      novelId, order: active ? index : -index, title, content: title, chapterStatus: "completed",
    } });
    await prisma.manuscriptUnit.create({ data: { projectId, sourceId, chapterId: chapter.id,
      originalTitle: title, sourceOrdinal: index, sourceRangesJson: "[]", status: active ? "active" : "inactive", displayOrder: index } });
  }

  const workspace = await readDirectorWorkspace(novelId);
  assert.deepEqual(workspace.chapters.map((chapter) => chapter.title), ["有效首章", "有效末章"]);
  assert.deepEqual(workspace.bookCompletion, {
    status: "completed", completedChapters: 2, targetChapters: 2, firstChapterId: workspace.chapters[0].id,
  });
  const exported = await novelExportService.buildExportContent(novelId, "txt", "full");
  assert.match(exported.content, /第1章 有效首章/);
  assert.match(exported.content, /第2章 有效末章/);
  assert.doesNotMatch(exported.content, /停用正文/);
});
