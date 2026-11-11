const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "b1-manuscript-"));
Object.assign(process.env, {
  NODE_ENV: "test",
  AI_NOVEL_RUNTIME: "desktop",
  AI_NOVEL_APP_DATA_DIR: dir,
  DATABASE_URL: `file:${path.join(dir, "b1.db")}`,
});

const { prisma } = require("../dist/db/prisma");
const { ensureRuntimeDatabaseReady } = require("../dist/db/runtimeMigrations");
const { ManuscriptImportService } = require("../dist/modules/novel/manuscript/application/ManuscriptImportService");
const service = new ManuscriptImportService();

test.before(() => ensureRuntimeDatabaseReady());
test.after(async () => { await prisma.$disconnect(); fs.rmSync(dir, { recursive: true, force: true }); });

async function readyImport(requestKey = `import-${Date.now()}-${Math.random()}`) {
  const text = "\r\n😀第一章\r\n正文\r\n第二章\r\n末尾 sentinel";
  const imported = await service.create({ bytes: Buffer.from(text), title: "原稿", narrativeForm:"long_novel", requestKey });
  const split = await service.split(imported.sessionId, 1, imported.sourceHash, "rules");
  const accepted = split.units.map(unit => ({ ...unit, needsReview: false }));
  const partition = await service.partition(imported.sessionId, split.version, imported.sourceHash, accepted);
  return { text, imported, accepted, partition };
}

test("SQLite import persists source slices, confirms atomically and replays the same novel", async () => {
  const f = await readyImport();
  const confirmed = await service.confirm(f.imported.sessionId, f.partition.version, f.imported.sourceHash, f.partition.coverage.coverageHash, "测试小说", "confirm-once");
  assert.equal(confirmed.replayed, false);
  const chapters = await prisma.chapter.findMany({ where: { novelId: confirmed.novelId }, orderBy: { order: "asc" } });
  assert.deepEqual(chapters.map(chapter => chapter.content), f.accepted.filter(unit => unit.role === "body").map(unit => f.text.slice(unit.range.start, unit.range.end)));
  assert.equal(chapters.at(-1).content.includes("末尾 sentinel"), true);
  const replay = await service.confirm(f.imported.sessionId, f.partition.version, f.imported.sourceHash, f.partition.coverage.coverageHash, "测试小说", "confirm-once");
  assert.equal(replay.novelId, confirmed.novelId);
  assert.equal(replay.replayed, true);
  await assert.rejects(() => service.confirm(f.imported.sessionId, f.partition.version, f.imported.sourceHash, f.partition.coverage.coverageHash, "另一本", "confirm-once"), /IMPORT_ALREADY_CONFIRMED/);
});

test("confirmation failures at project, source-unit and session boundaries roll back and replay", async () => {
  const faults = [
    { table: "Novel", event: "INSERT" },
    { table: "Chapter", event: "INSERT" },
    { table: "ManuscriptUnit", event: "INSERT" },
    { table: "ManuscriptProject", event: "UPDATE" },
    { table: "ManuscriptImportSession", event: "UPDATE" },
  ];
  for (const { table, event } of faults) {
    const f = await readyImport();
    const beforeNovelCount = await prisma.novel.count();
    const beforeChapterCount = await prisma.chapter.count();
    await prisma.$executeRawUnsafe(`CREATE TRIGGER fail_b1 BEFORE ${event} ON "${table}" BEGIN SELECT RAISE(ABORT, 'injected fault'); END`);
    try {
      await assert.rejects(() => service.confirm(f.imported.sessionId, f.partition.version, f.imported.sourceHash, f.partition.coverage.coverageHash, "故障书", `key-${table}`));
      assert.equal(await prisma.novel.count(), beforeNovelCount);
      assert.equal(await prisma.chapter.count(), beforeChapterCount);
      assert.equal(await prisma.manuscriptUnit.count({ where: { projectId: f.imported.projectId } }), 0);
      assert.equal((await service.get(f.imported.sessionId)).status, "ready_to_confirm");
    } finally {
      await prisma.$executeRawUnsafe("DROP TRIGGER fail_b1");
    }
    const result = await service.confirm(f.imported.sessionId, f.partition.version, f.imported.sourceHash, f.partition.coverage.coverageHash, "重试书", `retry-${table}`);
    assert.equal(result.replayed, false);
  }
});

test("same-key replay, changed payload and concurrent confirms cannot create duplicate books", async () => {
  const f = await readyImport();
  const beforeNovelCount = await prisma.novel.count();
  const args = [f.imported.sessionId, f.partition.version, f.imported.sourceHash, f.partition.coverage.coverageHash];
  const settled = await Promise.allSettled([
    service.confirm(...args, "并发书", "same-key"),
    service.confirm(...args, "并发书", "same-key"),
  ]);
  const success = settled.filter(result => result.status === "fulfilled");
  assert.equal(success.length, 2);
  assert.equal(success.filter(result => result.value.replayed).length, 1);
  assert.equal(await prisma.novel.count(), beforeNovelCount + 1);
  const session = await prisma.manuscriptImportSession.findUniqueOrThrow({ where: { id: f.imported.sessionId } });
  const replay = await service.confirm(...args, "并发书", session.confirmedRequestKey);
  assert.equal(replay.novelId, session.createdNovelId);
  assert.equal(replay.replayed, true);
  await assert.rejects(() => service.confirm(...args, "改了payload", session.confirmedRequestKey), /IMPORT_ALREADY_CONFIRMED/);
});

test("imported short story maps raw divisions to segments and revision edits preserve source and export order", async () => {
  const text="\r\n😀无标题开场\r\n\r\n第二场：雨\r\n雨落在窗沿。\r\n末尾 sentinel";
  const imported=await service.create({bytes:Buffer.from(text),title:"短篇原稿",narrativeForm:"short_story",requestKey:`short-${Date.now()}`});
  const split=await service.split(imported.sessionId,1,imported.sourceHash,"rules");
  assert.equal(split.units.some(unit=>unit.role==="body"),true);
  const confirmedUnits=split.units.map(unit=>({...unit,needsReview:false}));
  const partition=await service.partition(imported.sessionId,split.version,imported.sourceHash,confirmedUnits);
  const result=await service.confirm(imported.sessionId,partition.version,imported.sourceHash,partition.coverage.coverageHash,"短篇修订副本",`short-confirm-${Date.now()}`);
  const project=await prisma.manuscriptProject.findUniqueOrThrow({where:{id:result.projectId}});
  assert.equal(project.narrativeForm,"short_story");
  const mappings=await prisma.manuscriptUnit.findMany({where:{projectId:result.projectId},orderBy:{displayOrder:"asc"}});
  const segments=await prisma.shortStorySegment.findMany({where:{novelId:result.novelId},orderBy:{order:"asc"}});
  assert.equal(mappings.length,segments.length);
  assert.deepEqual(mappings.map(unit=>unit.segmentId),segments.map(segment=>segment.id));
  assert.deepEqual(segments.map(segment=>segment.content),confirmedUnits.filter(unit=>unit.role==="body").map(unit=>text.slice(unit.range.start,unit.range.end)));
  assert.equal(await prisma.novelWorkflowTask.count({where:{novelId:result.novelId}}),0);
  assert.equal(await prisma.novelIntentVersion.count({where:{novelId:result.novelId}}),0);
  assert.equal(await prisma.chapter.count({where:{novelId:result.novelId}}),0);
  const {ManuscriptWorkspaceService,readActiveManuscriptChapters}=require("../dist/modules/novel/manuscript/application/ManuscriptWorkspaceService");
  const workspace=await new ManuscriptWorkspaceService().byNovel(result.novelId);
  assert.equal(workspace.currentUnit.content,segments[0].content);
  assert.equal((await readActiveManuscriptChapters(prisma,result.novelId)).map(unit=>unit.content).join(""),segments.map(segment=>segment.content).join(""));
  assert.equal(await prisma.manuscriptSource.findUniqueOrThrow({where:{id:imported.sourceId}}).sourceText,text);
  assert.equal(workspace.currentUnit.originalText,text.slice(confirmedUnits.find(unit=>unit.role==="body").range.start,confirmedUnits.find(unit=>unit.role==="body").range.end));
});

test("request reuse with another source and cross-source session edits are rejected", async () => {
  const first = await service.create({ bytes: Buffer.from("第一份全文"), title: "A", narrativeForm:"long_novel", requestKey: "shared-import-key" });
  await assert.rejects(() => service.create({ bytes: Buffer.from("另一份全文"), title: "B", narrativeForm:"long_novel", requestKey: "shared-import-key" }), /REQUEST_KEY_CONFLICT/);
  const second = await service.create({ bytes: Buffer.from("第二份全文"), title: "B", narrativeForm:"long_novel", requestKey: "second-import-key" });
  await assert.rejects(() => service.partition(first.sessionId, 1, second.sourceHash, [{ draftId: "x", range: { start: 0, end: 5 }, role: "body", title: "x", needsReview: false }]), /IMPORT_VERSION_CONFLICT/);
});
