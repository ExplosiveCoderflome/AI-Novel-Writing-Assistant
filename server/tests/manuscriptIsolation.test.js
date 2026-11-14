const test = require("node:test");
const assert = require("node:assert/strict");
const { isManuscriptNovel, rejectLegacyManuscriptWrite, isCurrentSyncMarker } = require("../dist/modules/novel/manuscript/application/ManuscriptIsolation");
const { readActiveManuscriptChapters } = require("../dist/modules/novel/manuscript/application/ManuscriptWorkspaceService");

function dbFor(project, units = [], chapters = []) {
  return {
    manuscriptProject: { findUnique: async () => project },
    manuscriptUnit: { findMany: async ({ where }) => units.filter(unit => (!where.status || unit.status === where.status)).sort((left, right) => left.displayOrder - right.displayOrder) },
    chapter: { findMany: async ({ where }) => chapters.filter(chapter => chapter.novelId === where.novelId && where.id.in.includes(chapter.id)) },
    shortStorySegment: { findMany: async () => [] },
  };
}

test("non-B1 novels remain on the legacy path", async () => {
  const db = dbFor(null);
  assert.equal(await isManuscriptNovel(db, "legacy"), false);
  await assert.doesNotReject(rejectLegacyManuscriptWrite(db, "legacy"));
});

test("B1 manuscript novels reject V2 and legacy full-book or chapter writes with 409", async () => {
  const db = dbFor({ id: "project" });
  for (const entry of ["V2", "legacy full-book", "legacy chapter"]) {
    await assert.rejects(rejectLegacyManuscriptWrite(db, entry), error => error.statusCode === 409 && /原稿修订工作区/.test(error.message));
  }
});

test("active manuscript chapter order excludes inactive units regardless of negative displayOrder", async () => {
  const db = dbFor({ id: "project" }, [
    { id: "inactive", chapterId: "c0", displayOrder: -9, status: "inactive" },
    { id: "active-a", chapterId: "c2", displayOrder: 8, status: "active" },
    { id: "active-b", chapterId: "c1", displayOrder: 3, status: "active" },
  ], [
    { id: "c0", novelId: "n", content: "停用" },
    { id: "c1", novelId: "n", content: "先" },
    { id: "c2", novelId: "n", content: "后" },
  ]);
  const chapters = await readActiveManuscriptChapters(db, "n");
  assert.deepEqual(chapters.map(chapter => [chapter.id, chapter.order]), [["c1", 1], ["c2", 2]]);
});

test("late superseded sync marker cannot be applied", () => {
  assert.equal(isCurrentSyncMarker({ status: "pending" }), true);
  assert.equal(isCurrentSyncMarker({ status: "superseded" }), false);
  assert.equal(isCurrentSyncMarker(null), false);
});
