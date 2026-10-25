const test = require("node:test");
const assert = require("node:assert/strict");

const { prisma } = require("../dist/db/prisma.js");
const { RagIndexService } = require("../dist/services/rag/RagIndexService.js");
const { RagJobCleanupService } = require("../dist/services/rag/RagJobCleanupService.js");

test("listJobs requests the most recently updated jobs first for UI polling", async () => {
  const service = new RagIndexService({}, {});
  const originalFindMany = prisma.ragIndexJob.findMany;
  const calls = [];

  prisma.ragIndexJob.findMany = async (args) => {
    calls.push(args);
    return [];
  };

  try {
    await service.listJobs(30);

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].orderBy, [
      { updatedAt: "desc" },
      { createdAt: "desc" },
    ]);
    assert.equal(calls[0].take, 30);
  } finally {
    prisma.ragIndexJob.findMany = originalFindMany;
  }
});

test("clearFinishedJobs deletes only terminal job records", async () => {
  const service = new RagJobCleanupService();
  const originalTransaction = prisma.$transaction;
  const originalCount = prisma.ragIndexJob.count;
  const originalDeleteMany = prisma.ragIndexJob.deleteMany;
  const originalFindMany = prisma.ragIndexJob.findMany;
  const calls = [];
  prisma.ragIndexJob.findMany = async () => [];

  prisma.$transaction = async (operations) => Promise.all(operations);
  prisma.ragIndexJob.count = async (args) => {
    calls.push(["count", args]);
    return 2;
  };
  prisma.ragIndexJob.deleteMany = async (args) => {
    calls.push(["deleteMany", args]);
    return { count: 7 };
  };

  try {
    const result = await service.clearFinishedJobs();

    assert.deepEqual(result, {
      deletedCount: 7,
      activeCount: 2,
    });
    assert.deepEqual(calls[0], [
      "count",
      {
        where: {
          status: {
            in: ["queued", "running"],
          },
        },
      },
    ]);
    assert.deepEqual(calls[1], [
      "deleteMany",
      {
        where: {
          status: {
            in: ["succeeded", "failed", "cancelled"],
          },
          OR: [{ ownerType: { not: "knowledge_document" } }],
        },
      },
    ]);
  } finally {
    prisma.$transaction = originalTransaction;
    prisma.ragIndexJob.count = originalCount;
    prisma.ragIndexJob.deleteMany = originalDeleteMany;
    prisma.ragIndexJob.findMany = originalFindMany;
  }
});

test("unfinished index cleanup and rollback records cannot be removed as finished history", async (t) => {
  const { stubDatabaseMethod } = require("./legacyDirector/databasePorts.js");
  const service = new RagJobCleanupService();
  const payloadJson = JSON.stringify({ replacement: { state: "committed", cleanupPending: true } });
  stubDatabaseMethod(t, prisma.ragIndexJob, "findUnique", async () => ({ status: "failed", payloadJson }));
  stubDatabaseMethod(t, prisma.ragIndexJob, "delete", async () => assert.fail("pending cleanup record was deleted"));
  assert.deepEqual(await service.deleteFinishedJob("pending"), { status: "failed", deletedCount: 0 });
  stubDatabaseMethod(t, prisma.ragIndexJob, "findMany", async () => [{ id: "pending", payloadJson }]);
  stubDatabaseMethod(t, prisma.ragIndexJob, "count", async ({ where }) => { assert.deepEqual(where.OR[1], { id: { in: ["pending"] } }); return 1; });
  stubDatabaseMethod(t, prisma.ragIndexJob, "deleteMany", async ({ where }) => {
    assert.deepEqual(where.OR, [{ ownerType: { not: "knowledge_document" } }]); return { count: 0 };
  });
  stubDatabaseMethod(t, prisma, "$transaction", async (operations) => Promise.all(operations));
  assert.deepEqual(await service.clearFinishedJobs(), { deletedCount: 0, activeCount: 1 });
});

test("deleteFinishedJob keeps active job records", async () => {
  const service = new RagJobCleanupService();
  const originalFindUnique = prisma.ragIndexJob.findUnique;
  const originalDelete = prisma.ragIndexJob.delete;
  let deleteCalled = false;

  prisma.ragIndexJob.findUnique = async () => ({ status: "running" });
  prisma.ragIndexJob.delete = async () => {
    deleteCalled = true;
    return {};
  };

  try {
    const result = await service.deleteFinishedJob("rag-job-running");

    assert.deepEqual(result, {
      deletedCount: 0,
      status: "running",
    });
    assert.equal(deleteCalled, false);
  } finally {
    prisma.ragIndexJob.findUnique = originalFindUnique;
    prisma.ragIndexJob.delete = originalDelete;
  }
});
