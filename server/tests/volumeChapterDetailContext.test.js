const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildRecentChapterExecutionContext,
} = require("../dist/prompting/prompts/novel/volume/shared.js");
const {
  buildVolumeChapterDetailContextBlocks,
} = require("../dist/prompting/prompts/novel/volume/contextBlocks.js");

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
        purpose: null,
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
