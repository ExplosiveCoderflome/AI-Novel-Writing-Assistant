import assert from "node:assert/strict";
import test from "node:test";

import { parseEstimatedChapterCountInput } from "./estimatedChapterCountInput.ts";

test("parseEstimatedChapterCountInput keeps an empty numeric field as an editing state", () => {
  assert.equal(parseEstimatedChapterCountInput(""), null);
  assert.equal(parseEstimatedChapterCountInput("30"), 30);
});

test("parseEstimatedChapterCountInput only accepts the supported chapter range", () => {
  assert.equal(parseEstimatedChapterCountInput("1"), 1);
  assert.equal(parseEstimatedChapterCountInput("2000"), 2000);
  assert.equal(parseEstimatedChapterCountInput("0"), null);
  assert.equal(parseEstimatedChapterCountInput("2001"), null);
  assert.equal(parseEstimatedChapterCountInput("30.5"), null);
});
