const test = require("node:test");
const assert = require("node:assert/strict");

const { prisma } = require("../dist/db/prisma.js");
const { BookAnalysisCommandService } = require("../dist/services/bookAnalysis/application/BookAnalysisCommandService.js");
const { BookTaskAdapter } = require("../dist/services/task/adapters/BookTaskAdapter.js");
const { TaskCenterService } = require("../dist/services/task/TaskCenterService.js");

function createBookRow(id, aiContent) {
  const now = new Date("2026-07-14T00:00:00.000Z");
  return {
    id,
    documentId: "document-1",
    documentVersionId: "version-1",
    title: `拆书 ${id}`,
    status: "succeeded",
    summary: null,
    progress: 1,
    currentStage: null,
    currentItemLabel: null,
    attemptCount: 0,
    maxAttempts: 1,
    lastError: null,
    heartbeatAt: null,
    createdAt: now,
    updatedAt: now,
    document: { id: "document-1", title: "测试文档" },
    sections: [{
      status: "succeeded",
      frozen: false,
      aiContent,
      editedContent: null,
      structuredDataJson: JSON.stringify({ oneLinePositioning: "", genreTags: [] }),
    }],
  };
}

test("BookTaskAdapter continues bounded batches until projected status matches the filter", async () => {
  const original = {
    bookFindMany: prisma.bookAnalysis.findMany,
    archiveFindMany: prisma.taskCenterArchive.findMany,
  };
  const queries = [];

  prisma.taskCenterArchive.findMany = async () => [];
  prisma.bookAnalysis.findMany = async (query) => {
    queries.push(query);
    return query.cursor
      ? [createBookRow("empty-result", "")]
      : [createBookRow("valid-result", "# 有效结果")];
  };

  try {
    const rows = await new BookTaskAdapter().list({ status: "failed", take: 1 });
    assert.equal(queries.length, 2);
    assert.equal(queries[0].take, 1);
    assert.deepEqual(queries[1].cursor, { id: "valid-result" });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, "empty-result");
    assert.equal(rows[0].status, "failed");
  } finally {
    prisma.bookAnalysis.findMany = original.bookFindMany;
    prisma.taskCenterArchive.findMany = original.archiveFindMany;
  }
});

test("BookAnalysisCommandService retries a historical empty success and resets its empty section", async () => {
  const original = {
    bookFindUnique: prisma.bookAnalysis.findUnique,
    transaction: prisma.$transaction,
  };
  const sectionUpdates = [];
  const emptySection = {
    id: "section-empty",
    status: "succeeded",
    frozen: false,
    aiContent: "",
    editedContent: null,
    structuredDataJson: JSON.stringify({ oneLinePositioning: "", genreTags: [] }),
  };

  prisma.bookAnalysis.findUnique = async (query) => {
    if (query.include?.sections) {
      return { id: "analysis-empty", status: "succeeded", summary: null, sections: [emptySection] };
    }
    return { status: "succeeded", sections: [emptySection] };
  };
  prisma.$transaction = async (callback) => callback({
    bookAnalysis: { update: async (input) => input },
    bookAnalysisSection: {
      updateMany: async (input) => {
        sectionUpdates.push(input);
        return { count: 1 };
      },
    },
  });

  const service = new BookAnalysisCommandService({
    getAnalysisById: async () => ({ id: "analysis-empty" }),
  });
  service.enqueueTask = () => {};

  try {
    const result = await service.retryAnalysis("analysis-empty");
    assert.equal(result.id, "analysis-empty");
    assert.equal(sectionUpdates.length, 1);
    assert.deepEqual(sectionUpdates[0].where.OR[1], { id: { in: ["section-empty"] } });
  } finally {
    prisma.bookAnalysis.findUnique = original.bookFindUnique;
    prisma.$transaction = original.transaction;
  }
});

test("TaskCenterService counts historical empty successes as failures", async () => {
  const original = {
    archiveFindMany: prisma.taskCenterArchive.findMany,
    bookGroupBy: prisma.bookAnalysis.groupBy,
    bookFindMany: prisma.bookAnalysis.findMany,
    bookCount: prisma.bookAnalysis.count,
    pipelineGroupBy: prisma.generationJob.groupBy,
    pipelineCount: prisma.generationJob.count,
    knowledgeGroupBy: prisma.ragIndexJob.groupBy,
    imageGroupBy: prisma.imageGenerationTask.groupBy,
    imageCount: prisma.imageGenerationTask.count,
    agentGroupBy: prisma.agentRun.groupBy,
    workflowGroupBy: prisma.novelWorkflowTask.groupBy,
    workflowCount: prisma.novelWorkflowTask.count,
    styleGroupBy: prisma.styleExtractionTask.groupBy,
    styleCount: prisma.styleExtractionTask.count,
  };

  prisma.taskCenterArchive.findMany = async () => [];
  prisma.bookAnalysis.groupBy = async () => [];
  prisma.bookAnalysis.findMany = async () => [{ sections: createBookRow("empty", "").sections }];
  prisma.bookAnalysis.count = async () => 0;
  prisma.generationJob.groupBy = async () => [];
  prisma.generationJob.count = async () => 0;
  prisma.ragIndexJob.groupBy = async () => [];
  prisma.imageGenerationTask.groupBy = async () => [];
  prisma.imageGenerationTask.count = async () => 0;
  prisma.agentRun.groupBy = async () => [];
  prisma.novelWorkflowTask.groupBy = async () => [];
  prisma.novelWorkflowTask.count = async () => 0;
  prisma.styleExtractionTask.groupBy = async () => [];
  prisma.styleExtractionTask.count = async () => 0;

  try {
    const overview = await new TaskCenterService().getOverview();
    assert.equal(overview.failedCount, 1);
  } finally {
    prisma.taskCenterArchive.findMany = original.archiveFindMany;
    prisma.bookAnalysis.groupBy = original.bookGroupBy;
    prisma.bookAnalysis.findMany = original.bookFindMany;
    prisma.bookAnalysis.count = original.bookCount;
    prisma.generationJob.groupBy = original.pipelineGroupBy;
    prisma.generationJob.count = original.pipelineCount;
    prisma.ragIndexJob.groupBy = original.knowledgeGroupBy;
    prisma.imageGenerationTask.groupBy = original.imageGroupBy;
    prisma.imageGenerationTask.count = original.imageCount;
    prisma.agentRun.groupBy = original.agentGroupBy;
    prisma.novelWorkflowTask.groupBy = original.workflowGroupBy;
    prisma.novelWorkflowTask.count = original.workflowCount;
    prisma.styleExtractionTask.groupBy = original.styleGroupBy;
    prisma.styleExtractionTask.count = original.styleCount;
  }
});
