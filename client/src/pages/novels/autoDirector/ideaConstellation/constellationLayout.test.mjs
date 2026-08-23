import test from "node:test";
import assert from "node:assert/strict";

import {
  buildConstellationLayout,
  estimateConstellationItemSize,
} from "./constellationLayout.ts";

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

test("constellation layout keeps long labels from covering each other", () => {
  const longItems = [
    ...Array.from({ length: 35 }, (_, index) => ({
      id: `long-${index + 1}`,
      label: `末法时代的第${index + 1}名符师，穿越成修仙界底层杂役并寻找翻身机会`,
      kind: "plot",
      emphasis: index % 3 === 0 ? "high" : "medium",
    })),
    ...Array.from({ length: 16 }, (_, index) => ({
      id: `foundation-${index + 1}`,
      label: `故事类型${index + 1}`,
      kind: "foundation",
    })),
  ];
  const width = 1900;
  const height = 900;
  const layout = buildConstellationLayout(longItems, width, height);
  const rects = longItems.map((item) => {
    const point = layout[item.id];
    return {
      ...estimateConstellationItemSize(item),
      left: point.left * width / 100,
      top: point.top * height / 100,
    };
  });

  for (let leftIndex = 0; leftIndex < rects.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < rects.length; rightIndex += 1) {
      const left = rects[leftIndex];
      const right = rects[rightIndex];
      const overlaps = Math.abs(left.left - right.left) < (left.width + right.width) / 2
        && Math.abs(left.top - right.top) < (left.height + right.height) / 2;
      assert.equal(overlaps, false, `${longItems[leftIndex].id} overlaps ${longItems[rightIndex].id}`);
    }
  }
});
