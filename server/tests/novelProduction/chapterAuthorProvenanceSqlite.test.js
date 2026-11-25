const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

test("chapter provenance tracks manual edits, locks against overwrite, and projects to workspace", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "chapter-provenance-"));
  const script = String.raw`
const assert = require("node:assert/strict");
const { prisma } = require("./dist/db/prisma");
const { ensureRuntimeDatabaseReady } = require("./dist/db/runtimeMigrations");
const rag = require("./dist/services/novel/novelCoreSupport");
rag.queueRagUpsert = () => {};
rag.queueRagDelete = () => {};
const { NovelCoreCrudService } = require("./dist/services/novel/novelCoreCrudService");
const { readDirectorWorkspace } = require("./dist/app/director/workspace");
const { ProductionChapterLifecycleService, PrismaUnitProgressStore, hashProductionContent } = require("./dist/modules/production");
const { ProtectedProductionContentError } = require("./dist/modules/production/common");

(async () => {
  await ensureRuntimeDatabaseReady();
  await prisma.novel.create({ data: { id: "book-1", title: "测试书", estimatedChapterCount: 3 } });
  const aiChapter = await prisma.chapter.create({
    data: { id: "ch-1", novelId: "book-1", order: 1, title: "第一章", content: "AI 初稿", generationState: "approved", chapterStatus: "completed" },
  });
  const uneditedChapter = await prisma.chapter.create({
    data: { id: "ch-2", novelId: "book-1", order: 2, title: "第二章", content: "第二章 AI 正文", generationState: "drafted", chapterStatus: "completed" },
  });
  assert.equal(aiChapter.authorProvenance, "ai_generated");
  assert.equal(aiChapter.humanEditedAt, null);

  const service = new NovelCoreCrudService();
  service.volumeService.mirrorChapterIntoWorkspace = async () => {};

  const edited = await service.updateChapter("book-1", "ch-1", {
    content: "人工修改后的正文",
    expectedContent: "AI 初稿",
    expectedUpdatedAt: aiChapter.updatedAt.toISOString(),
  });
  assert.equal(edited.authorProvenance, "human_edited");
  assert.ok(edited.humanEditedAt instanceof Date);

  const locked = await service.setChapterProvenance("book-1", "ch-1", {
    locked: true,
    expectedUpdatedAt: edited.updatedAt.toISOString(),
  });
  assert.equal(locked.authorProvenance, "human_locked");

  await assert.rejects(
    () => service.setChapterProvenance("book-1", "ch-1", {
      locked: false,
      expectedUpdatedAt: edited.updatedAt.toISOString(),
    }),
    (error) => error && error.statusCode === 409,
  );

  await assert.rejects(
    () => service.updateChapter("book-1", "ch-1", {
      content: "试图直接改写已锁定章",
      expectedContent: "人工修改后的正文",
      expectedUpdatedAt: locked.updatedAt.toISOString(),
    }),
    (error) => error && error.statusCode === 409,
  );

  const lifecycle = new ProductionChapterLifecycleService();
  const unitRun = {
    id: "unit-run-1",
    ownerKey: "owner-1",
    novelId: "book-1",
    chapterId: "ch-1",
    version: 1,
    activeStage: "commit",
    activeRequestKey: "req-1",
    progress: {
      unit: { novelId: "book-1", chapterId: "ch-1", order: 1 },
      completed: ["prepare", "draft"],
      selected: "original",
      selectedContentHash: hashProductionContent("AI 试图覆盖的正文"),
    },
    artifacts: {},
    snapshots: {},
  };
  await assert.rejects(
    () => prisma.$transaction((tx) => lifecycle.commit(tx, unitRun, {
      content: "AI 试图覆盖的正文",
      expected: { content: locked.content, updatedAt: locked.updatedAt.toISOString() },
      generationState: "drafted",
      chapterStatus: "completed",
    })),
    (error) => error instanceof ProtectedProductionContentError,
  );

  const lockedAi = await service.setChapterProvenance("book-1", "ch-2", {
    locked: true,
    expectedUpdatedAt: uneditedChapter.updatedAt.toISOString(),
  });
  assert.equal(lockedAi.authorProvenance, "human_locked");

  const workspace = await readDirectorWorkspace("book-1");
  const wsCh1 = workspace.chapters.find((row) => row.id === "ch-1");
  const wsCh2 = workspace.chapters.find((row) => row.id === "ch-2");
  assert.equal(wsCh1.authorProvenance, "human_locked");
  assert.ok(wsCh1.humanEditedAt);
  assert.equal(wsCh2.authorProvenance, "human_locked");

  const unlockedEdited = await service.setChapterProvenance("book-1", "ch-1", {
    locked: false,
    expectedUpdatedAt: locked.updatedAt.toISOString(),
  });
  assert.equal(unlockedEdited.authorProvenance, "human_edited");

  const unlockedAi = await service.setChapterProvenance("book-1", "ch-2", {
    locked: false,
    expectedUpdatedAt: lockedAi.updatedAt.toISOString(),
  });
  assert.equal(unlockedAi.authorProvenance, "ai_generated");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
`;
  const serverDir = path.resolve(__dirname, "../..");
  const dbPath = path.join(directory, "test.sqlite").replace(/\\/g, "/");
  const run = spawnSync(process.execPath, ["-e", script], {
    cwd: serverDir,
    encoding: "utf8",
    env: {
      ...process.env,
      NODE_ENV: "test",
      AI_NOVEL_RUNTIME: "desktop",
      AI_NOVEL_APP_DATA_DIR: directory,
      DATABASE_URL: `file:${dbPath}`,
    },
    timeout: 120_000,
  });
  try {
    assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
