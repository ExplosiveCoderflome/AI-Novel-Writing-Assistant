const test = require("node:test");
const assert = require("node:assert/strict");
const { prisma } = require("../dist/db/prisma.js");
const { BookAnalysisCommandService } = require("../dist/services/bookAnalysis/application/BookAnalysisCommandService.js");
const { BookAnalysisTaskQueue } = require("../dist/services/bookAnalysis/infrastructure/bookAnalysis.queue.js");

function createQueryService(detail = { id: "analysis-1", sections: [] }) {
  return {
    ensureAnalysisSections: async () => {},
    getAnalysisById: async () => detail,
  };
}

function createAnalysisRow(patch = {}) {
  return {
    id: "analysis-1",
    status: "failed",
    lastError: "budget_exceeded: used 1200 tokens exceeds budget 1000",
    ...patch,
  };
}

test("BookAnalysisCommandService rebuildAnalysis keeps succeeded sections intact", async () => {
  const original = {
    findUnique: prisma.bookAnalysis.findUnique,
    transaction: prisma.$transaction,
    enqueue: BookAnalysisTaskQueue.prototype.enqueue,
  };
  let sectionWhere = null;

  prisma.bookAnalysis.findUnique = async () => createAnalysisRow();
  prisma.$transaction = async (callback) => callback({
    bookAnalysis: {
      update: async () => ({}),
    },
    bookAnalysisSection: {
      updateMany: async ({ where }) => {
        sectionWhere = where;
        return { count: 1 };
      },
    },
  });
  BookAnalysisTaskQueue.prototype.enqueue = () => {};

  try {
    const service = new BookAnalysisCommandService(createQueryService());
    await service.rebuildAnalysis("analysis-1");
    assert.deepEqual(sectionWhere, {
      analysisId: "analysis-1",
      frozen: false,
      status: { not: "succeeded" },
    });
  } finally {
    prisma.bookAnalysis.findUnique = original.findUnique;
    prisma.$transaction = original.transaction;
    BookAnalysisTaskQueue.prototype.enqueue = original.enqueue;
  }
});

test("BookAnalysisCommandService rebuildAnalysis keeps frozen sections intact", async () => {
  const original = {
    findUnique: prisma.bookAnalysis.findUnique,
    transaction: prisma.$transaction,
    enqueue: BookAnalysisTaskQueue.prototype.enqueue,
  };
  let sectionWhere = null;

  prisma.bookAnalysis.findUnique = async () => createAnalysisRow();
  prisma.$transaction = async (callback) => callback({
    bookAnalysis: {
      update: async () => ({}),
    },
    bookAnalysisSection: {
      updateMany: async ({ where }) => {
        sectionWhere = where;
        return { count: 1 };
      },
    },
  });
  BookAnalysisTaskQueue.prototype.enqueue = () => {};

  try {
    const service = new BookAnalysisCommandService(createQueryService());
    await service.rebuildAnalysis("analysis-1");
    assert.equal(sectionWhere.frozen, false);
  } finally {
    prisma.bookAnalysis.findUnique = original.findUnique;
    prisma.$transaction = original.transaction;
    BookAnalysisTaskQueue.prototype.enqueue = original.enqueue;
  }
});
