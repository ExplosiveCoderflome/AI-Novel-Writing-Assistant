const test = require("node:test");
const assert = require("node:assert/strict");
const {
  directorCandidateResponseSchema,
  normalizeDirectorTitleSuggestionStyle,
} = require("../dist/services/novel/director/novelDirectorSchemas.js");

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
