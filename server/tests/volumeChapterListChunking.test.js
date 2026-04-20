const test = require("node:test");
const assert = require("node:assert/strict");

const promptRunner = require("../dist/prompting/core/promptRunner.js");
const {
  generateBeatChunkedChapterList,
} = require("../dist/services/novel/volume/volumeChapterListGeneration.js");
const {
  mergeChapterList,
} = require("../dist/services/novel/volume/volumeGenerationHelpers.js");
const {
  buildVolumeWorkspaceDocument,
} = require("../dist/services/novel/volume/volumeWorkspaceDocument.js");

function createChapter(input) {
  return {
    id: input.id,
    volumeId: "volume-1",
    chapterOrder: input.chapterOrder,
    beatKey: input.beatKey ?? null,
    title: input.title,
    summary: input.summary,
    purpose: input.purpose ?? null,
    conflictLevel: input.conflictLevel ?? null,
    revealLevel: input.revealLevel ?? null,
    targetWordCount: input.targetWordCount ?? null,
    mustAvoid: input.mustAvoid ?? null,
    taskSheet: input.taskSheet ?? null,
    sceneCards: input.sceneCards ?? null,
    payoffRefs: input.payoffRefs ?? [],
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

function createDocument() {
  return buildVolumeWorkspaceDocument({
    novelId: "novel-1",
    volumes: [
      {
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
        chapters: [
          createChapter({
            id: "chapter-1",
            chapterOrder: 1,
            beatKey: "open_hook",
            title: "旧开卷一",
            summary: "旧开卷摘要一",
            purpose: "保留旧 purpose 1",
          }),
          createChapter({
            id: "chapter-2",
            chapterOrder: 2,
            beatKey: "open_hook",
            title: "旧开卷二",
            summary: "旧开卷摘要二",
            purpose: "保留旧 purpose 2",
          }),
          createChapter({
            id: "chapter-3",
            chapterOrder: 3,
            beatKey: "mid_turn",
            title: "旧转向一",
            summary: "旧转向摘要一",
            purpose: "保留旧 purpose 3",
          }),
          createChapter({
            id: "chapter-4",
            chapterOrder: 4,
            beatKey: "mid_turn",
            title: "旧转向二",
            summary: "旧转向摘要二",
            purpose: "保留旧 purpose 4",
          }),
        ],
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
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
            chapterSpanHint: "1-2章",
            mustDeliver: ["压迫感"],
          },
          {
            key: "mid_turn",
            label: "中段转向",
            summary: "让局势方向发生变化。",
            chapterSpanHint: "3-4章",
            mustDeliver: ["转向"],
          },
        ],
      },
    ],
  });
}

test("mergeChapterList writes explicit beat keys for full-volume beat blocks", () => {
  const document = createDocument();
  const merged = mergeChapterList(
    document,
    "volume-1",
    document.beatSheets[0],
    [
      {
        beatKey: "open_hook",
        beatLabel: "开卷抓手",
        chapterCount: 2,
        chapters: [
          { beatKey: "open_hook", title: "新的开卷一", summary: "新的开卷摘要一" },
          { beatKey: "open_hook", title: "新的开卷二", summary: "新的开卷摘要二" },
        ],
      },
      {
        beatKey: "mid_turn",
        beatLabel: "中段转向",
        chapterCount: 2,
        chapters: [
          { beatKey: "mid_turn", title: "新的转向一", summary: "新的转向摘要一" },
          { beatKey: "mid_turn", title: "新的转向二", summary: "新的转向摘要二" },
        ],
      },
    ],
  );

  const chapters = merged.volumes[0].chapters;
  assert.equal(chapters.length, 4);
  assert.deepEqual(chapters.map((chapter) => chapter.beatKey), ["open_hook", "open_hook", "mid_turn", "mid_turn"]);
  assert.equal(chapters[0].purpose, "保留旧 purpose 1");
  assert.equal(chapters[2].title, "新的转向一");
});

test("mergeChapterList single-beat mode only replaces the targeted beat block", () => {
  const document = createDocument();
  const merged = mergeChapterList(
    document,
    "volume-1",
    document.beatSheets[0],
    [
      {
        beatKey: "mid_turn",
        beatLabel: "中段转向",
        chapterCount: 2,
        chapters: [
          { beatKey: "mid_turn", title: "重写转向一", summary: "重写转向摘要一" },
          { beatKey: "mid_turn", title: "重写转向二", summary: "重写转向摘要二" },
        ],
      },
    ],
    {
      generationMode: "single_beat",
      targetBeatKey: "mid_turn",
    },
  );

  const chapters = merged.volumes[0].chapters;
  assert.equal(chapters.length, 4);
  assert.equal(chapters[0].title, "旧开卷一");
  assert.equal(chapters[1].title, "旧开卷二");
  assert.equal(chapters[2].title, "重写转向一");
  assert.equal(chapters[3].title, "重写转向二");
  assert.equal(chapters[2].purpose, "保留旧 purpose 3");
});

test("mergeChapterList full-volume resume preserves completed prefix beats", () => {
  const document = createDocument();
  const merged = mergeChapterList(
    document,
    "volume-1",
    document.beatSheets[0],
    [
      {
        beatKey: "mid_turn",
        beatLabel: "中段转向",
        chapterCount: 2,
        chapters: [
          { beatKey: "mid_turn", title: "续跑转向一", summary: "续跑转向摘要一" },
          { beatKey: "mid_turn", title: "续跑转向二", summary: "续跑转向摘要二" },
        ],
      },
    ],
    {
      generationMode: "full_volume",
      resumeFromBeatKey: "mid_turn",
    },
  );

  const chapters = merged.volumes[0].chapters;
  assert.equal(chapters.length, 4);
  assert.equal(chapters[0].title, "旧开卷一");
  assert.equal(chapters[1].title, "旧开卷二");
  assert.equal(chapters[2].title, "续跑转向一");
  assert.equal(chapters[3].title, "续跑转向二");
  assert.equal(chapters[0].purpose, "保留旧 purpose 1");
});

test("generateBeatChunkedChapterList skips full-volume regeneration when all beats are already complete", async () => {
  const document = createDocument();
  const originalRunStructuredPrompt = promptRunner.runStructuredPrompt;
  let promptCallCount = 0;
  const notifyCalls = [];

  promptRunner.runStructuredPrompt = async () => {
    promptCallCount += 1;
    throw new Error("should not generate chapter list again");
  };

  try {
    const result = await generateBeatChunkedChapterList({
      document,
      novel: {
        title: "测试小说",
        description: null,
        targetAudience: null,
        bookSellingPoint: null,
        competingFeel: null,
        first30ChapterPromise: null,
        commercialTagsJson: null,
        estimatedChapterCount: 4,
        narrativePov: null,
        pacePreference: null,
        emotionIntensity: null,
        storyModePromptBlock: null,
        genre: null,
        characters: [],
      },
      workspace: {
        ...document,
        workspaceVersion: "v2",
        readiness: {},
      },
      storyMacroPlan: null,
      options: {
        targetVolumeId: "volume-1",
        generationMode: "full_volume",
      },
      notifyPhase: async (label) => {
        notifyCalls.push(label);
      },
    });

    assert.equal(promptCallCount, 0);
    assert.deepEqual(notifyCalls, []);
    assert.deepEqual(result.mergedDocument.volumes[0].chapters, document.volumes[0].chapters);
    assert.deepEqual(result.mergedWorkspace.volumes[0].chapters, document.volumes[0].chapters);
  } finally {
    promptRunner.runStructuredPrompt = originalRunStructuredPrompt;
  }
});
