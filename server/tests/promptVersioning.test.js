const test = require("node:test");
const assert = require("node:assert/strict");
const { createVolumeChapterListPrompt } = require("../dist/prompting/prompts/novel/volume/chapterList.prompts.js");
const { definePromptAsset } = require("../dist/prompting/core/promptTypes.js");
const { preparePromptExecution } = require("../dist/prompting/core/promptRunner.js");
const {
  getRegisteredPromptAsset,
  listRegisteredPromptAssets,
} = require("../dist/prompting/registry.js");

const baseConfig = {
  id: "test.prompt",
  taskType: "planner",
  mode: "text",
  language: "zh",
  contextPolicy: { maxTokensBudget: 1200 },
  render: () => [],
};

function findRegisteredAsset(id) {
  return listRegisteredPromptAssets().find((asset) => asset.id === id) ?? null;
}

test("definePromptAsset derives the same hash version for the same semantic source", () => {
  const versionSource = {
    template: "system:hello\nuser:world",
    contextPolicy: { maxTokensBudget: 1200 },
    outputSchemaVersion: "schema:test:v1",
  };

  const first = definePromptAsset({
    ...baseConfig,
    versionSource,
  });
  const second = definePromptAsset({
    ...baseConfig,
    versionSource,
  });

  assert.equal(first.version, second.version);
  assert.match(first.version, /^h[a-f0-9]{12}$/);
});

test("definePromptAsset changes version when semantic source changes", () => {
  const first = definePromptAsset({
    ...baseConfig,
    versionSource: {
      template: "A",
    },
  });
  const second = definePromptAsset({
    ...baseConfig,
    versionSource: {
      template: "B",
    },
  });

  assert.notEqual(first.version, second.version);
});

test("registered prompt assets expose hash versions and resolve by actual asset version", () => {
  const asset = findRegisteredAsset("planner.chapter.plan");
  assert.ok(asset, "expected planner.chapter.plan asset to be registered");
  assert.match(asset.version, /^h[a-f0-9]{12}$/);
  assert.equal(getRegisteredPromptAsset(asset.id, asset.version), asset);
});

test("preparePromptExecution exposes auto-generated promptVersion in invocation metadata", () => {
  const asset = findRegisteredAsset("planner.chapter.plan");
  assert.ok(asset, "expected planner.chapter.plan asset to be registered");

  const prepared = preparePromptExecution({
    asset,
    promptInput: {
      scopeLabel: "测试章节规划",
    },
  });

  assert.equal(prepared.invocation.promptVersion, asset.version);
  assert.match(prepared.invocation.promptVersion, /^h[a-f0-9]{12}$/);
});

test("recreated chapter list prompt instances keep the registered runtime version", () => {
  const asset = createVolumeChapterListPrompt({
    targetChapterCount: 4,
    targetBeatKey: "open_hook",
    targetBeatLabel: "开卷抓手",
  });

  assert.match(asset.version, /^h[a-f0-9]{12}$/);
  assert.equal(getRegisteredPromptAsset(asset.id, asset.version)?.version, asset.version);
});
