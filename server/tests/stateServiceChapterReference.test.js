const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveSnapshotChapterReference,
} = require("../dist/services/state/StateService.js");

test("resolveSnapshotChapterReference maps chapter order text to a real chapter id", () => {
  const chapters = [
    { id: "chapter-1", order: 1, title: "重生归来" },
    { id: "chapter-2", order: 2, title: "决心用医术逆袭" },
  ];

  const resolved = resolveSnapshotChapterReference({
    value: "第2章",
    chapters,
    currentChapterId: "chapter-2",
    fallbackToCurrentChapter: false,
  });

  assert.equal(resolved, "chapter-2");
});

test("resolveSnapshotChapterReference falls back to current chapter for invalid setup refs", () => {
  const chapters = [
    { id: "chapter-1", order: 1, title: "重生归来" },
    { id: "chapter-2", order: 2, title: "决心用医术逆袭" },
  ];

  const resolved = resolveSnapshotChapterReference({
    value: "unknown_chapter_id",
    chapters,
    currentChapterId: "chapter-2",
    fallbackToCurrentChapter: true,
  });

  assert.equal(resolved, "chapter-2");
});

test("resolveSnapshotChapterReference treats chapter_1 placeholders as missing refs", () => {
  const chapters = [
    { id: "chapter-1", order: 1, title: "重生归来" },
    { id: "chapter-2", order: 2, title: "决心用医术逆袭" },
  ];

  const resolved = resolveSnapshotChapterReference({
    value: "chapter_1",
    chapters,
    currentChapterId: "chapter-2",
    fallbackToCurrentChapter: true,
  });

  assert.equal(resolved, "chapter-2");
});

test("resolveSnapshotChapterReference drops invalid payoff refs instead of returning placeholders", () => {
  const chapters = [
    { id: "chapter-1", order: 1, title: "重生归来" },
    { id: "chapter-2", order: 2, title: "决心用医术逆袭" },
  ];

  const resolved = resolveSnapshotChapterReference({
    value: "placeholder_payoff_chapter_id",
    chapters,
    currentChapterId: "chapter-2",
    fallbackToCurrentChapter: false,
  });

  assert.equal(resolved, null);
});
