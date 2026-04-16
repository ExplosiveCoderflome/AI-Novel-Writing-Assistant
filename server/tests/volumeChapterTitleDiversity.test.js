const test = require("node:test");
const assert = require("node:assert/strict");

const {
  assertChapterTitleDiversity,
  detectChapterTitleSurfaceFrame,
  getChapterTitleDiversityIssue,
} = require("../dist/services/novel/volume/chapterTitleDiversity.js");
const {
  createVolumeChapterListPrompt,
} = require("../dist/prompting/prompts/novel/volume/chapterList.prompts.js");
const {
  runStructuredPrompt,
  setPromptRunnerStructuredInvokerForTests,
} = require("../dist/prompting/core/promptRunner.js");

const EMPTY_CONTEXT = {
  blocks: [],
  selectedBlockIds: [],
  droppedBlockIds: [],
  summarizedBlockIds: [],
  estimatedInputTokens: 0,
};

function createPromptInput(targetChapterCount = 4) {
  return {
    novel: {
      title: "测试小说",
      description: null,
      targetAudience: null,
      bookSellingPoint: null,
      competingFeel: null,
      first30ChapterPromise: null,
      commercialTagsJson: "[]",
      estimatedChapterCount: targetChapterCount,
      narrativePov: null,
      pacePreference: null,
      emotionIntensity: null,
      storyModePromptBlock: null,
      genre: null,
      characters: [],
    },
    workspace: {
      novelId: "novel-1",
      workspaceVersion: "v2",
      volumes: [],
      strategyPlan: null,
      critiqueReport: null,
      beatSheets: [],
      rebalanceDecisions: [],
      readiness: {
        canGenerateStrategy: true,
        canGenerateSkeleton: true,
        canGenerateBeatSheet: true,
        canGenerateChapterList: true,
        blockingReasons: [],
      },
      source: "volume",
      activeVersionId: null,
    },
    storyMacroPlan: null,
    strategyPlan: null,
    targetVolume: {
      id: "volume-1",
      novelId: "novel-1",
      sortOrder: 1,
      title: "第一卷",
      summary: "卷摘要",
      openingHook: "开卷抓手",
      mainPromise: "主承诺",
      primaryPressureSource: "压力源",
      coreSellingPoint: "核心卖点",
      escalationMode: "升级方式",
      protagonistChange: "主角变化",
      midVolumeRisk: "中段风险",
      climax: "高潮",
      payoffType: "兑现类型",
      nextVolumeHook: "下卷钩子",
      resetPoint: null,
      openPayoffs: [],
      status: "active",
      sourceVersionId: null,
      chapters: [],
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    },
    targetBeatSheet: {
      volumeId: "volume-1",
      volumeSortOrder: 1,
      status: "generated",
      beats: [
        {
          key: "open_hook",
          label: "开卷抓手",
          summary: "先把世界危险和主角困境钉死。",
          chapterSpanHint: `1-${targetChapterCount}章`,
          mustDeliver: ["压迫感", "困境"],
        },
      ],
    },
    targetBeat: {
      key: "open_hook",
      label: "开卷抓手",
      summary: "先把世界危险和主角困境钉死。",
      chapterSpanHint: `1-${targetChapterCount}章`,
      mustDeliver: ["压迫感", "困境"],
    },
    targetBeatChapterCount: targetChapterCount,
    targetChapterStartOrder: 1,
    targetChapterEndOrder: targetChapterCount,
    nextAvailableChapterOrder: 1,
    previousBeatChapterSummary: null,
    preservedBeatChapterSummary: null,
    retryReason: null,
  };
}

test("chapter title diversity detects repeated X的Y framing", () => {
  const issue = getChapterTitleDiversityIssue([
    "废墟中的发现",
    "第一株灵植的种子",
    "掠夺者的阴影",
    "防御的萌芽",
    "余烬中的脚印",
    "守夜人的来信",
  ]);

  assert.match(issue, /X的Y \/ X中的Y/);
  assert.equal(detectChapterTitleSurfaceFrame("掠夺者的阴影"), "of_phrase");
});

test("chapter title diversity detects repeated A，B framing", () => {
  const issue = getChapterTitleDiversityIssue([
    "签下合同，甜蜜同居",
    "房租超支，紧急筹钱",
    "林晓求职，首战告败",
    "苏雨追梦，画室坚守",
    "四处求助，借钱解围",
    "机会临门，意外落空",
  ]);

  assert.match(issue, /A，B \/ 四字动作，四字结果/);
  assert.equal(detectChapterTitleSurfaceFrame("房租超支，紧急筹钱"), "comma_split");
});

test("chapter title diversity accepts mixed chapter title surfaces", () => {
  assert.doesNotThrow(() => assertChapterTitleDiversity([
    "夜探旧温室",
    "掠夺者逼近",
    "谁在回收种子？",
    "防线第一次成形",
    "第二道呼吸",
    "林青，别回头",
  ]));
});

test("volume chapter list prompt render hardens title diversity rules", () => {
  const messages = createVolumeChapterListPrompt({
    targetChapterCount: 6,
    targetBeatKey: "open_hook",
    targetBeatLabel: "开卷抓手",
  }).render({
    ...createPromptInput(6),
    retryReason: "章名结构过于集中",
  }, EMPTY_CONTEXT);

  assert.equal(messages.length, 2);
  assert.match(String(messages[0].content), /只能为「开卷抓手」生成 6 章/);
  assert.match(String(messages[0].content), /beatKey 必须严格等于 open_hook/);
  assert.match(String(messages[0].content), /chapterCount 与 chapters\.length 必须严格等于 6/);
  assert.match(String(messages[0].content), /不能大量重复“X的Y \/ X中的Y \/ 在X中Y”/);
  assert.match(String(messages[0].content), /A，B \/ 四字动作，四字结果/);
  assert.match(String(messages[0].content), /章名结构过于集中/);
});

test("volume chapter list prompt retries semantically when titles are structurally repetitive", async () => {
  const calls = [];

  setPromptRunnerStructuredInvokerForTests(async (input) => {
    calls.push(input);
    if (calls.length === 1) {
      return {
        data: {
          beatKey: "open_hook",
          beatLabel: "开卷抓手",
          chapterCount: 4,
          chapters: [
            { beatKey: "open_hook", title: "签下合同，甜蜜同居", summary: "主角暂时稳住住处问题，同时把关系线推进到新阶段。" },
            { beatKey: "open_hook", title: "房租超支，紧急筹钱", summary: "现实压力突然压上来，逼着主角立刻行动。" },
            { beatKey: "open_hook", title: "林晓求职，首战告败", summary: "主角第一次外出求职受挫，确认局面没有想象中轻松。" },
            { beatKey: "open_hook", title: "苏雨追梦，画室坚守", summary: "配角线同步抬升，让现实理想冲突进一步显形。" },
          ],
        },
        repairUsed: false,
        repairAttempts: 0,
      };
    }

    return {
      data: {
        beatKey: "open_hook",
        beatLabel: "开卷抓手",
        chapterCount: 4,
        chapters: [
          { beatKey: "open_hook", title: "夜探旧温室", summary: "主角夜探温室，确认异常来源并推动探索线正式启动。" },
          { beatKey: "open_hook", title: "掠夺者逼近", summary: "外部威胁压到眼前，当前卷的生存压力第一次真正落地。" },
          { beatKey: "open_hook", title: "谁在回收种子？", summary: "主角发现有人暗中回收灵种，把悬疑线抬到台前。" },
          { beatKey: "open_hook", title: "防线第一次成形", summary: "主角完成阶段性布防，让当前卷第一次出现可见成果。" },
        ],
      },
      repairUsed: false,
      repairAttempts: 0,
    };
  });

  try {
    const result = await runStructuredPrompt({
      asset: createVolumeChapterListPrompt({
        targetChapterCount: 4,
        targetBeatKey: "open_hook",
        targetBeatLabel: "开卷抓手",
      }),
      promptInput: createPromptInput(4),
    });

    assert.equal(calls.length, 2);
    assert.equal(calls[1].promptMeta.semanticRetryUsed, true);
    assert.equal(calls[1].promptMeta.semanticRetryAttempts, 1);
    assert.match(String(calls[1].messages[calls[1].messages.length - 1].content), /必须保留原有章节位数/);
    assert.match(String(calls[1].messages[calls[1].messages.length - 1].content), /A，B \/ 四字动作，四字结果/);
    assert.equal(result.output.chapters[0].title, "夜探旧温室");
  } finally {
    setPromptRunnerStructuredInvokerForTests();
  }
});

test("volume chapter list prompt throws after semantic retries are exhausted", async () => {
  const calls = [];

  setPromptRunnerStructuredInvokerForTests(async (input) => {
    calls.push(input);
    return {
      data: {
        beatKey: "open_hook",
        beatLabel: "开卷抓手",
        chapterCount: 4,
        chapters: [
          { beatKey: "open_hook", title: "签下合同，甜蜜同居", summary: "主角暂时稳住住处问题，同时把关系线推进到新阶段。" },
          { beatKey: "open_hook", title: "房租超支，紧急筹钱", summary: "现实压力突然压上来，逼着主角立刻行动。" },
          { beatKey: "open_hook", title: "林晓求职，首战告败", summary: "主角第一次外出求职受挫，确认局面没有想象中轻松。" },
          { beatKey: "open_hook", title: "苏雨追梦，画室坚守", summary: "配角线同步抬升，让现实理想冲突进一步显形。" },
        ],
      },
      repairUsed: false,
      repairAttempts: 0,
    };
  });

  try {
    await assert.rejects(() => runStructuredPrompt({
      asset: createVolumeChapterListPrompt({
        targetChapterCount: 4,
        targetBeatKey: "open_hook",
        targetBeatLabel: "开卷抓手",
      }),
      promptInput: createPromptInput(4),
    }), /章节标题结构过于集中|章节标题结构重复|X的Y \/ X中的Y/);
    assert.equal(calls.length, 3);
  } finally {
    setPromptRunnerStructuredInvokerForTests();
  }
});
