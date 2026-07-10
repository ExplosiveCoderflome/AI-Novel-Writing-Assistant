const test = require("node:test");
const assert = require("node:assert/strict");

const { prisma } = require("../dist/db/prisma.js");
const { NovelContinuationService } = require("../dist/services/novel/NovelContinuationService.js");
const { NovelReferenceService } = require("../dist/services/novel/NovelReferenceService.js");

test("continuation chapter pack prefers bound structured book analysis sections", async () => {
  const original = {
    novelFindUnique: prisma.novel.findUnique,
    bookAnalysisFindFirst: prisma.bookAnalysis.findFirst,
    knowledgeFindUnique: prisma.knowledgeDocument.findUnique,
  };
  try {
    prisma.novel.findUnique = async () => ({
      id: "novel-1",
      writingMode: "continuation",
      sourceNovelId: null,
      sourceKnowledgeDocumentId: "doc-1",
      continuationBookAnalysisId: "analysis-1",
      continuationBookAnalysisSections: JSON.stringify(["timeline", "character_system", "plot_structure"]),
    });
    prisma.bookAnalysis.findFirst = async () => ({
      id: "analysis-1",
      title: "参考作品完整拆书",
      document: { title: "参考作品" },
      documentVersion: { versionNumber: 3 },
      sections: [
        {
          sectionKey: "character_system",
          title: "人物系统",
          structuredDataJson: JSON.stringify({
            protagonistPositioning: "终局时仍背负旧伤的破局者",
            relationshipNetwork: ["女二掌握证据但仍未完全信任主角"],
          }),
          aiContent: "不应读取这段粗文本",
          editedContent: null,
        },
        {
          sectionKey: "timeline",
          title: "故事时间线",
          structuredDataJson: JSON.stringify({
            timeNodes: [{ label: "主角拿到维修通道钥匙", phase: "终局", timeHint: "最后一夜" }],
            stateChangeNodes: ["敌方进入被迫应对状态"],
          }),
          aiContent: null,
          editedContent: null,
        },
        {
          sectionKey: "plot_structure",
          title: "剧情结构",
          structuredDataJson: JSON.stringify({
            mainlineSummary: "压迫链在终局转成第一次反压入口",
            reusablePatterns: ["先压迫再给局部反手"],
          }),
          aiContent: null,
          editedContent: null,
        },
      ],
    });
    prisma.knowledgeDocument.findUnique = async () => {
      throw new Error("raw knowledge source should not be read when analysis is available");
    };

    const pack = await new NovelContinuationService().buildChapterContextPack("novel-1");

    assert.equal(pack.enabled, true);
    assert.equal(pack.sourceType, "knowledge_document");
    assert.equal(pack.sourceId, "doc-1");
    assert.equal(pack.sourceTitle, "参考作品");
    assert.match(pack.humanBlock, /拆书分析：参考作品完整拆书/);
    assert.match(pack.humanBlock, /人物系统\/主角定位: 终局时仍背负旧伤的破局者/);
    assert.match(pack.humanBlock, /故事时间线\/关键时间节点: 主角拿到维修通道钥匙/);
    assert.match(pack.humanBlock, /剧情结构\/主线梗概: 压迫链在终局转成第一次反压入口/);
    assert.doesNotMatch(pack.humanBlock, /不应读取这段粗文本/);
    assert.ok(pack.antiCopyCorpus.some((item) => item.includes("先压迫再给局部反手")));
  } finally {
    prisma.novel.findUnique = original.novelFindUnique;
    prisma.bookAnalysis.findFirst = original.bookAnalysisFindFirst;
    prisma.knowledgeDocument.findUnique = original.knowledgeFindUnique;
  }
});

test("reference stage builder degrades to empty text on internal lookup errors", async () => {
  const original = {
    novelFindUnique: prisma.novel.findUnique,
    warn: console.warn,
  };
  const warnings = [];
  try {
    prisma.novel.findUnique = async () => {
      throw new Error("simulated lookup failure");
    };
    console.warn = (...args) => warnings.push(args);

    const reference = await new NovelReferenceService().buildReferenceForStage("novel-1", "outline");

    assert.equal(reference, "");
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0][0], "[novel-reference] reference context skipped.");
  } finally {
    prisma.novel.findUnique = original.novelFindUnique;
    console.warn = original.warn;
  }
});
