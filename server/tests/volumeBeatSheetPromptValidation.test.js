const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createVolumeBeatSheetSchema,
} = require("../dist/services/novel/volume/volumeGenerationSchemas.js");
const {
  volumeBeatSheetPrompt,
} = require("../dist/prompting/prompts/novel/volume/beatSheet.prompts.js");

function createVolume(sortOrder) {
  return {
    id: `volume-${sortOrder}`,
    novelId: "novel-1",
    sortOrder,
    title: `第${sortOrder}卷`,
    summary: `卷${sortOrder}摘要`,
    openingHook: `卷${sortOrder}开局钩子`,
    mainPromise: `卷${sortOrder}主承诺`,
    primaryPressureSource: `卷${sortOrder}压力源`,
    coreSellingPoint: `卷${sortOrder}卖点`,
    escalationMode: `卷${sortOrder}升级方式`,
    protagonistChange: `卷${sortOrder}主角变化`,
    midVolumeRisk: `卷${sortOrder}中段风险`,
    climax: `卷${sortOrder}高潮`,
    payoffType: `卷${sortOrder}兑现类型`,
    nextVolumeHook: `卷${sortOrder}下卷钩子`,
    resetPoint: null,
    openPayoffs: [],
    status: "active",
    sourceVersionId: null,
    chapters: [],
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

function createPromptInput(targetChapterCount) {
  return {
    novel: {},
    workspace: {
      volumes: [],
      strategyPlan: null,
      critiqueReport: null,
      beatSheets: [],
      rebalanceDecisions: [],
      readiness: {
        canGenerateStrategy: true,
        canGenerateSkeleton: false,
        canGenerateBeatSheet: false,
        canGenerateChapterList: false,
        blockingReasons: [],
      },
      derivedOutline: "",
      derivedStructuredOutline: "",
      source: "empty",
      activeVersionId: null,
    },
    storyMacroPlan: null,
    strategyPlan: null,
    targetVolume: createVolume(1),
    targetChapterCount,
  };
}

function createPromptContext() {
  return {
    blocks: [],
    selectedBlockIds: [],
    droppedBlockIds: [],
    summarizedBlockIds: [],
    estimatedInputTokens: 0,
  };
}

function createBeat(key, label, chapterSpanHint) {
  return {
    key,
    label,
    summary: `${label}的节奏职责。`,
    chapterSpanHint,
    mustDeliver: [`${label}必须兑现的信号`],
  };
}

test("volume beat sheet schema accepts short-volume beat counts", () => {
  const parsed = createVolumeBeatSheetSchema().safeParse({
    beats: [
      createBeat("open_hook", "短卷开局", "1章"),
      createBeat("counter_break", "反制破局", "2章"),
      createBeat("end_hook", "卷尾钩子", "3章"),
    ],
  });

  assert.equal(parsed.success, true);
});

test("volume beat sheet prompt asks 3-chapter short volumes for exactly 3 beats", () => {
  const messages = volumeBeatSheetPrompt.render(createPromptInput(3), createPromptContext());
  const systemPrompt = String(messages[0].content);

  assert.match(systemPrompt, /beats 必须输出 3 条/);
  assert.doesNotMatch(systemPrompt, /beats 必须输出 5-8 条/);
});

test("volume beat sheet prompt accepts one beat per chapter for a 3-chapter short volume", () => {
  const output = {
    beats: [
      createBeat("open_hook", "短卷开局", "1章"),
      createBeat("counter_break", "反制破局", "2章"),
      createBeat("end_hook", "卷尾钩子", "3章"),
    ],
  };

  assert.deepEqual(
    volumeBeatSheetPrompt.postValidate(output, createPromptInput(3), createPromptContext()),
    output,
  );
});

test("volume beat sheet prompt still requires at least 5 beats for normal volumes", () => {
  assert.throws(
    () => volumeBeatSheetPrompt.postValidate({
      beats: [
        createBeat("open_hook", "开卷抓手", "1-6章"),
        createBeat("mid_turn", "中段转向", "7-12章"),
        createBeat("end_hook", "卷尾钩子", "13-18章"),
      ],
    }, createPromptInput(18), createPromptContext()),
    /目标 18 章需要 5-8 条 beats/,
  );
});

test("volume beat sheet prompt rejects more beats than short-volume chapters before span continuity", () => {
  assert.throws(
    () => volumeBeatSheetPrompt.postValidate({
      beats: [
        createBeat("open_hook", "短卷开局", "1章"),
        createBeat("counter_break", "反制破局", "1章"),
        createBeat("mid_turn", "短卷转向", "2章"),
        createBeat("climax", "短卷兑现", "3章"),
        createBeat("end_hook", "卷尾钩子", "3章"),
      ],
    }, createPromptInput(3), createPromptContext()),
    /目标 3 章需要 3 条 beats/,
  );
});
