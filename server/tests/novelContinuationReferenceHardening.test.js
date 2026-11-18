const test = require("node:test");
const assert = require("node:assert/strict");

const { prisma } = require("../dist/db/prisma.js");
const { NovelContinuationService } = require("../dist/services/novel/NovelContinuationService.js");
const { NovelReferenceService } = require("../dist/services/novel/NovelReferenceService.js");
const { CreativeCarryoverContractService } = require("../dist/services/novel/director/reference/CreativeCarryoverContractService.js");
const promptRunner = require("../dist/prompting/core/promptRunner.js");

test("continuation chapter pack prefers bound structured book analysis sections", async () => {
  const original = {
    novelFindUnique: prisma.novel.findUnique,
    bookAnalysisFindFirst: prisma.bookAnalysis.findFirst,
    knowledgeFindUnique: prisma.knowledgeDocument.findUnique,
  };
  try {
    let editedTimeline = null;
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
          editedContent: editedTimeline,
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

    editedTimeline = "钥匙还在反派手里。";
    const editedPack = await new NovelContinuationService().buildChapterContextPack("novel-1");
    assert.match(editedPack.humanBlock, /钥匙还在反派手里/);
    assert.doesNotMatch(editedPack.humanBlock, /主角拿到维修通道钥匙/);
    assert.ok(editedPack.antiCopyCorpus.some((item) => item.includes("钥匙还在反派手里")));
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
    const service = new NovelReferenceService();
    service.resolveAnalysesForNovel = async () => [];
    service.resolveKnowledgeContentsForNovel = async () => [];

    const reference = await service.buildReferenceForStage("novel-1", "outline");

    assert.equal(reference, "");
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0][0], "[novel-reference] reference context skipped.");
  } finally {
    prisma.novel.findUnique = original.novelFindUnique;
    console.warn = original.warn;
  }
});

test("creative carryover sends the saved prose for an edited section and structured material for the others", async (t) => {
  const findUnique = prisma.bookAnalysis.findUnique;
  t.after(() => { prisma.bookAnalysis.findUnique = findUnique; });
  prisma.bookAnalysis.findUnique = async () => ({
    id: "analysis-1",
    title: "测试拆书",
    status: "succeeded",
    document: { title: "前作" },
    documentVersion: { content: "原文", versionNumber: 1 },
    sections: [{
      sectionKey: "character_system",
      title: "人物系统",
      editedContent: "主角已经向盟友公开身份。",
      aiContent: "主角继续隐瞒身份。",
      structuredDataJson: JSON.stringify({ protagonistPositioning: "继续隐瞒身份的破局者" }),
    }, {
      sectionKey: "plot_structure",
      title: "剧情结构",
      structuredDataJson: JSON.stringify({ mainlineSummary: "用庭审推进主线" }),
    }],
  });
  const stopBeforeModel = new Error("captured carryover prompt");
  t.mock.method(promptRunner, "runStructuredPrompt", async ({ promptInput }) => {
    assert.match(promptInput.sectionSummaries, /主角已经向盟友公开身份/);
    assert.match(promptInput.sectionSummaries, /用庭审推进主线/);
    assert.doesNotMatch(promptInput.sectionSummaries, /继续隐瞒身份/);
    throw stopBeforeModel;
  });

  const service = new CreativeCarryoverContractService();
  await assert.rejects(service.generate({ mode: "continuation", bookAnalysisId: "analysis-1" }), stopBeforeModel);
});
