const test = require("node:test");
const assert = require("node:assert/strict");

const { prisma } = require("../dist/db/prisma.js");
const { NovelReferenceService } = require("../dist/services/novel/NovelReferenceService.js");

test("reference-based original creation prioritizes its structure analysis without treating it as continuation", async () => {
  const original = {
    novelFindUnique: prisma.novel.findUnique,
    bookAnalysisFindFirst: prisma.bookAnalysis.findFirst,
    bookAnalysisFindMany: prisma.bookAnalysis.findMany,
    knowledgeBindingFindMany: prisma.knowledgeBinding.findMany,
  };
  try {
    prisma.novel.findUnique = async () => ({
      writingMode: "original",
      continuationBookAnalysisId: null,
      continuationBookAnalysisSections: null,
      referenceBookAnalysisId: "analysis-reference",
      referenceBookAnalysisSections: JSON.stringify(["plot_structure", "style_technique"]),
    });
    prisma.bookAnalysis.findFirst = async () => ({
      id: "analysis-reference",
      title: "参考作品拆书",
      document: { title: "参考作品" },
      documentVersion: { versionNumber: 1 },
      sections: [{
        sectionKey: "plot_structure",
        title: "剧情结构",
        structuredDataJson: JSON.stringify({ reusablePatterns: ["局部胜利推动更大目标"] }),
        aiContent: null,
        editedContent: null,
      }],
    });
    prisma.bookAnalysis.findMany = async () => [];
    prisma.knowledgeBinding.findMany = async () => [];

    const reference = await new NovelReferenceService().buildReferenceForStage("novel-1", "outline");

    assert.match(reference, /\[structure\.reference\.primary\]/);
    assert.match(reference, /局部胜利推动更大目标/);
    assert.doesNotMatch(reference, /continuation\.analysis\.primary/);
  } finally {
    prisma.novel.findUnique = original.novelFindUnique;
    prisma.bookAnalysis.findFirst = original.bookAnalysisFindFirst;
    prisma.bookAnalysis.findMany = original.bookAnalysisFindMany;
    prisma.knowledgeBinding.findMany = original.knowledgeBindingFindMany;
  }
});
