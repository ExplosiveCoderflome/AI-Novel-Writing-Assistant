const test = require("node:test");
const assert = require("node:assert/strict");
const { getRegisteredPromptAsset } = require("../dist/prompting/registry.js");

test("卷纲重点按卷核对唯一原文，缺少转折时允许留空", () => {
  const prompt = getRegisteredPromptAsset("novel.volume.summary_emphasis", "v1");
  const volumes = [{ id: "A", summary: "船队被困，船长决定弃船走陆路。" }, { id: "B", summary: "风雪未停。" }];
  const marks = [{ id: "B", conflict: "风雪未停", turn: null }, { id: "A", conflict: "船队被困", turn: "弃船走陆路" }];
  const validate = (rows, sources = volumes) => prompt.postValidate(prompt.outputSchema.parse({volumes:rows}), {volumes:sources});
  assert.deepEqual(validate(marks).volumes, marks);
  assert.throws(() => validate([marks[0], {...marks[1], turn:"改走陆路"}]), /原文/);
  assert.throws(() => validate([marks[0], {...marks[1], turn:"船"}]), /唯一/);
  assert.throws(() => validate([marks[0], marks[0]]), /对应/);
  assert.throws(() => validate([marks[0]]), /对应/);
});
