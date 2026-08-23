import test from "node:test";
import assert from "node:assert/strict";

import { buildConstellationLayout } from "./constellationLayout.ts";

const items = Array.from({ length: 34 }, (_, index) => ({
  id: `item-${index + 1}`,
  label: `星图词语${index + 1}`,
  kind: index < 16 ? "foundation" : "plot",
  emphasis: index % 3 === 0 ? "high" : "medium",
}));

test("constellation layout is stable, complete and container-bound", () => {
  const first = buildConstellationLayout(items, 1600, 700);
  const second = buildConstellationLayout(items, 1600, 700);

  assert.deepEqual(second, first);
  assert.equal(Object.keys(first).length, items.length);
  for (const point of Object.values(first)) {
    assert.ok(point.left > 0 && point.left < 100);
    assert.ok(point.top > 0 && point.top < 100);
  }
});

test("constellation layout changes when the candidate group changes", () => {
  const first = buildConstellationLayout(items, 1600, 700);
  const changed = buildConstellationLayout(
    items.map((item, index) => index === 0 ? { ...item, id: "replacement" } : item),
    1600,
    700,
  );

  assert.notDeepEqual(changed, first);
});
