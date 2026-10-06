const test = require("node:test");
const assert = require("node:assert/strict");

const { volumeChapterPurposePrompt } = require("../dist/prompting/prompts/novel/volume/chapterDetail.prompts.js");

const input = (summary, purpose = "") => ({ targetChapter: { summary, purpose } });

test("chapter purpose rejects an output that duplicates the chapter summary", () => {
  assert.throws(
    () => volumeChapterPurposePrompt.postValidate({ purpose: "  本章摘要  " }, input("本章摘要")),
    /章节目标不能与章节摘要或现有目标完全相同/,
  );
  assert.throws(
    () => volumeChapterPurposePrompt.postValidate({ purpose: "现有章节目标" }, input("章节摘要", "现有章节目标")),
    /章节目标不能与章节摘要或现有目标完全相同/,
  );
  assert.deepEqual(
    volumeChapterPurposePrompt.postValidate({ purpose: "推进主角夺回处置权" }, input("主角检查患者并取得临时救治权")),
    { purpose: "推进主角夺回处置权" },
  );
  assert.equal(volumeChapterPurposePrompt.semanticRetryPolicy.maxAttempts, 2);
});
