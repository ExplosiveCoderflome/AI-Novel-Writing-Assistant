const test = require("node:test");
const assert = require("node:assert/strict");
const {
  assertCreativeCarryoverFocusForMode,
  buildOpeningIdeaFromCarryoverContract,
  creativeCarryoverContractDraftSchema,
  creativeCarryoverContractSchema,
  parseCreativeCarryoverContract,
  REQUIRED_SECTIONS_BY_CARRYOVER_MODE,
} = require("../../shared/dist/types/creativeCarryoverContract.js");

function validOpeningChapters() {
  return [
    { chapterNumber: 1, direction: "第一章接住终局压力" },
    { chapterNumber: 2, direction: "第二章推进未完线索" },
    { chapterNumber: 3, direction: "第三章兑现首个阶段回报" },
  ];
}

test("continuation draft requires continuationFocus only", () => {
  const draft = creativeCarryoverContractDraftSchema.parse({
    sourceTraits: ["终局人物仍有未解压力"],
    bookRealization: ["从原作终局人物状态继续推进"],
    openingChapters: validOpeningChapters(),
    basis: [{ sectionKey: "character_system", fieldKeys: ["growthArcs"], summary: "人物弧线未完" }],
    continuationFocus: {
      finalCharacterStates: ["主角刚完成阶段性胜利但仍孤立"],
      unfinishedThreads: ["反派余党仍在暗处"],
    },
    adaptationFocus: null,
  });
  assert.doesNotThrow(() => assertCreativeCarryoverFocusForMode("continuation", draft));
  assert.throws(
    () => assertCreativeCarryoverFocusForMode("continuation", { ...draft, continuationFocus: null }),
    /终局人物状态/,
  );
});

test("adaptation draft requires adaptationFocus only", () => {
  const draft = creativeCarryoverContractDraftSchema.parse({
    sourceTraits: ["开篇钩子快", "冲突循环清晰"],
    bookRealization: ["用新角色承接同类阅读体验"],
    openingChapters: validOpeningChapters(),
    basis: [{ sectionKey: "market_highlights", fieldKeys: ["hookPoints"], summary: "爽点节奏" }],
    continuationFocus: null,
    adaptationFocus: {
      hooks: ["开篇立刻给出追读问题"],
      conflictLoops: ["压迫-反击-收益"],
      payoffRhythm: ["三章内兑现第一次回报"],
      conversionPlan: "保留节奏，改写世界观与人物",
    },
  });
  assert.doesNotThrow(() => assertCreativeCarryoverFocusForMode("adaptation", draft));
  assert.throws(
    () => assertCreativeCarryoverFocusForMode("adaptation", {
      ...draft,
      continuationFocus: {
        finalCharacterStates: ["不应出现"],
        unfinishedThreads: ["不应出现"],
      },
    }),
    /不应包含续写/,
  );
});

test("opening chapters must cover 1-2-3 exactly", () => {
  assert.throws(
    () => assertCreativeCarryoverFocusForMode("continuation", {
      openingChapters: [
        { chapterNumber: 1, direction: "一" },
        { chapterNumber: 1, direction: "重复" },
        { chapterNumber: 3, direction: "三" },
      ],
      continuationFocus: {
        finalCharacterStates: ["状态"],
        unfinishedThreads: ["线索"],
      },
      adaptationFocus: null,
    }),
    /第 1、2、3 章/,
  );
});

test("persisted contract keeps frozen source version metadata", () => {
  const contract = creativeCarryoverContractSchema.parse({
    schemaVersion: 1,
    mode: "adaptation",
    bookAnalysisId: "analysis-1",
    documentId: "doc-1",
    documentVersionId: "version-1",
    documentVersionNumber: 3,
    documentTitle: "参考小说",
    usedSectionKeys: ["plot_structure", "style_technique", "market_highlights"],
    generatedAt: "2026-09-23T00:00:00.000Z",
    adopted: true,
    sourceTraits: ["钩子强"],
    bookRealization: ["新书独立角色承接钩子"],
    openingChapters: validOpeningChapters(),
    basis: [{ sectionKey: "plot_structure", fieldKeys: ["reusablePatterns"], summary: "可复用结构" }],
    continuationFocus: null,
    adaptationFocus: {
      hooks: ["悬念开篇"],
      conflictLoops: ["压力抬升"],
      payoffRhythm: ["短周期兑现"],
      conversionPlan: "换世界观，保留节奏",
    },
  });
  const parsed = parseCreativeCarryoverContract(JSON.parse(JSON.stringify(contract)));
  assert.equal(parsed?.documentVersionId, "version-1");
  assert.equal(parsed?.documentVersionNumber, 3);
  assert.equal(parsed?.adopted, true);
  assert.match(buildOpeningIdeaFromCarryoverContract(contract), /参考创作开篇/);
});

test("required sections differ by mode", () => {
  assert.deepEqual(REQUIRED_SECTIONS_BY_CARRYOVER_MODE.continuation, ["character_system", "plot_structure"]);
  assert.deepEqual(REQUIRED_SECTIONS_BY_CARRYOVER_MODE.adaptation, [
    "plot_structure",
    "style_technique",
    "market_highlights",
  ]);
});
