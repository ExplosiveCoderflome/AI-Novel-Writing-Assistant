import test from "node:test";
import assert from "node:assert/strict";

import {
  selectRotatingFoundationOptions,
  toggleIdeaConstellationSelection,
} from "./ideaConstellationState.ts";
import { buildStaticIdeaConstellationOptions } from "./staticIdeaConstellation.ts";

const option = (id, category, label) => ({
  id,
  category,
  label,
  hint: `${label}的故事作用`,
  relevance: "medium",
});

test("story constellation toggles an existing selection off", () => {
  const protagonist = option("protagonist-1", "protagonist", "失忆医生");
  assert.deepEqual(toggleIdeaConstellationSelection([protagonist], protagonist), []);
});

test("story constellation replaces the previous option in the same category", () => {
  const selected = [
    option("protagonist-1", "protagonist", "失忆医生"),
    option("setting-1", "setting", "封闭城市"),
  ];
  const next = toggleIdeaConstellationSelection(
    selected,
    option("protagonist-2", "protagonist", "退休杀手"),
  );

  assert.deepEqual(next.map((item) => item.id), ["setting-1", "protagonist-2"]);
});

test("static story constellation returns six categories with four unique options each", () => {
  const options = buildStaticIdeaConstellationOptions();
  const categoryCounts = Object.groupBy(options, (item) => item.category);

  assert.equal(options.length, 24);
  assert.equal(new Set(options.map((item) => item.id)).size, 24);
  assert.deepEqual(
    Object.values(categoryCounts).map((items) => items?.length),
    [4, 4, 4, 4, 4, 4],
  );
  const allCuratedOptions = [options, buildStaticIdeaConstellationOptions(1)].flat();
  assert.equal(allCuratedOptions.every((item) => item.label.length >= 2 && item.label.length <= 12), true);
  assert.equal(allCuratedOptions.every((item) => item.hint.length >= 4 && item.hint.length <= 48), true);
});

test("static story constellation rotates to a different curated pack", () => {
  const first = buildStaticIdeaConstellationOptions(0).map((item) => item.id);
  const second = buildStaticIdeaConstellationOptions(1).map((item) => item.id);

  assert.notDeepEqual(second, first);
  assert.deepEqual(buildStaticIdeaConstellationOptions(2).map((item) => item.id), first);
});

test("foundation options rotate while keeping the current selection visible", () => {
  const options = Array.from({ length: 7 }, (_, index) => ({
    id: `foundation-${index + 1}`,
    label: `方向${index + 1}`,
    hint: "方向说明",
  }));

  assert.deepEqual(
    selectRotatingFoundationOptions(options, 1, "foundation-4", 4).map((item) => item.id),
    ["foundation-5", "foundation-6", "foundation-7", "foundation-4"],
  );
});
