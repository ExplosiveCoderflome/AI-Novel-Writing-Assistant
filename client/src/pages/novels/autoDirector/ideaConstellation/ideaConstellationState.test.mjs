import test from "node:test";
import assert from "node:assert/strict";

import {
  groupIdeaConstellationOptions,
  selectRotatingFoundationOptions,
  toggleIdeaConstellationSelection,
} from "./ideaConstellationState.ts";

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

test("the chart and reading list share seven ordered groups of five materials", () => {
  const categories = [
    "protagonist",
    "setting",
    "advantage",
    "opening_crisis",
    "core_goal",
    "story_variable",
    "relationship",
  ];
  const options = categories.flatMap((category) => (
    Array.from({ length: 5 }, (_, index) => option(`${category}-${index + 1}`, category, `${category}${index + 1}`))
  ));
  const groups = groupIdeaConstellationOptions([...options].reverse());
  assert.deepEqual(groups.map((group) => group.category), categories);
  assert.deepEqual(groups.flatMap((group) => group.options), options);
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
