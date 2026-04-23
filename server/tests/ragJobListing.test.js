const test = require("node:test");
const assert = require("node:assert/strict");

const { prisma } = require("../dist/db/prisma.js");
const { RagIndexService } = require("../dist/services/rag/RagIndexService.js");

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
