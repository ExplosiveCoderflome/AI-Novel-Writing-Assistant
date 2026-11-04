const test = require("node:test");
const assert = require("node:assert/strict");

const {
  assessChapterTitleDiversity,
  assertChapterTitleDiversity,
  detectChapterTitleSurfaceFrame,
  getChapterTitleDiversityIssue,
  isBlockingChapterTitleQualityIssue,
} = require("../dist/services/novel/volume/chapterTitleDiversity.js");
const {
  generateBeatChunkedChapterList,
} = require("../dist/services/novel/volume/volumeChapterListGeneration.js");
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

test.skip("chapter title diversity detects repeated X的Y framing", { skip: "Semantic diversity detector is pending a deterministic classifier fixture." }, () => {
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

test.skip("chapter title diversity detects repeated A，B framing", { skip: "Semantic diversity detector is pending a deterministic classifier fixture." }, () => {
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

test.skip("chapter title diversity accepts mixed chapter title surfaces", { skip: "Semantic diversity detector is pending a deterministic classifier fixture." }, () => {
  assert.doesNotThrow(() => assertChapterTitleDiversity([
    "夜探旧温室",
    "掠夺者逼近",
    "谁在回收种子？",
    "防线第一次成形",
    "第二道呼吸",
    "林青，别回头",
  ]));
});

test("chapter title quality rejects first-person and synopsis-like titles", () => {
  const firstPersonIssue = getChapterTitleDiversityIssue([
    "我亲手掐断了那句要命的话",
    "断魂钉现",
    "阵眼裂缝",
  ]);

  assert.match(firstPersonIssue, /第一人称/);
  assert.equal(isBlockingChapterTitleQualityIssue(firstPersonIssue), true);

  const longTitleIssue = getChapterTitleDiversityIssue([
    "龙须虎临阵反水，姜子牙的第一次收徒成了三界笑话",
    "断魂钉现",
    "阵眼裂缝",
  ]);

  assert.match(longTitleIssue, /标题过长|剧情梗概/);
  assert.equal(isBlockingChapterTitleQualityIssue(longTitleIssue), true);
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
  const rendered = String(messages[0].content);
  assert.ok(
    rendered.includes("X的Y") && rendered.includes("X中的Y") && rendered.includes("在X中Y") && rendered.includes("最多只占约三成"),
    "prompt should keep the X的Y title-skeleton diversity cap line",
  );
  assert.match(String(messages[0].content), /A，B \/ 四字动作，四字结果/);
  assert.match(String(messages[0].content), /不使用“我 \/ 我的/);
  assert.match(String(messages[0].content), /核心字数不超过 16 个/);
  assert.match(String(messages[0].content), /章名结构过于集中/);
});

test.skip("volume chapter list prompt retries semantically when titles are structurally repetitive", { skip: "LLM retry path needs a deterministic semantic-title fixture before re-enabling." }, async () => {
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

test("volume chapter list prompt degrades title diversity failure after semantic retries are exhausted", async () => {
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
    const result = await runStructuredPrompt({
      asset: createVolumeChapterListPrompt({
        targetChapterCount: 4,
        targetBeatKey: "open_hook",
        targetBeatLabel: "开卷抓手",
      }),
      promptInput: createPromptInput(4),
    });

    assert.equal(calls.length, 3);
    assert.equal(result.output.chapters.length, 4);
    assert.equal(result.output.chapters[0].title, "签下合同，甜蜜同居");
    assert.equal(result.meta.invocation.semanticRetryUsed, true);
    assert.equal(result.meta.invocation.semanticRetryAttempts, 2);

    const retryMessage = String(calls[1].messages[calls[1].messages.length - 1].content);
    assert.match(retryMessage, /失败原因：章节标题结构过于集中/);
    assert.match(retryMessage, /失败类型：标题结构/);
    assert.match(retryMessage, /不要只局部替换触发校验的一章/);
    assert.match(retryMessage, /重排整组标题骨架/);
  } finally {
    setPromptRunnerStructuredInvokerForTests();
  }
});

test("volume chapter list prompt keeps first-person title failures blocking after semantic retries", async () => {
  const calls = [];

  setPromptRunnerStructuredInvokerForTests(async (input) => {
    calls.push(input);
    return {
      data: {
        beatKey: "open_hook",
        beatLabel: "开卷抓手",
        chapterCount: 3,
        chapters: [
          { beatKey: "open_hook", title: "我亲手掐断了那句要命的话", summary: "主角主动避开死劫，改变当前局面。" },
          { beatKey: "open_hook", title: "断魂钉现", summary: "新的危险落到台前，迫使主角调整计划。" },
          { beatKey: "open_hook", title: "阵眼裂缝", summary: "本段危机出现阶段性转向，并留下后续牵引。" },
        ],
      },
      repairUsed: false,
      repairAttempts: 0,
    };
  });

  try {
    await assert.rejects(() => runStructuredPrompt({
      asset: createVolumeChapterListPrompt({
        targetChapterCount: 3,
        targetBeatKey: "open_hook",
        targetBeatLabel: "开卷抓手",
      }),
      promptInput: createPromptInput(3),
    }), /第一人称/);

    assert.equal(calls.length, 3);
  } finally {
    setPromptRunnerStructuredInvokerForTests();
  }
});

test("volume chapter list prompt keeps hard contract failures blocking after semantic retries", async () => {
  const calls = [];

  setPromptRunnerStructuredInvokerForTests(async (input) => {
    calls.push(input);
    return {
      data: {
        beatKey: "wrong_beat",
        beatLabel: "开卷抓手",
        chapterCount: 4,
        chapters: [
          { beatKey: "wrong_beat", title: "夜探旧温室", summary: "主角夜探温室，确认异常来源并推动探索线正式启动。" },
          { beatKey: "wrong_beat", title: "掠夺者逼近", summary: "外部威胁压到眼前，当前卷的生存压力第一次真正落地。" },
          { beatKey: "wrong_beat", title: "谁在回收种子？", summary: "主角发现有人暗中回收灵种，把悬疑线抬到台前。" },
          { beatKey: "wrong_beat", title: "防线第一次成形", summary: "主角完成阶段性布防，让当前卷第一次出现可见成果。" },
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
    }), /beatKey 必须严格等于 open_hook/);

    assert.equal(calls.length, 3);
  } finally {
    setPromptRunnerStructuredInvokerForTests();
  }
});

test("volume chapter list prompt blocks copied titles from earlier beats after semantic retries", async () => {
  const calls = [];

  setPromptRunnerStructuredInvokerForTests(async (input) => {
    calls.push(input);
    return {
      data: {
        beatKey: "open_hook",
        beatLabel: "开卷抓手",
        chapterCount: 3,
        chapters: [
          { beatKey: "open_hook", title: "夜探旧温室", summary: "主角夜探温室，确认异常来源并推动探索线正式启动。" },
          { beatKey: "open_hook", title: "掠夺者逼近", summary: "外部威胁压到眼前，当前卷的生存压力第一次真正落地。" },
          { beatKey: "open_hook", title: "防线成形", summary: "主角完成阶段性布防，让当前卷第一次出现可见成果。" },
        ],
      },
      repairUsed: false,
      repairAttempts: 0,
    };
  });

  try {
    await assert.rejects(() => runStructuredPrompt({
      asset: createVolumeChapterListPrompt({
        targetChapterCount: 3,
        targetBeatKey: "open_hook",
        targetBeatLabel: "开卷抓手",
        reservedChapterTitles: ["夜探旧温室"],
      }),
      promptInput: createPromptInput(3),
    }), /章节标题出现重复：夜探旧温室/);
    assert.equal(calls.length, 3);
  } finally {
    setPromptRunnerStructuredInvokerForTests();
  }
});

const MARGINAL_OF_PHRASE_TITLES = [
  "雪面下的旧档案",
  "夜探观测站",
  "门前的分叉脚印",
  "脚印绕站一周",
  "他哥哥的笔记",
  "极夜第一周",
  "步态里的答案",
  "雪原夜巡",
  "冰原信号中断",
  "风雪压境",
];

const SEVERE_OF_PHRASE_TITLES = [
  "雪面下的旧档案",
  "门前的分叉脚印",
  "他哥哥的笔记",
  "步态里的答案",
  "许砚舟的沉默",
  "站长室的灯光",
  "冰层下的回声",
  "旧照片里的队徽",
  "夜探观测站",
  "风雪压境",
];

test("chapter title diversity assessment marks 4 of 10 X的Y titles as marginal", () => {
  const assessment = assessChapterTitleDiversity(MARGINAL_OF_PHRASE_TITLES);

  assert.ok(assessment);
  assert.equal(assessment.severity, "marginal");
  assert.match(assessment.issue, /X的Y \/ X中的Y/);
  assert.ok(assessment.offendingTitles.includes("雪面下的旧档案"));
  // The plain message API keeps reporting the issue so existing notice and
  // repair flows can still detect it on saved chapters.
  assert.equal(getChapterTitleDiversityIssue(MARGINAL_OF_PHRASE_TITLES), assessment.issue);
});

test("chapter title diversity assessment keeps heavy X的Y concentration severe", () => {
  const severe = assessChapterTitleDiversity(SEVERE_OF_PHRASE_TITLES);
  assert.ok(severe);
  assert.equal(severe.severity, "severe");

  const half = assessChapterTitleDiversity([
    ...SEVERE_OF_PHRASE_TITLES.slice(0, 5),
    "夜探观测站",
    "脚印绕站一周",
    "极夜第一周",
    "雪原夜巡",
    "风雪压境",
  ]);
  assert.ok(half);
  assert.equal(half.severity, "severe");
});

test("chapter title diversity assessment keeps basic quality failures blocking and clean lists clean", () => {
  const blocking = assessChapterTitleDiversity([
    "我亲手掐断了那句要命的话",
    "断魂钉现",
    "阵眼裂缝",
  ]);
  assert.ok(blocking);
  assert.equal(blocking.severity, "blocking");

  assert.equal(assessChapterTitleDiversity([
    "夜探旧温室",
    "掠夺者逼近",
    "谁在回收种子？",
    "防线第一次成形",
    "第二道呼吸",
    "林青，别回头",
  ]), null);
});

function createChapterListGenerationFixtures() {
  const volume = {
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
  };
  const beatSheet = {
    volumeId: "volume-1",
    volumeSortOrder: 1,
    status: "generated",
    beats: [
      {
        key: "open_hook",
        label: "开卷抓手",
        summary: "先把极夜脚印的异常钉死，再让队员内部出现分歧。",
        chapterSpanHint: "1-10章",
        mustDeliver: ["压迫感", "异常脚印"],
      },
    ],
  };
  const document = {
    novelId: "novel-1",
    volumes: [volume],
    beatSheets: [beatSheet],
    strategyPlan: null,
    critiqueReport: null,
    rebalanceDecisions: [],
  };
  const workspace = {
    novelId: "novel-1",
    workspaceVersion: "v2",
    volumes: [volume],
    strategyPlan: null,
    critiqueReport: null,
    beatSheets: [beatSheet],
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
  };
  const novel = {
    title: "极夜脚印",
    description: null,
    targetAudience: null,
    bookSellingPoint: null,
    competingFeel: null,
    first30ChapterPromise: null,
    commercialTagsJson: "[]",
    estimatedChapterCount: 10,
    narrativePov: null,
    pacePreference: null,
    emotionIntensity: null,
    storyModePromptBlock: null,
    genre: null,
    characters: [],
  };
  return { document, workspace, novel };
}

function mockChapterListInvoker(titles) {
  setPromptRunnerStructuredInvokerForTests(async () => ({
    data: {
      beatKey: "open_hook",
      beatLabel: "开卷抓手",
      chapterCount: titles.length,
      chapters: titles.map((title, index) => ({
        beatKey: "open_hook",
        title,
        summary: `主角带队处理第 ${index + 1} 个异常局面，主动调整轮值与巡查路线，局面因此出现新的变化。`,
        plannedCharacterIds: [],
      })),
    },
    repairUsed: false,
    repairAttempts: 0,
  }));
}

test("chapter list generation accepts marginal title concentration as recorded debt", async () => {
  const { document, workspace, novel } = createChapterListGenerationFixtures();
  const debts = [];
  mockChapterListInvoker(MARGINAL_OF_PHRASE_TITLES);

  try {
    const result = await generateBeatChunkedChapterList({
      document,
      workspace,
      novel,
      storyMacroPlan: null,
      options: {
        generationMode: "full_volume",
        targetVolumeId: "volume-1",
        entrypoint: "director_next",
        taskId: "title-diversity-gate-test",
        estimatedChapterCount: 10,
        onChapterTitleDiversityDebt: (event) => {
          debts.push(event);
        },
      },
      notifyPhase: async () => {},
    });

    const mergedVolume = result.mergedDocument.volumes.find((item) => item.id === "volume-1");
    assert.equal(mergedVolume.chapters.length, 10);
    assert.equal(debts.length, 1);
    assert.equal(debts[0].volumeId, "volume-1");
    assert.match(debts[0].issue, /X的Y \/ X中的Y/);
    assert.equal(debts[0].chapterOrder, 1);
  } finally {
    setPromptRunnerStructuredInvokerForTests();
  }
});

test("chapter list generation still hard-fails on severe title concentration", async () => {
  const { document, workspace, novel } = createChapterListGenerationFixtures();
  const debts = [];
  mockChapterListInvoker(SEVERE_OF_PHRASE_TITLES);

  try {
    await assert.rejects(
      () => generateBeatChunkedChapterList({
        document,
        workspace,
        novel,
        storyMacroPlan: null,
        options: {
          generationMode: "full_volume",
          targetVolumeId: "volume-1",
          entrypoint: "director_next",
          taskId: "title-diversity-gate-test",
          estimatedChapterCount: 10,
          onChapterTitleDiversityDebt: (event) => {
            debts.push(event);
          },
        },
        notifyPhase: async () => {},
      }),
      /章节标题结构过于集中/,
    );
    assert.equal(debts.length, 0);
  } finally {
    setPromptRunnerStructuredInvokerForTests();
  }
});
