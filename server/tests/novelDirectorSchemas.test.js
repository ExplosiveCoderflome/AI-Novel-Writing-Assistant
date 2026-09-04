const test = require("node:test");
const assert = require("node:assert/strict");
const {
  directorCandidateResponseSchema,
  directorPersistedCandidateSchema,
  directorBookContractSchema,
  normalizeDirectorTitleSuggestionStyle,
} = require("../dist/services/novel/director/runtime/novelDirectorSchemas.js");
const {
  normalizeCandidate,
  normalizeBookContract,
  selectDistinctCandidateTitle,
  toBookSpec,
} = require("../dist/services/novel/director/runtime/novelDirectorHelpers.js");

test("director persisted candidates preserve the AI-resolved production foundation", () => {
  const parsed = directorPersistedCandidateSchema.parse({
    id: "candidate-1",
    workingTitle: "底座贯穿测试",
    logline: "主角在失控秩序中逐步夺回主动权。",
    positioning: "男频成长型网文",
    sellingPoint: "每轮危机都带来可见成长",
    coreConflict: "个人成长与旧秩序压制",
    protagonistPath: "从求生到建立自己的规则",
    endingDirection: "完成阶段性反制并打开更大舞台",
    hookStrategy: "危机开篇",
    progressionLoop: "受压、破局、收益、升级",
    whyItFits: "适合稳定连载和阶段回报",
    toneKeywords: ["紧凑", "成长"],
    targetChapterCount: 120,
    productionFoundation: {
      summary: "玄幻升级题材，以阶段任务持续推进。",
      genre: {
        id: "genre-1",
        name: "东方玄幻",
        path: "玄幻/东方玄幻",
        reason: "世界规则和能力成长是主要吸引力。",
      },
      primaryStoryMode: {
        id: "mode-1",
        name: "升级成长",
        path: "成长/升级",
        reason: "核心冲突需要连续的能力与地位变化。",
      },
      secondaryStoryMode: null,
      caution: "避免只有数值变化而没有剧情代价。",
      recommendedAt: "2026-08-05T00:00:00.000Z",
    },
  });

  assert.equal(parsed.productionFoundation.genre.id, "genre-1");
  assert.equal(parsed.productionFoundation.primaryStoryMode.id, "mode-1");
  assert.equal(parsed.productionFoundation.caution, "避免只有数值变化而没有剧情代价。");
});

test("normalizeDirectorTitleSuggestionStyle handles common variants", () => {
  assert.equal(normalizeDirectorTitleSuggestionStyle("high-concept"), "high_concept");
  assert.equal(normalizeDirectorTitleSuggestionStyle("HIGH_CONCEPT"), "high_concept");
  assert.equal(normalizeDirectorTitleSuggestionStyle("Suspense"), "suspense");
  assert.equal(normalizeDirectorTitleSuggestionStyle("悬疑"), "suspense");
  assert.equal(normalizeDirectorTitleSuggestionStyle("高概念"), "high_concept");
  assert.equal(normalizeDirectorTitleSuggestionStyle(""), "literary");
  assert.equal(normalizeDirectorTitleSuggestionStyle("totally_unknown_label_xyz"), "literary");
});

test("directorCandidateResponseSchema accepts normalized titleOptions.style", () => {
  const parsed = directorCandidateResponseSchema.parse({
    candidates: [
      {
        workingTitle: "测试书名一",
        titleOptions: [
          {
            title: "备选一",
            clickRate: 80,
            style: "high-concept",
          },
        ],
        logline: "logline one",
        positioning: "pos",
        sellingPoint: "sell",
        coreConflict: "conflict",
        protagonistPath: "path",
        endingDirection: "end",
        hookStrategy: "hook",
        progressionLoop: "loop",
        whyItFits: "fit",
        recommendedWritingPlatform: "fanqie_free",
        writingPlatformReason: "适合快节奏移动端追读。",
        toneKeywords: ["a", "b"],
        targetChapterCount: 30,
      },
      {
        workingTitle: "测试书名二",
        titleOptions: [{ title: "备选二", clickRate: 70, style: "悬疑" }],
        logline: "logline two",
        positioning: "pos",
        sellingPoint: "sell",
        coreConflict: "conflict",
        protagonistPath: "path",
        endingDirection: "end",
        hookStrategy: "hook",
        progressionLoop: "loop",
        whyItFits: "fit",
        recommendedWritingPlatform: "jinjiang_female",
        writingPlatformReason: "人物关系与情绪因果更匹配。",
        toneKeywords: ["c", "d"],
        targetChapterCount: 40,
      },
    ],
  });
  assert.equal(parsed.candidates[0].titleOptions[0].style, "high_concept");
  assert.equal(parsed.candidates[1].titleOptions[0].style, "suspense");
});

test("directorCandidateResponseSchema preserves long novel chapter targets", () => {
  const parsed = directorCandidateResponseSchema.parse({
    candidates: [
      {
        workingTitle: "长篇测试",
        logline: "logline",
        positioning: "pos",
        sellingPoint: "sell",
        coreConflict: "conflict",
        protagonistPath: "path",
        endingDirection: "end",
        hookStrategy: "hook",
        progressionLoop: "loop",
        whyItFits: "fit",
        recommendedWritingPlatform: "qidian_male",
        writingPlatformReason: "成长目标和能力升级链清晰。",
        toneKeywords: ["a", "b"],
        targetChapterCount: 430,
      },
      {
        workingTitle: "长篇测试二",
        logline: "logline two",
        positioning: "pos",
        sellingPoint: "sell",
        coreConflict: "conflict",
        protagonistPath: "path",
        endingDirection: "end",
        hookStrategy: "hook",
        progressionLoop: "loop",
        whyItFits: "fit",
        recommendedWritingPlatform: "fanqie_free",
        writingPlatformReason: "适合持续冲突和阶段回报。",
        toneKeywords: ["c", "d"],
        targetChapterCount: 360,
      },
    ],
  });

  assert.equal(parsed.candidates[0].targetChapterCount, 430);
});

test("director helper normalization keeps explicit long-form chapter counts", () => {
  const candidate = normalizeCandidate({
    workingTitle: "长篇测试",
    logline: "logline",
    positioning: "pos",
    sellingPoint: "sell",
    coreConflict: "conflict",
    protagonistPath: "path",
    endingDirection: "end",
    hookStrategy: "hook",
    progressionLoop: "loop",
    whyItFits: "fit",
    toneKeywords: ["a", "b"],
    targetChapterCount: 430,
  }, 0);
  const bookSpec = toBookSpec(candidate, "长篇故事", 430);

  assert.equal(candidate.targetChapterCount, 430);
  assert.equal(bookSpec.targetChapterCount, 430);
});

test("director candidate title selection promotes a distinct alternative across one batch", () => {
  const candidate = normalizeCandidate({
    workingTitle: "退婚宴上我觉醒了凤魂",
    titleOptions: [],
    logline: "logline",
    positioning: "pos",
    sellingPoint: "sell",
    coreConflict: "conflict",
    protagonistPath: "path",
    endingDirection: "end",
    hookStrategy: "hook",
    progressionLoop: "loop",
    whyItFits: "fit",
    toneKeywords: ["a", "b"],
    targetChapterCount: 80,
  }, 1);
  candidate.titleOptions = [
    { title: "退婚宴上我觉醒了凤魂", clickRate: 92, style: "high_concept" },
    { title: "被弃庶女，我以凤魂镇九州", clickRate: 90, style: "conflict" },
  ];

  const resolved = selectDistinctCandidateTitle(candidate, ["退婚宴上我觉醒了凤魂"]);

  assert.equal(resolved?.workingTitle, "被弃庶女，我以凤魂镇九州");
  assert.equal(resolved?.titleOptions[0]?.title, "被弃庶女，我以凤魂镇九州");
});

test("director candidate title selection rejects a group with no distinct title", () => {
  const candidate = normalizeCandidate({
    workingTitle: "退婚宴上我觉醒了凤魂",
    titleOptions: [],
    logline: "logline",
    positioning: "pos",
    sellingPoint: "sell",
    coreConflict: "conflict",
    protagonistPath: "path",
    endingDirection: "end",
    hookStrategy: "hook",
    progressionLoop: "loop",
    whyItFits: "fit",
    toneKeywords: ["a", "b"],
    targetChapterCount: 80,
  }, 1);
  candidate.titleOptions = [
    { title: "《退婚宴上我觉醒了凤魂》", clickRate: 92, style: "high_concept" },
  ];

  assert.equal(selectDistinctCandidateTitle(candidate, ["退婚宴上我觉醒了凤魂"]), null);
});

test("directorBookContractSchema tolerates overflow red lines and normalization trims them to six", () => {
  const parsed = directorBookContractSchema.parse({
    readingPromise: "持续提供追读满足感",
    protagonistFantasy: "主角掌握独家优势",
    coreSellingPoint: "垃圾堆侦探美学",
    chapter3Payoff: "前三章完成机械遗骸发现",
    chapter10Payoff: "第十章完成首次反制",
    chapter30Payoff: "第三十章完成中段认知翻转",
    escalationLadder: "解码越深，代价越高",
    relationshipMainline: "临时盟友与背叛风险持续拉扯",
    absoluteRedLines: [
      "禁区 1",
      "禁区 2",
      "禁区 3",
      "禁区 4",
      "禁区 5",
      "禁区 6",
      "禁区 7",
      "禁区 2",
    ],
  });

  const normalized = normalizeBookContract(parsed);
  assert.equal(parsed.absoluteRedLines.length, 8);
  assert.deepEqual(normalized.absoluteRedLines, [
    "禁区 1",
    "禁区 2",
    "禁区 3",
    "禁区 4",
    "禁区 5",
    "禁区 6",
  ]);
});
