const test = require("node:test");
const assert = require("node:assert/strict");

const {
  recoverMissingVolumeStrategy,
} = require("../dist/services/novel/volume/recovery/missingStrategy.js");
const {
  isInitializationPlaceholderVolumeWorkspace,
} = require("../../shared/dist/types/volumePlanning.js");

function workspacePlaceholder(document) {
  return isInitializationPlaceholderVolumeWorkspace(document.volumes);
}

function placeholderDocument() {
  return {
    novelId: "novel",
    volumes: [{
      id: "legacy-volume-1",
      novelId: "novel",
      sortOrder: 1,
      title: "第1卷",
      summary: "待补全卷级结构。",
      openingHook: "待补全开卷抓手。",
      mainPromise: "待补全卷级主承诺。",
      primaryPressureSource: "待补全主压迫源。",
      coreSellingPoint: "待补全核心卖点。",
      escalationMode: "待补全升级方式。",
      protagonistChange: "待补全主角变化。",
      midVolumeRisk: "待补全中段风险。",
      climax: "待补全卷末高潮。",
      payoffType: "待补全兑现类型。",
      nextVolumeHook: "待补全下卷钩子。",
      resetPoint: null,
      openPayoffs: [],
      status: "active",
      sourceVersionId: null,
      chapters: [],
    }],
    strategyPlan: null,
    critiqueReport: null,
    beatSheets: [],
    rebalanceDecisions: [],
    source: "legacy",
    activeVersionId: "version-1",
  };
}

function authorDocument() {
  const document = placeholderDocument();
  document.volumes = [{
    ...document.volumes[0],
    id: "author-volume-1",
    summary: "作者写好的第一卷结构。",
    mainPromise: "作者写好的主承诺。",
    escalationMode: "作者写好的升级方式。",
    protagonistChange: "作者写好的主角变化。",
    nextVolumeHook: "作者写好的下卷钩子。",
    chapters: [{
      id: "author-chapter-1",
      chapterOrder: 1,
      title: "第一章",
      summary: "作者的章节概要。",
    }],
  }];
  return document;
}

test("a fresh-book legacy placeholder volume is recognized as initialization state", () => {
  assert.equal(workspacePlaceholder(placeholderDocument()), true);
});

test("a real author volume with content is never treated as a placeholder", () => {
  assert.equal(workspacePlaceholder(authorDocument()), false);
});

test("multiple volumes are never treated as initialization state", () => {
  const document = placeholderDocument();
  document.volumes = [document.volumes[0], { ...document.volumes[0], id: "legacy-volume-2", sortOrder: 2 }];
  assert.equal(workspacePlaceholder(document), false);
});

// Regression for issue #197: a brand new book's single empty legacy placeholder
// volume used to be handed to strategy recovery as if the author had chosen one
// volume. Recovery then persisted a one-volume strategy and returned the
// placeholder as the saved skeleton, so no amount of target chapters produced
// more than one volume. Recovery must decline instead of locking the count.
test("strategy recovery declines a fresh-book placeholder instead of locking one volume", async () => {
  let generateCalls = 0;
  const service = {
    getVolumes: async () => placeholderDocument(),
    generateVolumes: async () => {
      generateCalls += 1;
      throw new Error("placeholder recovery must not call the model");
    },
  };

  const result = await recoverMissingVolumeStrategy("novel", service, {
    provider: "stub",
    model: "stub",
    taskId: "task",
    entrypoint: "director_next",
    estimatedChapterCount: 200,
  });

  assert.equal(result, null);
  assert.equal(generateCalls, 0);
});

test("strategy recovery still runs for a real author draft", async () => {
  const calls = [];
  const service = {
    getVolumes: async () => authorDocument(),
    generateVolumes: async (_novelId, options) => {
      calls.push(options);
      throw new Error("recovery-not-declined");
    },
  };

  await assert.rejects(
    () => recoverMissingVolumeStrategy("novel", service, {
      provider: "stub",
      model: "stub",
      taskId: "task",
      entrypoint: "director_next",
      estimatedChapterCount: 200,
    }),
    /recovery-not-declined/,
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].scope, "strategy");
  assert.equal(calls[0].userPreferredVolumeCount, 1);
  assert.equal(calls[0].respectExistingVolumeCount, true);
});
