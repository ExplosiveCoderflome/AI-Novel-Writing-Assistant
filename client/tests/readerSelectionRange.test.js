import test from "node:test";
import assert from "node:assert/strict";
import {
  buildHumanFeedbackInstruction,
  buildHumanFeedbackRepairBrief,
  buildParagraphWindowFromRange,
  splitParagraphRanges,
} from "../src/pages/directorNext/workspace/selectionRange.ts";

test("splitParagraphRanges preserves exact character offsets across blank-line paragraphs", () => {
  const prose = "第一段第一句。\n第一段第二句。\n\n  \n第二段在这里。\n\n第三段收尾。";
  const paragraphs = splitParagraphRanges(prose);

  assert.equal(paragraphs.length, 3);
  for (const item of paragraphs) {
    assert.equal(prose.slice(item.from, item.to), item.text);
  }

  const targetFrom = prose.indexOf("第二段在这里。");
  const targetTo = targetFrom + "第二段在这里。".length;
  const window = buildParagraphWindowFromRange(paragraphs, targetFrom, targetTo);
  assert.deepEqual(window.beforeParagraphs, ["第一段第一句。\n第一段第二句。"]);
  assert.deepEqual(window.afterParagraphs, ["第三段收尾。"]);
});

test("human feedback instruction and repair brief carry selected tags and user guidance", () => {
  const instruction = buildHumanFeedbackInstruction(
    ["ai_taste", "off_voice"],
    "不要用书面总结，改成柜台找零的对话",
  );
  assert.match(instruction, /AI 味太重/);
  assert.match(instruction, /人物口吻不对/);
  assert.match(instruction, /不要用书面总结，改成柜台找零的对话/);

  const brief = buildHumanFeedbackRepairBrief(["padded_filler"], "去掉心里叹气");
  assert.match(brief.title, /废话\/过场太多/);
  assert.equal(brief.problemSummary, "去掉心里叹气");
  assert.equal(brief.mustPreserve?.length, 3);
});
