const test = require("node:test");
const assert = require("node:assert/strict");

const {
  bookAnalysisCharacterSubjectAdapter,
} = require("../dist/services/characterConversation/adapters/BookAnalysisCharacterSubjectAdapter.js");

function createAppearanceOnlyCharacter() {
  return {
    id: "character-1",
    analysisId: "analysis-1",
    name: "田静",
    role: "核心角色",
    evidence: [],
    profileSections: [],
    arcs: [],
    scenes: [],
    appearance: {
      snapshots: [{
        id: "appearance-76",
        chapterIndex: 76,
        chapterTitle: "第七十七章",
        evidence: [{
          label: "外貌与姿态",
          excerpt: "田静抬起头，露出甜美的笑容。",
          sourceLabel: "第77章正文",
          chapterIndex: 76,
        }],
        images: [],
      }],
    },
  };
}

test("appearance snapshot evidence can anchor an evidence interview", () => {
  const input = {
    analysisId: "analysis-1",
    characterId: "character-1",
    chapterAnchor: 77,
    character: createAppearanceOnlyCharacter(),
  };
  const projection = bookAnalysisCharacterSubjectAdapter.project(input);
  const context = bookAnalysisCharacterSubjectAdapter.buildPromptContext(input);

  assert.equal(projection.evidence.length, 1);
  assert.equal(projection.evidence[0].chapterOrder, 77);
  assert.equal(projection.evidence[0].sourceType, "book_analysis_appearance_snapshot");
  assert.match(projection.currentSituation, /第 77 章/);
  assert.match(context, /第 77 章/);
});
