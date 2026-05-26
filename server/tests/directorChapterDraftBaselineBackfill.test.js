const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildDirectorChapterDraftBaselineBackfillPlan,
} = require("../dist/services/novel/director/recovery/directorChapterDraftBaselineBackfill.js");

test("director chapter draft baseline backfill creates only missing chapter draft baselines", () => {
  const plan = buildDirectorChapterDraftBaselineBackfillPlan({
    chapters: [
      {
        id: "chapter-1",
        novelId: "novel-1",
        order: 1,
        title: "Chapter 1",
        content: "tracked content",
        updatedAt: "2026-04-29T01:00:00.000Z",
      },
      {
        id: "chapter-2",
        novelId: "novel-1",
        order: 2,
        title: "Chapter 2",
        content: "missing baseline content",
        updatedAt: "2026-04-29T01:01:00.000Z",
      },
      {
        id: "chapter-3",
        novelId: "novel-1",
        order: 3,
        title: "Chapter 3",
        content: "   ",
        updatedAt: "2026-04-29T01:02:00.000Z",
      },
    ],
    artifacts: [
      {
        id: "chapter_draft:chapter:chapter-1:Chapter:chapter-1",
        novelId: "novel-1",
        artifactType: "chapter_draft",
        targetType: "chapter",
        targetId: "chapter-1",
        contentTable: "Chapter",
        contentId: "chapter-1",
        contentHash: "old-hash",
      },
    ],
  });

  assert.equal(plan.candidates.length, 1);
  assert.equal(plan.candidates[0].id, "chapter_draft:chapter:chapter-2:Chapter:chapter-2");
  assert.equal(plan.candidates[0].chapterId, "chapter-2");
  assert.equal(plan.candidates[0].contentHash.length, 64);
  assert.deepEqual(plan.skipped, {
    emptyDraftChapters: 1,
    trackedDraftChapters: 1,
  });
});
