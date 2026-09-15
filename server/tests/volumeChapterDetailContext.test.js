const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildChapterDetailDraft,
  buildChapterNeighborContext,
  buildRecentChapterExecutionContext,
} = require("../dist/prompting/prompts/novel/volume/shared.js");
const {
  buildVolumeChapterDetailContextBlocks,
} = require("../dist/prompting/prompts/novel/volume/contextBlocks.js");
const {
  volumeChapterBoundaryPrompt,
  volumeChapterExecutionContractPrompt,
  volumeChapterTaskSheetPrompt,
} = require("../dist/prompting/prompts/novel/volume/chapterDetail.prompts.js");

function createScenePlan(sceneTitles) {
  return JSON.stringify({
    targetWordCount: 3000,
    lengthBudget: {
      targetWordCount: 3000,
      softMinWordCount: 2550,
      softMaxWordCount: 3450,
      hardMaxWordCount: 3750,
    },
    scenes: sceneTitles.map((title, index) => ({
      key: `scene_${index + 1}`,
      title,
      purpose: `${title} 的推进职责`,
      mustAdvance: [`${title} 的关键推进`],
      mustPreserve: ["卷内压力持续存在"],
      entryState: `${title} 前的局面`,
      exitState: `${title} 后的局面`,
      forbiddenExpansion: [`不要把 ${title} 写成重复套路`],
      targetWordCount: 1000,
    })),
  });
}

function createTargetVolume() {
  const now = new Date().toISOString();
  return {
    id: "volume-1",
    novelId: "novel-1",
    sortOrder: 1,
    title: "第一卷",
    summary: "测试卷摘要",
    openingHook: "主角被迫入局",
    mainPromise: "前期建立高压并完成第一次实质破局",
    primaryPressureSource: "高层压迫",
    coreSellingPoint: "持续压迫与反压回路",
    escalationMode: "从生存压迫切到主动试探",
    protagonistChange: "从被动求生到开始试探规则",
    midVolumeRisk: "压力正在升级",
    climax: "第一次大反压",
    payoffType: "阶段性收益",
    nextVolumeHook: "更大的规则浮出水面",
    resetPoint: null,
    openPayoffs: [],
    status: "active",
    sourceVersionId: null,
    createdAt: now,
    updatedAt: now,
    chapters: [
      {
        id: "chapter-1",
        volumeId: "volume-1",
        chapterOrder: 1,
        title: "寒夜街头",
        summary: "主角在寒夜与饥饿中确认自己没有退路。",
        purpose: null,
        exclusiveEvent: "确认无处可退，只能继续潜伏求生。",
        endingState: "主角确认自己暂时只能继续忍耐和潜伏。",
        nextChapterEntryState: "主角带着更强的警惕进入第二天劳作环境。",
        conflictLevel: 70,
        revealLevel: 25,
        targetWordCount: 3000,
        mustAvoid: null,
        taskSheet: "以环境压迫开场，主角被迫躲避风险，结尾留下更强追索压力。",
        sceneCards: createScenePlan(["寒夜压迫", "被动躲避", "危险逼近"]),
        payoffRefs: [],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "chapter-2",
        volumeId: "volume-1",
        chapterOrder: 2,
        title: "人群异样",
        summary: "主角在围观和怀疑中暴露异常，只能继续规避。",
        purpose: null,
        exclusiveEvent: "第一次被人群与怀疑正面锁定。",
        endingState: "主角意识到继续被动躲避只会让怀疑升级。",
        nextChapterEntryState: "主角必须换一种推进方式，不能再只靠挨压。",
        conflictLevel: 78,
        revealLevel: 35,
        targetWordCount: 3000,
        mustAvoid: null,
        taskSheet: "继续外部压迫推进，主角在围观和怀疑中暴露异常，结尾必须留下身份风险。",
        sceneCards: createScenePlan(["围观压迫", "被动试探", "身份风险钩子"]),
        payoffRefs: [],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "chapter-3",
        volumeId: "volume-1",
        chapterOrder: 3,
        title: "第一次换路",
        summary: "主角需要把推进方式切到主动试探和关系建立。",
        purpose: "把推进方式切到主动试探和关系建立，不能继续只靠被动挨压。",
        exclusiveEvent: "第一次正式把推进方式切到主动试探。",
        endingState: "主角已经找到可执行的主动试探切口。",
        nextChapterEntryState: "主角带着新的试探方案进入下一章执行。",
        conflictLevel: 82,
        revealLevel: 40,
        targetWordCount: 3000,
        mustAvoid: null,
        taskSheet: null,
        sceneCards: null,
        payoffRefs: [],
        createdAt: now,
        updatedAt: now,
      },
    ],
  };
}

function createPromptInput() {
  const targetVolume = createTargetVolume();
  return {
    novel: {
      title: "测试小说",
      description: "测试简介",
      targetAudience: "新手读者",
      bookSellingPoint: "降低门槛的强引导写作",
      competingFeel: null,
      first30ChapterPromise: "前30章持续兑现推进感",
      commercialTagsJson: JSON.stringify(["高压开局", "持续反压"]),
      estimatedChapterCount: 60,
      narrativePov: "third_person",
      pacePreference: "fast",
      emotionIntensity: "high",
      storyModePromptBlock: null,
      genre: { name: "都市异能" },
      characters: [
        { name: "主角", role: "主角", currentGoal: "活下来并找到破局点", currentState: "被压制" },
      ],
    },
    workspace: {
      novelId: "novel-1",
      workspaceVersion: "v2",
      volumes: [targetVolume],
      strategyPlan: null,
      critiqueReport: null,
      beatSheets: [],
      rebalanceDecisions: [],
      readiness: {
        volumeCountReady: true,
        beatSheetReady: true,
        chapterListReady: true,
      },
      source: "volume",
      activeVersionId: null,
    },
    storyMacroPlan: null,
    strategyPlan: null,
    targetVolume,
    targetBeatSheet: null,
    targetChapter: targetVolume.chapters[2],
    detailMode: "task_sheet",
  };
}

test("recent chapter execution context exposes prior task sheets and scene trajectories", () => {
  const targetVolume = createTargetVolume();
  const context = buildRecentChapterExecutionContext(targetVolume, "chapter-3");

  assert.match(context, /chapter 1: 寒夜街头/);
  assert.match(context, /task sheet: 以环境压迫开场/);
  assert.match(context, /opening scene: 寒夜压迫/);
  assert.match(context, /ending scene: 危险逼近/);
  assert.match(context, /chapter 2: 人群异样/);
  assert.match(context, /opening scene: 围观压迫/);
  assert.match(context, /ending scene: 身份风险钩子/);
});

test("volume chapter detail context blocks include recent execution contracts for anti-repeat planning", () => {
  const input = createPromptInput();
  const blocks = buildVolumeChapterDetailContextBlocks(input);
  const block = blocks.find((item) => item.id === "recent_execution_contracts");

  assert.ok(block);
  assert.match(block.content, /Recent execution contracts:/);
  assert.match(block.content, /chapter 2: 人群异样/);
  assert.match(block.content, /task sheet: 继续外部压迫推进/);
  assert.match(block.content, /opening scene: 围观压迫/);
});

test("task sheet draft context keeps current chapter purpose and boundary fields", () => {
  const targetVolume = createTargetVolume();
  const draft = buildChapterDetailDraft(targetVolume.chapters[2], "task_sheet");

  assert.match(draft, /current chapter title: 第一次换路/);
  assert.match(draft, /current chapter summary: 主角需要把推进方式切到主动试探和关系建立。/);
  assert.match(draft, /current purpose draft: 把推进方式切到主动试探和关系建立，不能继续只靠被动挨压。/);
  assert.match(draft, /exclusive event: 第一次正式把推进方式切到主动试探。/);
  assert.match(draft, /ending state: 主角已经找到可执行的主动试探切口。/);
  assert.match(draft, /next chapter entry state: 主角带着新的试探方案进入下一章执行。/);
  assert.match(draft, /conflict level: 82/);
  assert.match(draft, /reveal level: 40/);
  assert.match(draft, /target word count: 3000/);
});

test("chapter neighbor context exposes exclusive event and chapter state handoff", () => {
  const targetVolume = createTargetVolume();
  const context = buildChapterNeighborContext(targetVolume, "chapter-3");

  assert.match(context, /previous chapter: 2 人群异样/);
  assert.match(context, /exclusiveEvent=第一次被人群与怀疑正面锁定。/);
  assert.match(context, /endingState=主角意识到继续被动躲避只会让怀疑升级。/);
  assert.match(context, /nextEntry=主角必须换一种推进方式，不能再只靠挨压。/);
  assert.match(context, /current chapter: 3 第一次换路/);
  assert.match(context, /exclusiveEvent=第一次正式把推进方式切到主动试探。/);
});

test("task sheet post-validate rejects adjacent chapter event leakage", () => {
  const now = new Date().toISOString();
  const targetVolume = {
    id: "volume-boundary",
    novelId: "novel-1",
    sortOrder: 1,
    title: "第一卷",
    summary: "测试卷摘要",
    openingHook: "主角被迫入局",
    mainPromise: "前期建立高压并完成第一次实质破局",
    primaryPressureSource: "高层压迫",
    coreSellingPoint: "持续压迫与反压回路",
    escalationMode: "从生存压迫切到主动试探",
    protagonistChange: "从被动求生到开始试探规则",
    midVolumeRisk: "压力正在升级",
    climax: "第一次大反压",
    payoffType: "阶段性收益",
    nextVolumeHook: "更大的规则浮出水面",
    resetPoint: null,
    openPayoffs: [],
    status: "active",
    sourceVersionId: null,
    createdAt: now,
    updatedAt: now,
    chapters: [
      {
        id: "chapter-a",
        volumeId: "volume-boundary",
        chapterOrder: 1,
        title: "五代乱世，开局杂役",
        summary: "程秩穿越成节度使府最底层杂役，先建立乱世困境与底层处境。",
        purpose: "建立穿越困境与底层生存压迫，不提前兑现系统核心能力。",
        conflictLevel: 70,
        revealLevel: 20,
        targetWordCount: 3000,
        mustAvoid: "不要提前写系统激活和首次取银。",
        taskSheet: null,
        sceneCards: null,
        payoffRefs: [],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "chapter-b",
        volumeId: "volume-boundary",
        chapterOrder: 2,
        title: "脑中异响，系统激活",
        summary: "程秩在搬运杂物时意外激活系统，正式确认规则与第一笔奖励。",
        purpose: "承接前章困境，完成系统激活与风险认知。",
        conflictLevel: 78,
        revealLevel: 35,
        targetWordCount: 3200,
        mustAvoid: null,
        taskSheet: null,
        sceneCards: null,
        payoffRefs: [],
        createdAt: now,
        updatedAt: now,
      },
    ],
  };
  const input = {
    ...createPromptInput(),
    targetVolume,
    targetChapter: targetVolume.chapters[0],
  };
  const context = {
    blocks: [],
    selectedBlockIds: [],
    droppedBlockIds: [],
    summarizedBlockIds: [],
    estimatedInputTokens: 0,
  };
  const leakedOutput = {
    taskSheet: "本章要在高压劳作后直接写到系统激活，正式亮出金手指。",
    sceneCards: [
      {
        key: "scene_1",
        title: "系统激活",
        purpose: "让主角在本章末正式激活系统。",
        mustAdvance: ["完成系统激活"],
        mustPreserve: ["乱世压迫氛围"],
        entryState: "主角仍在杂役处境里苦撑。",
        exitState: "系统激活后看见新的翻身希望。",
        forbiddenExpansion: ["不要拖到下一章"],
        targetWordCount: 1000,
      },
    ],
  };

  assert.throws(
    () => volumeChapterTaskSheetPrompt.postValidate(leakedOutput, input, context),
    /系统激活/,
  );
});

test("boundary post-validate rejects duplicated exclusive event and mirrored state handoff", () => {
  const now = new Date().toISOString();
  const targetVolume = {
    id: "volume-boundary-2",
    novelId: "novel-1",
    sortOrder: 1,
    title: "第一卷",
    summary: "测试卷摘要",
    openingHook: "主角被迫入局",
    mainPromise: "前期建立高压并完成第一次实质破局",
    primaryPressureSource: "高层压迫",
    coreSellingPoint: "持续压迫与反压回路",
    escalationMode: "从生存压迫切到主动试探",
    protagonistChange: "从被动求生到开始试探规则",
    midVolumeRisk: "压力正在升级",
    climax: "第一次大反压",
    payoffType: "阶段性收益",
    nextVolumeHook: "更大的规则浮出水面",
    resetPoint: null,
    openPayoffs: [],
    status: "active",
    sourceVersionId: null,
    createdAt: now,
    updatedAt: now,
    chapters: [
      {
        id: "chapter-a",
        volumeId: "volume-boundary-2",
        chapterOrder: 1,
        title: "脑中异响，系统激活",
        summary: "程秩正式激活系统，明确第一笔奖励与风险。",
        purpose: "完成系统激活与风险认知。",
        exclusiveEvent: "系统正式激活。",
        endingState: "程秩知道系统能发钱，但还不敢取现。",
        nextChapterEntryState: "程秩带着已知规则进入下一章验证。",
        conflictLevel: 78,
        revealLevel: 35,
        targetWordCount: 3200,
        mustAvoid: "不要提前写第一次资源合理化。",
        taskSheet: null,
        sceneCards: null,
        payoffRefs: [],
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "chapter-b",
        volumeId: "volume-boundary-2",
        chapterOrder: 2,
        title: "碎银入手，危机暗藏",
        summary: "程秩第一次把银子提到现实，并意识到财富与身份冲突。",
        purpose: "完成第一次取银和藏银判断。",
        exclusiveEvent: null,
        endingState: null,
        nextChapterEntryState: null,
        conflictLevel: 82,
        revealLevel: 42,
        targetWordCount: 3200,
        mustAvoid: null,
        taskSheet: null,
        sceneCards: null,
        payoffRefs: [],
        createdAt: now,
        updatedAt: now,
      },
    ],
  };
  const input = {
    ...createPromptInput(),
    targetVolume,
    targetChapter: targetVolume.chapters[1],
    detailMode: "boundary",
  };
  const context = {
    blocks: [],
    selectedBlockIds: [],
    droppedBlockIds: [],
    summarizedBlockIds: [],
    estimatedInputTokens: 0,
  };

  assert.throws(
    () => volumeChapterBoundaryPrompt.postValidate({
      exclusiveEvent: "系统正式激活。",
      endingState: "程秩把银子藏好，准备继续观察。",
      nextChapterEntryState: "程秩把银子藏好，准备继续观察。",
      conflictLevel: 82,
      revealLevel: 42,
      targetWordCount: 3200,
      mustAvoid: "不要直接暴露财富。",
      payoffRefs: [],
    }, input, context),
    /独占事件|endingState 与 nextChapterEntryState/,
  );
});

test("execution contract post-validate keeps next chapter entry out of scene mustAdvance", () => {
  const now = new Date().toISOString();
  const targetVolume = {
    id: "volume-boundary-3",
    novelId: "novel-1",
    sortOrder: 1,
    title: "第一卷",
    summary: "测试卷摘要",
    openingHook: "主角被迫入局",
    mainPromise: "前期建立高压并完成第一次实质破局",
    primaryPressureSource: "高层压迫",
    coreSellingPoint: "持续压迫与反压回路",
    escalationMode: "从生存压迫切到主动试探",
    protagonistChange: "从被动求生到开始试探规则",
    midVolumeRisk: "压力正在升级",
    climax: "第一次大反压",
    payoffType: "阶段性收益",
    nextVolumeHook: "更大的规则浮出水面",
    resetPoint: null,
    openPayoffs: [],
    status: "active",
    sourceVersionId: null,
    createdAt: now,
    updatedAt: now,
    chapters: [
      {
        id: "chapter-a",
        volumeId: "volume-boundary-3",
        chapterOrder: 1,
        title: "工棚试探",
        summary: "程秩通过踏实做事取得赵铁柱初步信任，但工头开始不满。",
        purpose: "让程秩靠主动做事加深赵铁柱信任，并把工头不满埋成隐患。",
        exclusiveEvent: "程秩第一次获得赵铁柱明确信任。",
        endingState: "赵铁柱愿意私下提醒程秩，工头的不满也被程秩看见。",
        nextChapterEntryState: "发薪日到来，程秩发现自己的工资被工头克扣。",
        conflictLevel: 62,
        revealLevel: 28,
        targetWordCount: 3200,
        mustAvoid: "不要提前写发薪日工资被扣的现场冲突。",
        taskSheet: null,
        sceneCards: null,
        payoffRefs: ["赵铁柱信任", "工头不满"],
        createdAt: now,
        updatedAt: now,
      },
    ],
  };
  const input = {
    ...createPromptInput(),
    targetVolume,
    targetChapter: targetVolume.chapters[0],
    detailMode: "task_sheet",
  };
  const output = {
    purpose: "让程秩靠主动做事加深赵铁柱信任，并把工头不满埋成隐患。",
    exclusiveEvent: "程秩第一次获得赵铁柱明确信任。",
    endingState: "赵铁柱愿意私下提醒程秩，工头的不满也被程秩看见。",
    nextChapterEntryState: "发薪日到来，程秩发现自己的工资被工头克扣。",
    conflictLevel: 62,
    revealLevel: 28,
    targetWordCount: 3200,
    mustAvoid: "不要提前写发薪日工资被扣的现场冲突。",
    payoffRefs: ["赵铁柱信任", "工头不满"],
    taskSheet: "本章让程秩用行动换取赵铁柱进一步信任，同时让工头不满成为后续隐患。",
    readerExperience: {
      readerQuestion: "程秩能否在工棚里争到一个可信的帮手？",
      promisedReward: "赵铁柱对程秩的信任加深，工头不满被埋成下一步压力。",
      rewardLevel: "partial",
      protagonistWant: "程秩想通过踏实做事获得赵铁柱的信任和提醒。",
      primaryResistance: "工头盯着程秩，工棚里的杂役也不愿让新人冒头。",
      keyTurn: "赵铁柱看到程秩主动补位后，愿意私下提醒他。",
      emotionalShift: "从谨慎压抑转为短暂安定，又因工头目光生出警惕。",
      informationReveal: "赵铁柱知道工头克扣和刁难杂役的旧习。",
      netChange: "程秩获得一个可争取的基层帮手，也被工头记上一笔。",
      inheritedHookResponsibilities: [],
      endingHook: "发薪日的账目即将成为下一章压力入口。",
    },
    sceneCards: [
      {
        key: "scene_1",
        title: "工棚补位",
        purpose: "程秩主动替赵铁柱补上搬运缺口，争取一次被看见的机会。",
        mustAdvance: ["程秩主动补位"],
        mustPreserve: ["底层劳作压力"],
        entryState: "程秩仍是被工头盯着的新人。",
        exitState: "赵铁柱开始注意程秩不是偷懒的人。",
        forbiddenExpansion: ["不要提前写发薪日冲突"],
        targetWordCount: 1000,
        resistance: "工头故意加派杂活，其他杂役也怕被牵连。",
        turn: "程秩没有争辩，直接把最急的活先补上。",
        emotionalShift: "从被压着忍耐转为咬牙主动。",
        readerValue: "读者看到主角开始靠行动争取关系资源。",
      },
      {
        key: "scene_2",
        title: "私下提醒",
        purpose: "赵铁柱试探程秩后给出有限提醒，让信任关系向前一步。",
        mustAdvance: ["赵铁柱信任加深"],
        mustPreserve: ["赵铁柱仍不完全交底"],
        entryState: "赵铁柱开始观察程秩。",
        exitState: "程秩知道工头不是普通刁难。",
        forbiddenExpansion: ["不要揭开工头全部算计"],
        targetWordCount: 1100,
        resistance: "赵铁柱怕自己被拖下水，不愿明说。",
        turn: "程秩点出自己只求活路，赵铁柱松口。",
        emotionalShift: "戒备转为有限信任。",
        readerValue: "关系推进和信息回报同时落地。",
      },
      {
        key: "scene_3",
        title: "工头记账",
        purpose: "收束赵铁柱信任加深的结果，并让工头不满成为隐患。",
        mustAdvance: ["工头不满埋成隐患", "发薪日到来，程秩发现自己的工资被工头克扣"],
        mustPreserve: ["本章只埋隐患，不展开发薪日现场"],
        entryState: "程秩刚获得赵铁柱有限提醒。",
        exitState: "工头注意到赵铁柱帮程秩说话，暗中记下一笔。",
        forbiddenExpansion: ["不要写发薪日工资被扣的现场冲突"],
        targetWordCount: 1100,
        resistance: "工头把赵铁柱的提醒视为挑衅。",
        turn: "工头没有当场发难，只把账记到后面。",
        emotionalShift: "短暂安心转为不祥警惕。",
        readerValue: "本章关系收益落袋，同时形成下一章钩子。",
      },
    ],
  };

  assert.throws(
    () => volumeChapterExecutionContractPrompt.postValidate(output, input, {
      blocks: [],
      selectedBlockIds: [],
      droppedBlockIds: [],
      summarizedBlockIds: [],
      estimatedInputTokens: 0,
    }),
    /nextChapterEntryState/,
  );
});
