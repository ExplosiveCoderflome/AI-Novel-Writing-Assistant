import assert from "node:assert/strict";
import test from "node:test";
import {
  computeParagraphSpan,
  getCursorOffsetFromValue,
  getPointFromAbsoluteOffset,
  getParagraphSelection,
  toPlateValue,
} from "./editorDocument.ts";

test("paragraph span is empty when nothing changed", () => {
  assert.deepEqual(computeParagraphSpan(["甲", "乙"], ["甲", "乙"]), { start: 2, oldEnd: 2, newEnd: 2 });
});

test("paragraph span isolates a single replaced paragraph", () => {
  assert.deepEqual(computeParagraphSpan(["甲", "乙", "丙"], ["甲", "新乙", "丙"]), { start: 1, oldEnd: 2, newEnd: 2 });
});

test("paragraph span covers an insertion in the middle", () => {
  assert.deepEqual(computeParagraphSpan(["甲", "丙"], ["甲", "乙", "丙"]), { start: 1, oldEnd: 1, newEnd: 2 });
});

test("paragraph span covers a deletion at the end", () => {
  assert.deepEqual(computeParagraphSpan(["甲", "乙", "丙"], ["甲", "乙"]), { start: 2, oldEnd: 3, newEnd: 2 });
});

test("paragraph span replaces everything when no paragraph matches", () => {
  assert.deepEqual(computeParagraphSpan(["甲", "乙"], ["丙", "丁", "戊"]), { start: 0, oldEnd: 2, newEnd: 3 });
});

test("impact review locates the exact authored paragraph", () => {
  assert.deepEqual(getParagraphSelection("第一段\n\n第二段", 2), { from: 5, to: 8, text: "第二段" });
  assert.equal(getParagraphSelection("第一段\n\n第二段", 3), null);
});

test("applying the span to old paragraphs yields the new paragraphs", () => {
  const cases = [
    [["甲", "乙"], ["甲", "乙"]],
    [["甲", "乙", "丙"], ["甲", "新乙", "丙"]],
    [["甲", "丙"], ["甲", "乙", "丙", "丁"]],
    [["甲", "乙", "丙"], ["甲"]],
    [[], ["甲"]],
    [["甲"], []],
  ];
  for (const [oldParagraphs, newParagraphs] of cases) {
    const span = computeParagraphSpan(oldParagraphs, newParagraphs);
    const applied = [
      ...oldParagraphs.slice(0, span.start),
      ...newParagraphs.slice(span.start, span.newEnd),
      ...oldParagraphs.slice(span.oldEnd),
    ];
    assert.deepEqual(applied, newParagraphs);
  }
});

test("offset to point round-trips through point to offset", () => {
  const value = toPlateValue("第一段文字\n\n第二段\n\n第三段落结尾");
  const totalLength = "第一段文字\n\n第二段\n\n第三段落结尾".length;
  for (let offset = 0; offset <= totalLength; offset += 1) {
    const point = getPointFromAbsoluteOffset(value, offset);
    assert.ok(point, `offset ${offset} should map to a point`);
    const roundTripped = getCursorOffsetFromValue(value, point);
    // Offsets inside a paragraph separator land on the next paragraph start.
    const expected = offset === 6 || offset === 11 ? offset + 1 : offset;
    assert.equal(roundTripped, expected, `offset ${offset}`);
  }
});

test("offset past the end clamps to the document end", () => {
  const value = toPlateValue("只有一段");
  const point = getPointFromAbsoluteOffset(value, 999);
  assert.equal(getCursorOffsetFromValue(value, point), 4);
});
