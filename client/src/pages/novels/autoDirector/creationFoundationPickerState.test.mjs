import assert from "node:assert/strict";
import test from "node:test";

import {
  filterCreationFoundationTree,
  fillMissingCreationFoundation,
  findCreationFoundationNode,
  hasCreationFoundationChanged,
} from "./creationFoundationPickerState.ts";

const tree = [
  {
    id: "genre-root",
    name: "科幻",
    description: "科学幻想",
    children: [
      {
        id: "genre-near-future",
        name: "近未来科幻",
        description: "现实延伸出的技术冲突",
        children: [],
      },
    ],
  },
];

test("filterCreationFoundationTree keeps the ancestor path of a matching child", () => {
  assert.deepEqual(filterCreationFoundationTree(tree, "技术冲突"), tree);
  assert.deepEqual(filterCreationFoundationTree(tree, "不存在"), []);
});

test("fillMissingCreationFoundation applies radar recommendations without replacing user choices", () => {
  assert.deepEqual(fillMissingCreationFoundation({
    genreId: "",
    primaryStoryModeId: "mode-user",
    secondaryStoryModeId: "",
  }, {
    genreId: "genre-radar",
    primaryStoryModeId: "mode-radar",
    secondaryStoryModeId: "mode-secondary",
  }), {
    genreId: "genre-radar",
    primaryStoryModeId: "mode-user",
    secondaryStoryModeId: "mode-secondary",
  });
});

test("findCreationFoundationNode resolves a nested resource", () => {
  assert.equal(findCreationFoundationNode(tree, "genre-near-future")?.name, "近未来科幻");
  assert.equal(findCreationFoundationNode(tree, "missing"), null);
});

test("hasCreationFoundationChanged only invalidates candidates when a selected id changes", () => {
  const current = {
    genreId: "genre-near-future",
    primaryStoryModeId: "mode-growth",
  };

  assert.equal(hasCreationFoundationChanged(current, { genreId: current.genreId }), false);
  assert.equal(hasCreationFoundationChanged(current, { primaryStoryModeId: "mode-explore" }), true);
  assert.equal(hasCreationFoundationChanged(current, { genreId: "" }), true);
});
