const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildDirectorCompletionProfile,
  normalizeDirectorCompletionProfile,
} = require("@ai-novel/shared/types/directorCompletion");
const { listRegisteredPromptAssets } = require("../dist/prompting/registry.js");

test("compact completion profile uses whole-book promise and five-chapter closing budget", () => {
  for (const target of [30, 40, 60]) {
    assert.deepEqual(buildDirectorCompletionProfile(target), {
      mode: "compact_book",
      targetChapterCount: target,
      maxChapterCount: target + 5,
      promiseScope: "whole_book",
      structure: "three_act_compact",
      endingRequiredBy: target,
    });
  }
});

test("61 chapters keep serial compatibility and legacy payloads normalize deterministically", () => {
  assert.equal(buildDirectorCompletionProfile(61).mode, "serial_book");
  assert.equal(buildDirectorCompletionProfile(61).promiseScope, "first_30_chapters");
  assert.equal(normalizeDirectorCompletionProfile(null, 40).maxChapterCount, 45);
  assert.equal(normalizeDirectorCompletionProfile({ targetChapterCount: 61, mode: "compact_book" }).mode, "serial_book");
});

test("compact planning and ending audit prompts are registered", () => {
  const keys = new Set(listRegisteredPromptAssets().map((asset) => `${asset.id}@${asset.version}`));
  assert.equal(keys.has("novel.compact_book.structure@v1"), true);
  assert.equal(keys.has("novel.compact_book.ending_audit@v1"), true);
});
