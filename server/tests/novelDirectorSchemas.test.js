const test = require("node:test");
const assert = require("node:assert/strict");
const {
  directorCandidateResponseSchema,
  directorBookContractSchema,
  normalizeDirectorTitleSuggestionStyle,
} = require("../dist/services/novel/director/novelDirectorSchemas.js");
const {
  normalizeBookContract,
} = require("../dist/services/novel/director/novelDirectorHelpers.js");

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
        toneKeywords: ["c", "d"],
        targetChapterCount: 40,
      },
    ],
  });
  assert.equal(parsed.candidates[0].titleOptions[0].style, "high_concept");
  assert.equal(parsed.candidates[1].titleOptions[0].style, "suspense");
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
