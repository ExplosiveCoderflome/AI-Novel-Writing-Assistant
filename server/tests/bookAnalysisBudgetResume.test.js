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

test("BookAnalysisCommandService updateBudget rejects invalid and archived analyses", async () => {
  const original = {
    findUnique: prisma.bookAnalysis.findUnique,
    update: prisma.bookAnalysis.update,
  };
  const service = new BookAnalysisCommandService(createQueryService({ id: "analysis-1", budgetTokens: 2000 }));

  prisma.bookAnalysis.findUnique = async () => createAnalysisRow({ status: "failed" });
  prisma.bookAnalysis.update = async () => {
    throw new Error("update should not run for invalid budget");
  };

  try {
    await assert.rejects(
      () => service.updateBudget("analysis-1", -1),
      /Budget tokens must be a positive number or null/,
    );

    prisma.bookAnalysis.findUnique = async () => createAnalysisRow({ status: "archived" });
    await assert.rejects(
      () => service.updateBudget("analysis-1", 2000),
      /Archived book analysis budget cannot be updated/,
    );
  } finally {
    prisma.bookAnalysis.findUnique = original.findUnique;
    prisma.bookAnalysis.update = original.update;
  }
});

test("BookAnalysisCommandService updateBudget updates budget without clearing used tokens", async () => {
  const original = {
    findUnique: prisma.bookAnalysis.findUnique,
    update: prisma.bookAnalysis.update,
  };
  let updateData = null;

  prisma.bookAnalysis.findUnique = async () => createAnalysisRow({ status: "failed" });
  prisma.bookAnalysis.update = async ({ data }) => {
    updateData = data;
    return {};
  };

  try {
    const service = new BookAnalysisCommandService(createQueryService({ id: "analysis-1", budgetTokens: 5000, usedTokens: 3000 }));
    const detail = await service.updateBudget("analysis-1", 5000);
    assert.equal(detail.budgetTokens, 5000);
    assert.deepEqual(updateData, { budgetTokens: 5000 });

    await service.updateBudget("analysis-1", null);
    assert.deepEqual(updateData, { budgetTokens: null });
  } finally {
    prisma.bookAnalysis.findUnique = original.findUnique;
    prisma.bookAnalysis.update = original.update;
  }
});

test("BookAnalysisCommandService resumeWithBudget rejects non-recoverable statuses", async () => {
  const original = {
    findUnique: prisma.bookAnalysis.findUnique,
  };

  prisma.bookAnalysis.findUnique = async () => createAnalysisRow({ status: "running" });

  try {
    const service = new BookAnalysisCommandService(createQueryService());
    await assert.rejects(
      () => service.resumeWithBudget("analysis-1", 5000),
      /Only failed or cancelled analyses can be resumed with budget/,
    );
  } finally {
    prisma.bookAnalysis.findUnique = original.findUnique;
  }
});

test("BookAnalysisCommandService resumeWithBudget rejects non-budget failures", async () => {
  const original = {
    findUnique: prisma.bookAnalysis.findUnique,
  };

  prisma.bookAnalysis.findUnique = async () => createAnalysisRow({
    status: "failed",
    lastError: "model timeout",
  });

  try {
    const service = new BookAnalysisCommandService(createQueryService());
    await assert.rejects(
      () => service.resumeWithBudget("analysis-1", 5000),
      /Only budget exceeded analyses can use budget resume/,
    );
  } finally {
    prisma.bookAnalysis.findUnique = original.findUnique;
  }
});

test("BookAnalysisCommandService resumeWithBudget updates budget and preserves used tokens", async () => {
  const original = {
    findUnique: prisma.bookAnalysis.findUnique,
    transaction: prisma.$transaction,
    enqueue: BookAnalysisTaskQueue.prototype.enqueue,
  };
  const findUniqueCalls = [];
  const updateCalls = [];
  let sectionWhere = null;
  let enqueuedTask = null;

  prisma.bookAnalysis.findUnique = async () => {
    findUniqueCalls.push(true);
    return createAnalysisRow({ status: "failed" });
  };
  prisma.$transaction = async (callback) => callback({
    bookAnalysis: {
      update: async ({ data }) => {
        updateCalls.push(data);
        return {};
      },
    },
    bookAnalysisSection: {
      updateMany: async ({ where }) => {
        sectionWhere = where;
        return { count: 2 };
      },
    },
  });
  BookAnalysisTaskQueue.prototype.enqueue = (task) => {
    enqueuedTask = task;
  };

  try {
    const service = new BookAnalysisCommandService(createQueryService({
      id: "analysis-1",
      status: "queued",
      budgetTokens: 8000,
      usedTokens: 3000,
      lastError: null,
    }));
    const detail = await service.resumeWithBudget("analysis-1", 8000);

    assert.equal(findUniqueCalls.length, 2);
    assert.equal(detail.budgetTokens, 8000);
    assert.equal(detail.usedTokens, 3000);
    assert.equal(detail.lastError, null);
    assert.deepEqual(updateCalls[0], {
      status: "queued",
      pendingManualRecovery: false,
      progress: 0,
      budgetTokens: 8000,
      lastError: null,
      heartbeatAt: null,
      currentStage: null,
      currentItemKey: null,
      currentItemLabel: null,
      cancelRequestedAt: null,
      attemptCount: 0,
    });
    assert.deepEqual(sectionWhere, {
      analysisId: "analysis-1",
      frozen: false,
      status: { not: "succeeded" },
    });
    assert.deepEqual(enqueuedTask, { analysisId: "analysis-1", kind: "full" });
  } finally {
    prisma.bookAnalysis.findUnique = original.findUnique;
    prisma.$transaction = original.transaction;
    BookAnalysisTaskQueue.prototype.enqueue = original.enqueue;
  }
});
