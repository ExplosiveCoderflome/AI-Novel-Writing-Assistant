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
const {
  resolveStructuredOutlineRecoveryCursor,
} = require("../dist/services/novel/director/novelDirectorStructuredOutlineRecovery.js");

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

test("generateBeatChunkedChapterList rejects beat sheets that cover far fewer chapters than the budget target", async () => {
  const document = buildVolumeWorkspaceDocument({
    ...createDocument(),
    volumes: [
      {
        ...createDocument().volumes[0],
        chapters: Array.from({ length: 53 }, (_, index) => createChapter({
          id: `volume-1-chapter-${index + 1}`,
          chapterOrder: index + 1,
          beatKey: "open_hook",
          title: `第一卷第${index + 1}章`,
          summary: `第一卷第${index + 1}章摘要`,
        })),
      },
      {
        ...createDocument().volumes[0],
        id: "volume-2",
        sortOrder: 2,
        title: "第二卷",
        chapters: [],
      },
      ...Array.from({ length: 6 }, (_, index) => ({
        ...createDocument().volumes[0],
        id: `volume-${index + 3}`,
        sortOrder: index + 3,
        title: `第${index + 3}卷`,
        chapters: [],
      })),
    ],
    beatSheets: [
      {
        volumeId: "volume-2",
        volumeSortOrder: 2,
        status: "generated",
        beats: [
          { key: "b1", label: "开局", summary: "开局", chapterSpanHint: "1章", mustDeliver: ["开局"] },
          { key: "b2", label: "推进", summary: "推进", chapterSpanHint: "2章", mustDeliver: ["推进"] },
          { key: "b3", label: "转向", summary: "转向", chapterSpanHint: "3-4章", mustDeliver: ["转向"] },
          { key: "b4", label: "挤压", summary: "挤压", chapterSpanHint: "5章", mustDeliver: ["挤压"] },
          { key: "b5", label: "高潮", summary: "高潮", chapterSpanHint: "6章", mustDeliver: ["高潮"] },
          { key: "b6", label: "尾钩", summary: "尾钩", chapterSpanHint: "7章", mustDeliver: ["尾钩"] },
        ],
      },
    ],
  });
  const originalRunStructuredPrompt = promptRunner.runStructuredPrompt;
  let promptCallCount = 0;

  promptRunner.runStructuredPrompt = async () => {
    promptCallCount += 1;
    throw new Error("chapter-list prompt should not run for an under-covered beat sheet");
  };

  try {
    await assert.rejects(
      () => generateBeatChunkedChapterList({
        document,
        novel: {
          title: "测试小说",
          description: null,
          targetAudience: null,
          bookSellingPoint: null,
          competingFeel: null,
          first30ChapterPromise: null,
          commercialTagsJson: null,
          estimatedChapterCount: 430,
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
          targetVolumeId: "volume-2",
          generationMode: "full_volume",
        },
        notifyPhase: async () => {},
      }),
      /节奏板/,
    );
    assert.equal(promptCallCount, 0);
  } finally {
    promptRunner.runStructuredPrompt = originalRunStructuredPrompt;
  }
});

test("generateBeatChunkedChapterList rejects disconnected beat sheet spans before prompting", async () => {
  const document = buildVolumeWorkspaceDocument({
    ...createDocument(),
    volumes: [
      {
        ...createDocument().volumes[0],
        id: "volume-1",
        sortOrder: 1,
        title: "第一卷",
        chapters: [],
      },
      ...Array.from({ length: 7 }, (_, index) => ({
        ...createDocument().volumes[0],
        id: `volume-${index + 2}`,
        sortOrder: index + 2,
        title: `第${index + 2}卷`,
        chapters: [],
      })),
    ],
    beatSheets: [
      {
        volumeId: "volume-1",
        volumeSortOrder: 1,
        status: "generated",
        beats: [
          { key: "b1", label: "开局", summary: "开局", chapterSpanHint: "1-7章", mustDeliver: ["开局"] },
          { key: "b2", label: "尾钩", summary: "尾钩", chapterSpanHint: "54章", mustDeliver: ["尾钩"] },
        ],
      },
    ],
  });
  const originalRunStructuredPrompt = promptRunner.runStructuredPrompt;
  let promptCallCount = 0;

  promptRunner.runStructuredPrompt = async () => {
    promptCallCount += 1;
    throw new Error("chapter-list prompt should not run for disconnected beat sheet spans");
  };

  try {
    await assert.rejects(
      () => generateBeatChunkedChapterList({
        document,
        novel: {
          title: "测试小说",
          description: null,
          targetAudience: null,
          bookSellingPoint: null,
          competingFeel: null,
          first30ChapterPromise: null,
          commercialTagsJson: null,
          estimatedChapterCount: 430,
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
        notifyPhase: async () => {},
      }),
      /连续覆盖|节奏板/,
    );
    assert.equal(promptCallCount, 0);
  } finally {
    promptRunner.runStructuredPrompt = originalRunStructuredPrompt;
  }
});

test("generateBeatChunkedChapterList resumes after the last persisted complete beat", async () => {
  const document = createDocument();
  const partialDocument = {
    ...document,
    volumes: [{
      ...document.volumes[0],
      chapters: document.volumes[0].chapters.slice(0, 2),
    }],
  };
  const originalRunStructuredPrompt = promptRunner.runStructuredPrompt;
  const generatedBeatKeys = [];
  const intermediateEvents = [];

  promptRunner.runStructuredPrompt = async ({ promptInput }) => {
    generatedBeatKeys.push(promptInput.targetBeat.key);
    return {
      output: {
        beatKey: promptInput.targetBeat.key,
        beatLabel: promptInput.targetBeat.label,
        chapterCount: promptInput.targetBeatChapterCount,
        chapters: Array.from({ length: promptInput.targetBeatChapterCount }, (_, index) => ({
          beatKey: promptInput.targetBeat.key,
          title: `${promptInput.targetBeat.label}-续跑${index + 1}`,
          summary: `${promptInput.targetBeat.label}续跑摘要${index + 1}`,
        })),
      },
    };
  };

  try {
    const result = await generateBeatChunkedChapterList({
      document: partialDocument,
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
        ...partialDocument,
        workspaceVersion: "v2",
        readiness: {},
      },
      storyMacroPlan: null,
      options: {
        targetVolumeId: "volume-1",
        generationMode: "full_volume",
      },
      notifyPhase: async () => {},
      notifyIntermediateDocument: async (event) => {
        intermediateEvents.push(event);
      },
    });

    assert.deepEqual(generatedBeatKeys, ["mid_turn"]);
    assert.equal(intermediateEvents[0].isFinal, false);
    assert.equal(intermediateEvents[0].targetBeatKey, "mid_turn");
    assert.deepEqual(
      intermediateEvents[0].document.volumes[0].chapters.map((chapter) => chapter.title),
      ["旧开卷一", "旧开卷二", "中段转向-续跑1", "中段转向-续跑2"],
    );
    assert.deepEqual(
      result.mergedDocument.volumes[0].chapters.map((chapter) => chapter.title),
      ["旧开卷一", "旧开卷二", "中段转向-续跑1", "中段转向-续跑2"],
    );
  } finally {
    promptRunner.runStructuredPrompt = originalRunStructuredPrompt;
  }
});

test("generateBeatChunkedChapterList marks non-final complete chunks as resumable chapter list work", async () => {
  const document = {
    ...createDocument(),
    volumes: [{
      ...createDocument().volumes[0],
      chapters: [],
    }],
  };
  const originalRunStructuredPrompt = promptRunner.runStructuredPrompt;
  const intermediateEvents = [];

  promptRunner.runStructuredPrompt = async ({ promptInput }) => ({
    output: {
      beatKey: promptInput.targetBeat.key,
      beatLabel: promptInput.targetBeat.label,
      chapterCount: promptInput.targetBeatChapterCount,
      chapters: Array.from({ length: promptInput.targetBeatChapterCount }, (_, index) => ({
        beatKey: promptInput.targetBeat.key,
        title: `${promptInput.targetBeat.label}-中间${index + 1}`,
        summary: `${promptInput.targetBeat.label}中间摘要${index + 1}`,
      })),
    },
  });

  try {
    await generateBeatChunkedChapterList({
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
      notifyPhase: async () => {},
      notifyIntermediateDocument: async (event) => {
        intermediateEvents.push(event);
      },
    });

    const lastNonFinal = intermediateEvents.filter((event) => event.isFinal === false).at(-1);
    assert.ok(lastNonFinal);
    assert.equal(lastNonFinal.document.volumes[0].chapters.length, 4);
    assert.equal(lastNonFinal.document.volumes[0].status, "chapter_list_partial:active");
    assert.equal(resolveStructuredOutlineRecoveryCursor({
      workspace: lastNonFinal.document,
      plan: { mode: "volume", volumeOrder: 1 },
    }).step, "chapter_list");

    const finalEvent = intermediateEvents.find((event) => event.isFinal === true);
    assert.ok(finalEvent);
    assert.equal(finalEvent.document.volumes[0].status, "active");
    assert.equal(resolveStructuredOutlineRecoveryCursor({
      workspace: finalEvent.document,
      plan: { mode: "volume", volumeOrder: 1 },
    }).step, "chapter_detail_bundle");
  } finally {
    promptRunner.runStructuredPrompt = originalRunStructuredPrompt;
  }
});

test("generateBeatChunkedChapterList emits a single-beat intermediate document without replacing other beats", async () => {
  const document = createDocument();
  const originalRunStructuredPrompt = promptRunner.runStructuredPrompt;
  const intermediateEvents = [];

  promptRunner.runStructuredPrompt = async ({ promptInput }) => ({
    output: {
      beatKey: promptInput.targetBeat.key,
      beatLabel: promptInput.targetBeat.label,
      chapterCount: promptInput.targetBeatChapterCount,
      chapters: Array.from({ length: promptInput.targetBeatChapterCount }, (_, index) => ({
        beatKey: promptInput.targetBeat.key,
        title: `${promptInput.targetBeat.label}-单段${index + 1}`,
        summary: `${promptInput.targetBeat.label}单段摘要${index + 1}`,
      })),
    },
  });

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
        generationMode: "single_beat",
        targetBeatKey: "mid_turn",
      },
      notifyPhase: async () => {},
      notifyIntermediateDocument: async (event) => {
        intermediateEvents.push(event);
      },
    });

    assert.equal(intermediateEvents.length, 2);
    assert.equal(intermediateEvents[0].isFinal, false);
    assert.equal(intermediateEvents[0].targetBeatKey, "mid_turn");
    assert.deepEqual(
      intermediateEvents[0].document.volumes[0].chapters.map((chapter) => chapter.title),
      ["旧开卷一", "旧开卷二", "中段转向-单段1", "中段转向-单段2"],
    );
    assert.deepEqual(intermediateEvents[0].document.volumes[0].chapters, result.mergedDocument.volumes[0].chapters);
  } finally {
    promptRunner.runStructuredPrompt = originalRunStructuredPrompt;
  }
});

test("generateBeatChunkedChapterList emits a resumable intermediate document after each generated beat", async () => {
  const document = createDocument();
  const originalRunStructuredPrompt = promptRunner.runStructuredPrompt;
  const intermediateEvents = [];

  promptRunner.runStructuredPrompt = async ({ promptInput }) => ({
    output: {
      beatKey: promptInput.targetBeat.key,
      beatLabel: promptInput.targetBeat.label,
      chapterCount: promptInput.targetBeatChapterCount,
      chapters: Array.from({ length: promptInput.targetBeatChapterCount }, (_, index) => ({
        beatKey: promptInput.targetBeat.key,
        title: `${promptInput.targetBeat.label}-${index + 1}`,
        summary: `${promptInput.targetBeat.label}摘要${index + 1}`,
      })),
    },
  });

  try {
    const result = await generateBeatChunkedChapterList({
      document: {
        ...document,
        volumes: [{
          ...document.volumes[0],
          chapters: [],
        }],
      },
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
        volumes: [{
          ...document.volumes[0],
          chapters: [],
        }],
        workspaceVersion: "v2",
        readiness: {},
      },
      storyMacroPlan: null,
      options: {
        targetVolumeId: "volume-1",
        generationMode: "full_volume",
      },
      notifyPhase: async () => {},
      notifyIntermediateDocument: async (event) => {
        intermediateEvents.push(event);
      },
    });

    assert.equal(intermediateEvents.length, 3);
    assert.equal(intermediateEvents[0].isFinal, false);
    assert.equal(intermediateEvents[0].targetBeatKey, "open_hook");
    assert.deepEqual(
      intermediateEvents[0].document.volumes[0].chapters.map((chapter) => chapter.title),
      ["开卷抓手-1", "开卷抓手-2"],
    );
    assert.equal(intermediateEvents[1].isFinal, false);
    assert.equal(intermediateEvents[1].targetBeatKey, "mid_turn");
    assert.deepEqual(
      intermediateEvents[1].document.volumes[0].chapters.map((chapter) => chapter.title),
      ["开卷抓手-1", "开卷抓手-2", "中段转向-1", "中段转向-2"],
    );
    assert.equal(intermediateEvents[2].isFinal, true);
    assert.equal(intermediateEvents[2].targetBeatKey, "mid_turn");
    assert.deepEqual(intermediateEvents[2].document.volumes[0].chapters, result.mergedDocument.volumes[0].chapters);
  } finally {
    promptRunner.runStructuredPrompt = originalRunStructuredPrompt;
  }
});
