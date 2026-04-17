const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createChapterBoundarySchema,
  createChapterTaskSheetSchema,
  createVolumeBeatSheetSchema,
  createVolumeChapterBeatBlockSchema,
  createVolumeRebalanceSchema,
  createVolumeStrategySchema,
} = require("../dist/services/novel/volume/volumeGenerationSchemas.js");
const {
  buildVolumeWorkspaceDocument,
} = require("../dist/services/novel/volume/volumeWorkspaceDocument.js");
const {
  volumeBeatSheetPrompt,
} = require("../dist/prompting/prompts/novel/volume/beatSheet.prompts.js");
const {
  buildVolumeBeatSheetContextBlocks,
} = require("../dist/prompting/prompts/novel/volume/contextBlocks.js");
const {
  volumeRebalancePrompt,
} = require("../dist/prompting/prompts/novel/volume/rebalance.prompts.js");

function createValidStrategyPayload() {
  return {
    recommendedVolumeCount: 3,
    hardPlannedVolumeCount: 2,
    readerRewardLadder: "第一卷立钩，第二卷反压起势，第三卷转向中盘。",
    escalationLadder: "敌对压力从局部围堵升级为公开追杀。",
    midpointShift: "第三卷暴露真正对手与更大局势。",
    notes: "先锁前两卷，第三卷保留方向性承诺。",
    volumes: [
      {
        sortOrder: 1,
        planningMode: "hard",
        roleLabel: "开局立钩卷",
        coreReward: "快速建立主角困境与反击欲望。",
        escalationFocus: "压力源第一次正面压制。",
        uncertaintyLevel: "low",
      },
      {
        sortOrder: 2,
        planningMode: "hard",
        roleLabel: "反压起势卷",
        coreReward: "主角第一次拿到阶段性主动权。",
        escalationFocus: "敌我资源与代价同步抬高。",
        uncertaintyLevel: "low",
      },
      {
        sortOrder: 3,
        planningMode: "soft",
        roleLabel: "中盘转向卷",
        coreReward: "揭露更大棋局并抬高后续预期。",
        escalationFocus: "局势从个人冲突升级到阵营冲突。",
        uncertaintyLevel: "medium",
      },
    ],
    uncertainties: [
      {
        targetType: "volume",
        targetRef: "3",
        level: "medium",
        reason: "第三卷依赖后续角色站队和世界规则补充。",
      },
    ],
  };
}

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

test("volume strategy schema accepts a structurally aligned strategy plan", () => {
  const schema = createVolumeStrategySchema({
    maxVolumeCount: 6,
    allowedVolumeCountRange: { min: 1, max: 6 },
    hardPlannedVolumeRange: { min: 1, max: 6 },
  });
  const parsed = schema.safeParse(createValidStrategyPayload());
  assert.equal(parsed.success, true);
});

test("volume strategy schema rejects mismatched volume count and ordering rules", () => {
  const schema = createVolumeStrategySchema({
    maxVolumeCount: 6,
    allowedVolumeCountRange: { min: 1, max: 6 },
    hardPlannedVolumeRange: { min: 1, max: 6 },
  });
  const payload = createValidStrategyPayload();
  payload.recommendedVolumeCount = 4;
  payload.volumes[1].sortOrder = 3;
  payload.volumes[2].planningMode = "hard";

  const parsed = schema.safeParse(payload);
  assert.equal(parsed.success, false);
  const messages = parsed.success ? [] : parsed.error.issues.map((issue) => issue.message);
  assert.ok(messages.some((message) => message.includes("volumes")));
  assert.ok(messages.some((message) => message.includes("sortOrder")));
  assert.ok(messages.some((message) => message.includes("规划模式")));
});

test("volume strategy schema rejects fixed recommended count mismatches", () => {
  const schema = createVolumeStrategySchema({
    maxVolumeCount: 16,
    allowedVolumeCountRange: { min: 8, max: 13 },
    fixedRecommendedVolumeCount: 10,
    hardPlannedVolumeRange: { min: 2, max: 4 },
  });
  const payload = {
    ...createValidStrategyPayload(),
    recommendedVolumeCount: 9,
    hardPlannedVolumeCount: 4,
    volumes: Array.from({ length: 9 }, (_, index) => ({
      sortOrder: index + 1,
      planningMode: index < 4 ? "hard" : "soft",
      roleLabel: `第${index + 1}卷职责`,
      coreReward: `第${index + 1}卷核心回报`,
      escalationFocus: `第${index + 1}卷升级焦点`,
      uncertaintyLevel: index < 4 ? "low" : "medium",
    })),
  };

  const parsed = schema.safeParse(payload);
  assert.equal(parsed.success, false);
  const messages = parsed.success ? [] : parsed.error.issues.map((issue) => issue.message);
  assert.ok(messages.some((message) => message.includes("recommendedVolumeCount 必须严格等于 10")));
});

test("volume strategy schema rejects hard planned counts outside configured range", () => {
  const schema = createVolumeStrategySchema({
    maxVolumeCount: 16,
    allowedVolumeCountRange: { min: 8, max: 13 },
    hardPlannedVolumeRange: { min: 2, max: 4 },
  });
  const payload = {
    ...createValidStrategyPayload(),
    recommendedVolumeCount: 9,
    hardPlannedVolumeCount: 5,
    volumes: Array.from({ length: 9 }, (_, index) => ({
      sortOrder: index + 1,
      planningMode: index < 5 ? "hard" : "soft",
      roleLabel: `第${index + 1}卷职责`,
      coreReward: `第${index + 1}卷核心回报`,
      escalationFocus: `第${index + 1}卷升级焦点`,
      uncertaintyLevel: index < 5 ? "low" : "medium",
    })),
  };

  const parsed = schema.safeParse(payload);
  assert.equal(parsed.success, false);
  const issues = parsed.success ? [] : parsed.error.issues;
  assert.ok(issues.some((issue) => issue.path[0] === "hardPlannedVolumeCount"));
});

test("volume beat sheet schema normalizes alias fields and wrapped payloads", () => {
  const schema = createVolumeBeatSheetSchema();
  const parsed = schema.parse({
    beatSheet: {
      beats: [
        {
          beatKey: "open_hook",
          beatLabel: "开卷抓手",
          description: "先把世界危险和主角当前困境钉死。",
          chapterRange: "1-2章",
          deliverables: "压迫感，主角处境，首个异常信号",
        },
        {
          id: "first_escalation",
          name: "第一次升级",
          detail: "让主角第一次拿到能反制局面的抓手。",
          chapterWindow: "3章",
          requiredPayoffs: ["阶段优势", "局面变化"],
        },
        {
          stageKey: "midpoint_turn",
          stageLabel: "中段转向",
          content: "把本卷方向从单点求生切到更大的局势判断。",
          spanHint: "4-5章",
          mustHit: ["新情报", "旧判断失效"],
        },
        {
          key: "pressure_lock",
          label: "高潮前挤压",
          summary: "把敌方优势和主角代价同时顶到卷内上限。",
          chapterSpanHint: "6章",
          mustDeliver: ["压力堆高", "选择代价"],
        },
        {
          key: "climax",
          label: "卷高潮",
          summary: "完成本卷主承诺的正面兑现。",
          chapterSpanHint: "7章",
          mustDeliver: ["正面对决", "阶段兑现"],
        },
        {
          key: "end_hook",
          label: "卷尾钩子",
          summary: "用新威胁或新目标把下一卷打开。",
          chapterSpanHint: "8章",
          mustDeliver: ["余震", "下卷钩子"],
        },
      ],
    },
  });

  assert.equal(parsed.beats.length, 6);
  assert.equal(parsed.beats[0].summary, "先把世界危险和主角当前困境钉死。");
  assert.equal(parsed.beats[0].chapterSpanHint, "1-2章");
  assert.deepEqual(parsed.beats[0].mustDeliver, ["压迫感", "主角处境", "首个异常信号"]);
  assert.equal(parsed.beats[1].key, "first_escalation");
  assert.equal(parsed.beats[2].label, "中段转向");
});

test("volume chapter beat block schema normalizes beat aliases and enforces beat ownership", () => {
  const schema = createVolumeChapterBeatBlockSchema({
    exactChapterCount: 2,
    expectedBeatKey: "open_hook",
    expectedBeatLabel: "开卷抓手",
  });
  const parsed = schema.parse({
    beat: "open_hook",
    label: "开卷抓手",
    count: 2,
    items: [
      {
        chapterTitle: "第一束异常光",
        description: "主角第一次看见危险信号，把卷内压迫落到眼前。",
        beat: "open_hook",
      },
      {
        name: "封锁线内侧",
        content: "主角被迫进入更危险的区域，让本卷生存承诺正式成立。",
        beat_key: "open_hook",
      },
    ],
  });

  assert.equal(parsed.beatKey, "open_hook");
  assert.equal(parsed.beatLabel, "开卷抓手");
  assert.equal(parsed.chapterCount, 2);
  assert.equal(parsed.chapters[1].beatKey, "open_hook");
});

test("chapter boundary schema normalizes structured boundary aliases", () => {
  const schema = createChapterBoundarySchema();
  const parsed = schema.parse({
    独占事件: "第一次正式提取碎银。",
    本章结束状态: "程秩已经意识到钱能拿，但暂时不敢花。",
    下章入口状态: "程秩带着藏银压力进入下一章继续观察人和事。",
    冲突等级: "82",
    reveal_level: 41,
    字数: "3200",
    避免事项: "不要直接把后续请缨节点提前写掉。",
    关联兑现: "第一笔资源,财富风险认知",
  });

  assert.equal(parsed.exclusiveEvent, "第一次正式提取碎银。");
  assert.equal(parsed.endingState, "程秩已经意识到钱能拿，但暂时不敢花。");
  assert.equal(parsed.nextChapterEntryState, "程秩带着藏银压力进入下一章继续观察人和事。");
  assert.equal(parsed.conflictLevel, 82);
  assert.equal(parsed.revealLevel, 41);
  assert.equal(parsed.targetWordCount, 3200);
  assert.equal(parsed.mustAvoid, "不要直接把后续请缨节点提前写掉。");
  assert.deepEqual(parsed.payoffRefs, ["第一笔资源", "财富风险认知"]);
});

test("volume workspace document preserves chapter beat keys", () => {
  const document = buildVolumeWorkspaceDocument({
    novelId: "novel-1",
    volumes: [
      {
        ...createVolume(1),
        chapters: [
          {
            id: "chapter-1",
            volumeId: "volume-1",
            chapterOrder: 1,
            beatKey: "open_hook",
            title: "第一束异常光",
            summary: "主角第一次看见危险信号。",
            purpose: null,
            conflictLevel: null,
            revealLevel: null,
            targetWordCount: null,
            mustAvoid: null,
            taskSheet: null,
            sceneCards: null,
            payoffRefs: [],
            createdAt: new Date(0).toISOString(),
            updatedAt: new Date(0).toISOString(),
          },
        ],
      },
    ],
    beatSheets: [
      {
        volumeId: "volume-1",
        volumeSortOrder: 1,
        status: "generated",
        beats: [
          {
            key: "open_hook",
            label: "开卷抓手",
            summary: "先把局势危险钉死。",
            chapterSpanHint: "1章",
            mustDeliver: ["压迫感"],
          },
        ],
      },
    ],
  });

  assert.equal(document.volumes[0].chapters[0].beatKey, "open_hook");
});

test("volume beat sheet prompt render includes explicit JSON field contract", () => {
  const messages = volumeBeatSheetPrompt.render({
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
    targetChapterCount: 18,
  }, {
    blocks: [],
    selectedBlockIds: [],
    droppedBlockIds: [],
    summarizedBlockIds: [],
    estimatedInputTokens: 0,
  });

  const systemPrompt = String(messages[0].content);
  assert.match(systemPrompt, /"beats"/);
  assert.match(systemPrompt, /"summary"/);
  assert.match(systemPrompt, /"chapterSpanHint"/);
  assert.match(systemPrompt, /"mustDeliver"/);
  assert.match(systemPrompt, /5-8/);
  assert.match(systemPrompt, /Current volume target chapter count: 18/);
  assert.match(systemPrompt, /volume-local numbering only/);
});

test("volume beat sheet context blocks include the current volume chapter target", () => {
  const blocks = buildVolumeBeatSheetContextBlocks({
    novel: { characters: [] },
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
    targetChapterCount: 18,
  });

  assert.ok(blocks.some((block) => block.group === "target_chapter_count" && block.content.includes("Target chapter count: 18")));
});

test("volume rebalance schema normalizes wrapped arrays, numeric refs, and direction aliases", () => {
  const schema = createVolumeRebalanceSchema();
  const parsed = schema.parse([
    {
      anchorVolumeId: 1,
      affectedVolumeId: "volume 2",
      direction: "forward",
      severity: "high",
      summary: "当前卷过长，需要把一部分推进后移。",
      actions: "expand adjacent volume\nrebalance chapter budget",
    },
    {
      anchorVolumeId: 3,
      affectedVolumeId: 2,
      direction: "backward",
      severity: "minor",
      summary: "暂无明显失衡，但先保留观察。",
      actions: ["hold"],
    },
  ]);

  assert.equal(parsed.decisions.length, 2);
  assert.equal(parsed.decisions[0].anchorVolumeId, "1");
  assert.equal(parsed.decisions[0].affectedVolumeId, "2");
  assert.equal(parsed.decisions[0].direction, "push_back");
  assert.deepEqual(parsed.decisions[0].actions, ["expand adjacent volume", "rebalance chapter budget"]);
  assert.equal(parsed.decisions[1].direction, "hold");
  assert.equal(parsed.decisions[1].severity, "low");
});

test("volume workspace document resolves rebalance decisions written as volume order refs", () => {
  const document = buildVolumeWorkspaceDocument({
    novelId: "novel-1",
    volumes: [createVolume(1), createVolume(2), createVolume(3)],
    strategyPlan: null,
    critiqueReport: null,
    beatSheets: [],
    rebalanceDecisions: [
      {
        anchorVolumeId: "1",
        affectedVolumeId: "volume 2",
        direction: "forward",
        severity: "high",
        summary: "把部分推进延后到下一卷。",
        actions: ["expand adjacent volume"],
      },
    ],
    source: "volume",
    activeVersionId: null,
  });

  assert.equal(document.rebalanceDecisions.length, 1);
  assert.equal(document.rebalanceDecisions[0].anchorVolumeId, "volume-1");
  assert.equal(document.rebalanceDecisions[0].affectedVolumeId, "volume-2");
  assert.equal(document.rebalanceDecisions[0].direction, "push_back");
});

test("volume rebalance prompt render explains order-based id contract and enum directions", () => {
  const messages = volumeRebalancePrompt.render({
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
    anchorVolume: createVolume(1),
    previousVolume: createVolume(0),
    nextVolume: createVolume(2),
  }, {
    blocks: [],
    selectedBlockIds: [],
    droppedBlockIds: [],
    summarizedBlockIds: [],
    estimatedInputTokens: 0,
  });

  const systemPrompt = String(messages[0].content);
  assert.match(systemPrompt, /卷序号字符串/);
  assert.match(systemPrompt, /pull_forward、push_back、tighten_current、expand_adjacent、hold/);
  assert.match(systemPrompt, /"decisions"/);
});

test("chapter task sheet schema parses taskSheet plus aliased scene cards", () => {
  const schema = createChapterTaskSheetSchema();
  const parsed = schema.parse({
    task_sheet: "本章先让主角接住情报，再完成第一次明确反压，最后留下更大威胁。",
    scenes: [
      {
        sceneKey: "intel_handover",
        sceneTitle: "接住情报",
        objective: "让女二把关键情报送到主角手里。",
        mustAdvanceItems: "情报到手,反压起点成立",
        mustPreserveItems: ["女二仍有保留", "压迫感不能消失"],
        startState: "主角被压制，情报链还断着。",
        endState: "主角确认反压切入口已经成立。",
        forbidden: "不要提前揭露幕后黑手",
        wordCount: "900",
      },
      {
        id: "first_counterattack",
        label: "第一次反压",
        goal: "把情报转成看得见的反压收益。",
        deliverables: ["明确收益", "敌方被迫应对"],
        preserveItems: "资源差距仍在,主角不算完全翻盘",
        openingState: "主角刚拿到情报，准备落子。",
        closingState: "主角拿到阶段性主动权，但代价同步抬高。",
        mustAvoid: ["不要洗白敌方", "不要直接大决战"],
        budget: 1200,
      },
      {
        key: "end_hook",
        title: "尾段钩子",
        purpose: "把新的更大威胁钉到章末。",
        mustAdvance: ["新的威胁出现"],
        mustPreserve: ["本章反压收益仍然有效"],
        entryState: "主角刚完成第一次反压。",
        exitState: "读者明确知道下一章压力会更高。",
        forbiddenExpansion: ["不要展开下章战斗"],
        targetWordCount: 800,
      },
    ],
  });

  assert.equal(parsed.taskSheet.includes("第一次明确反压"), true);
  assert.equal(parsed.sceneCards.length, 3);
  assert.equal(parsed.sceneCards[0].title, "接住情报");
  assert.deepEqual(parsed.sceneCards[1].mustAdvance, ["明确收益", "敌方被迫应对"]);
  assert.deepEqual(parsed.sceneCards[1].forbiddenExpansion, ["不要洗白敌方", "不要直接大决战"]);
  assert.equal(parsed.sceneCards[2].targetWordCount, 800);
});
