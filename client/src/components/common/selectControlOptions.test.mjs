import assert from "node:assert/strict";
import test from "node:test";

import {
  SELECT_CONTROL_EMPTY_VALUE,
  deduplicateSelectControlOptions,
  toSelectControlItemValue,
} from "./selectControlOptions.ts";

test("empty native select values share one Radix item value", () => {
  assert.equal(toSelectControlItemValue(""), SELECT_CONTROL_EMPTY_VALUE);
  assert.equal(toSelectControlItemValue("world-1"), "world-1");
});

test("duplicate native options render as one Radix item", () => {
  const options = deduplicateSelectControlOptions([
    { value: "", label: "不指定参考世界" },
    { value: "", label: "暂无可选世界样本", disabled: true },
    { value: "world-1", label: "世界一" },
  ]);

  assert.deepEqual(options, [
    { value: "", label: "不指定参考世界" },
    { value: "world-1", label: "世界一" },
  ]);
});
