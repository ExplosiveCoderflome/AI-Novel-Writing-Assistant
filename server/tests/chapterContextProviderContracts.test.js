const test = require("node:test");
const assert = require("node:assert/strict");

const {
  evaluateChapterContextProviderContracts,
  getBlockingChapterContextGaps,
} = require("../dist/services/novel/runtime/context/chapterContextProviderContracts.js");

test("first chapter does not require a previous chapter result", () => {
  const decisions = evaluateChapterContextProviderContracts({
    stage: "write",
    chapterOrder: 1,
    contextPackage: {
      characterRoster: [{ id: "c1" }],
      characterHardFacts: [{ characterId: "c1" }],
      plan: { id: "p1" },
      chapterMission: { chapterId: "c1" },
      previousChapterTail: null,
      previousChaptersSummary: [],
      storyWorldSlice: null,
      ragContext: "",
    },
  });

  assert.equal(decisions.some((item) => item.blockId === "previous_chapter_result"), false);
  assert.equal(getBlockingChapterContextGaps(decisions).length, 0);
  assert.equal(decisions.find((item) => item.blockId === "world_context").included, false);
});

test("missing applicable required providers are explicit gaps", () => {
  const decisions = evaluateChapterContextProviderContracts({
    stage: "write",
    chapterOrder: 3,
    contextPackage: {
      characterRoster: [{ id: "c1" }],
      characterHardFacts: [],
      plan: null,
      chapterMission: null,
      previousChapterTail: null,
      previousChaptersSummary: [],
      storyWorldSlice: null,
      ragContext: "",
    },
  });

  assert.deepEqual(getBlockingChapterContextGaps(decisions), [
    "character_hard_facts: 适用章节缺少角色硬事实",
    "previous_chapter_result: 当前章节缺少上一章实际结果",
    "chapter_obligations: 章节规划或任务义务缺失",
  ]);
});
