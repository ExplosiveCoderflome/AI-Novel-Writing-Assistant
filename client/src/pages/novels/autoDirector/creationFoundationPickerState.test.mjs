import assert from "node:assert/strict";
import test from "node:test";

import {
  filterCreationFoundationTree,
  fillMissingCreationFoundation,
  fillMissingMarketCreativeFraming,
  findCreationFoundationNode,
  hasCreationFoundationChanged,
  resolveMarketOpeningIdea,
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

test("market creative seed fills the opening idea and framing without replacing user input", () => {
  const seed = {
    openingIdea: "失业工程师醒来后能看见魔法契约的隐藏代价，并在处刑前夺下第一座工坊。",
    coreAdvantage: "能识别契约代价，但每次改写都会留下可追踪的魔力印记。",
    bookSellingPoint: "用工程思维拆解魔法规则，在领地经营中持续兑现技术反差。",
    first30ChapterPromise: "建成第一条魔法生产线，救下首批追随者并引出王都封锁。",
  };

  assert.equal(resolveMarketOpeningIdea("", seed), seed.openingIdea);
  assert.equal(resolveMarketOpeningIdea("用户自己的想法", seed), "用户自己的想法");
  assert.deepEqual(fillMissingMarketCreativeFraming({
    bookSellingPoint: "",
    first30ChapterPromise: "用户自己的前30章承诺",
  }, seed), {
    bookSellingPoint: seed.bookSellingPoint,
    first30ChapterPromise: "用户自己的前30章承诺",
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
