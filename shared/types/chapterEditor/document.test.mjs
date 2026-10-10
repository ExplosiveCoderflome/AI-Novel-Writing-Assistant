import assert from "node:assert/strict";
import test from "node:test";
import {
  applySelectedChapterEditorDiff,
  chapterParagraphs,
  groupChapterEditorDiffChanges,
  insertChapterContinuation,
  normalizeChapterText,
  replaceChapterSelection,
} from "./document.ts";

test("chapter document coordinates preserve authored whitespace", () => {
  const content = normalizeChapterText("  第一段\r\n\r\n第二段\n");
  assert.equal(content, "  第一段\n\n第二段\n");
  assert.deepEqual(chapterParagraphs(content), [
    { index: 1, text: "  第一段", from: 0, to: 5 },
    { index: 2, text: "第二段\n", from: 7, to: 11 },
  ]);
});

test("chapter selection replacement rejects stale text", () => {
  assert.equal(replaceChapterSelection("甲\n乙", { from: 2, to: 3, text: "乙" }, "丙"), "甲\n丙");
  assert.throws(
    () => replaceChapterSelection("甲\n新乙", { from: 2, to: 3, text: "乙" }, "丙"),
    /正文片段已变化/,
  );
});

test("chapter continuation inserts at an exact cursor offset", () => {
  assert.equal(insertChapterContinuation("甲\n乙", 2, "，然后转身"), "甲\n，然后转身乙");
  assert.throws(
    () => insertChapterContinuation("甲", 2, "乙"),
    /正文光标位置已变化/,
  );
});

test("chapter diff groups replacements so partial acceptance cannot duplicate source text", () => {
  const chunks = [
    { id: "equal-1", type: "equal", text: "她抬头" },
    { id: "delete-1", type: "delete", text: "看向门口" },
    { id: "insert-1", type: "insert", text: "望向漆黑的门口" },
    { id: "equal-2", type: "equal", text: "。" },
    { id: "insert-2", type: "insert", text: "\n" },
  ];
  const changes = groupChapterEditorDiffChanges(chunks);
  assert.deepEqual(changes.map(({ kind, originalText, candidateText }) => ({ kind, originalText, candidateText })), [
    { kind: "replace", originalText: "看向门口", candidateText: "望向漆黑的门口" },
    { kind: "insert", originalText: "", candidateText: "\n" },
  ]);
  const candidate = "她抬头望向漆黑的门口。\n";
  assert.equal(applySelectedChapterEditorDiff("她抬头看向门口。", candidate, chunks, new Set()), "她抬头看向门口。");
  assert.equal(applySelectedChapterEditorDiff("她抬头看向门口。", candidate, chunks, new Set(["change-1"])), "她抬头望向漆黑的门口。");
  assert.equal(applySelectedChapterEditorDiff("她抬头看向门口。", candidate, chunks, new Set(["change-2"])), "她抬头看向门口。\n");
});
