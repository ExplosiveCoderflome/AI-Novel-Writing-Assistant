const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createVolumeBeatSheetSchema,
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
  const schema = createVolumeStrategySchema(6);
  const parsed = schema.safeParse(createValidStrategyPayload());
  assert.equal(parsed.success, true);
});

test("volume strategy schema rejects mismatched volume count and ordering rules", () => {
  const schema = createVolumeStrategySchema(6);
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
