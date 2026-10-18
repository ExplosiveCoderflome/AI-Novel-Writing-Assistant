import assert from "node:assert/strict";
import test from "node:test";
import { acknowledgeChapterSave, receiveChapter, restoreChapterDraft } from "./draftState.ts";

const saved = { content: "甲\n\n乙", savedContent: "甲\n\n乙", savedUpdatedAt: "2026-10-11T00:00:00.000Z" };

test("chapter refresh keeps an unsaved author draft", () => {
  const draft = { ...saved, content: "甲\n\n作者刚改的乙" };
  assert.deepEqual(receiveChapter(draft, { content: "甲\n\n后台新版本", updatedAt: "2026-10-11T00:01:00.000Z" }, false), draft);
});

test("chapter refresh accepts a newer saved version when the editor is clean", () => {
  assert.deepEqual(receiveChapter(saved, { content: "甲\n\n后台新版本", updatedAt: "2026-10-11T00:01:00.000Z" }, false), {
    content: "甲\n\n后台新版本",
    savedContent: "甲\n\n后台新版本",
    savedUpdatedAt: "2026-10-11T00:01:00.000Z",
  });
});

test("save acknowledgement preserves newer local typing", () => {
  const draft = { ...saved, content: "甲\n\n本地继续输入" };
  assert.deepEqual(acknowledgeChapterSave(draft, "甲\n\n刚提交", { content: "甲\n\n刚提交", updatedAt: "2026-10-11T00:02:00.000Z" }), {
    content: "甲\n\n本地继续输入",
    savedContent: "甲\n\n刚提交",
    savedUpdatedAt: "2026-10-11T00:02:00.000Z",
  });
});

test("invalid draft storage falls back to the saved version", () => {
  assert.deepEqual(restoreChapterDraft("{broken", saved), saved);
});

test("accepted AI prose replaces its source draft and remains clean after refresh", () => {
  const source = { ...saved, content: "甲\n\n作者未保存的乙" };
  const response = { content: "甲\n\nAI 改写的乙", updatedAt: "2026-10-11T00:03:00.000Z" };
  const accepted = acknowledgeChapterSave(source, source.content, response);
  assert.equal(accepted.content, response.content);
  assert.equal(accepted.content, accepted.savedContent);
  assert.deepEqual(receiveChapter(accepted, response, false), accepted);
});

test("an AI save receipt preserves typing made after acceptance began", () => {
  const source = saved.content;
  const current = { ...saved, content: source + "\n\n刚输入的新段落" };
  const accepted = acknowledgeChapterSave(current, source, {
    content: "甲\n\nAI 改写的乙", updatedAt: "2026-10-11T00:03:00.000Z",
  });
  assert.equal(accepted.content, current.content);
  assert.equal(accepted.savedContent, "甲\n\nAI 改写的乙");
});
