const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hydration-preserved-"));
Object.assign(process.env, { NODE_ENV: "test", AI_NOVEL_RUNTIME: "desktop", AI_NOVEL_APP_DATA_DIR: dir, DATABASE_URL: "file:" + path.join(dir, "hydration.db"), DIRECTOR_NEXT_ENABLED: "true" });
const { prisma } = require("../dist/db/prisma");
const { ensureRuntimeDatabaseReady } = require("../dist/db/runtimeMigrations");
const { OutlineOpenBookService } = require("../dist/modules/planning/outline/openBook");
const { createEmptyOutlineDocument } = require("@ai-novel/shared/types/outline");
const { NovelVolumeService } = require("../dist/services/novel/volume/NovelVolumeService.js");
let n = 0;
async function boundNovel() {
  const id = "p" + (++n), d = createEmptyOutlineDocument("雾港");
  d.story.premise = "未来来信";
  d.volumes = [{ nodeId: "v", title: "初来", summary: "作者卷纲", order: 0, planningDepth: "rough", chapterNodeIds: ["c"] }];
  d.chapters = [{ nodeId: "c", volumeNodeId: "v", order: 0, title: "来信", summary: "作者章纲", purpose: "埋疑", planningDepth: "rough", characterNodeIds: [], payoffNodeIds: [] }];
  await prisma.outlineProject.create({ data: { id, title: d.story.title, currentVersion: 1, currentRevisionId: id + "r" } });
  await prisma.outlineRevision.create({ data: { id: id + "r", projectId: id, version: 1, documentJson: JSON.stringify(d), sourceType: "manual" } });
  const input = { revisionId: id + "r", expectedProjectVersion: 1, bookSettings: { title: "雾港", estimatedChapterCount: 3, defaultChapterLength: 3000 }, volumeQuotas: { v: 3 }, allowOptimize: [] };
  const service = new OutlineOpenBookService(prisma, async () => {});
  const preview = await service.preview(id, input);
  const b = await service.confirm(id, { ...input, requestHash: preview.requestHash, idempotencyKey: id });
  return { novelId: b.novelId, chapterId: b.mapping.chapters[0].chapterId, planId: b.mapping.chapters[0].planId };
}
const volumes = new NovelVolumeService();
test.before(() => ensureRuntimeDatabaseReady());
test.after(() => prisma.$disconnect());
test("volume reads keep outline-preserved summaries when chapter expectation diverged after execution", async () => {
  const f = await boundNovel();
  await prisma.chapter.update({ where: { id: f.chapterId }, data: { expectation: "执行后改写的章节简报，与大纲原摘要不同" } });
  const versions = await volumes.listVolumeVersions(f.novelId);
  assert.equal(versions.length, 1);
  const doc = await volumes.getVolumes(f.novelId);
  assert.equal(doc.volumes[0].chapters[0].summary, "作者章纲");
  assert.equal((await prisma.volumeChapterPlan.findUniqueOrThrow({ where: { id: f.planId } })).summary, "作者章纲");
});
test("unbound novels still hydrate chapter expectation into the workspace summary", async () => {
  const f = await boundNovel();
  await prisma.chapter.update({ where: { id: f.chapterId }, data: { expectation: "执行后改写的章节简报" } });
  await prisma.outlineBookBinding.delete({ where: { novelId: f.novelId } });
  const doc = await volumes.getVolumes(f.novelId);
  assert.equal(doc.volumes[0].chapters[0].summary, "执行后改写的章节简报");
});
