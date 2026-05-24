const test = require("node:test");
const assert = require("node:assert/strict");

const { prisma } = require("../dist/db/prisma.js");
const { KnowledgeService } = require("../dist/services/knowledge/KnowledgeService.js");
const { RagIndexService } = require("../dist/services/rag/RagIndexService.js");
const { ragServices } = require("../dist/services/rag/index.js");

test("restoring archived knowledge document queues a rebuild and marks indexing queued", async () => {
  const service = new KnowledgeService();
  const originalFindUnique = prisma.knowledgeDocument.findUnique;
  const originalUpdate = prisma.knowledgeDocument.update;
  const originalEnqueueOwnerJob = ragServices.ragIndexService.enqueueOwnerJob;
  const enqueueCalls = [];
  let updateArgs = null;

  prisma.knowledgeDocument.findUnique = async () => ({
    id: "knowledge-doc-1",
    status: "archived",
    activeVersionId: "knowledge-version-1",
  });
  prisma.knowledgeDocument.update = async (args) => {
    updateArgs = args;
    return {
      id: args.where.id,
      status: args.data.status,
      latestIndexStatus: args.data.latestIndexStatus,
    };
  };
  ragServices.ragIndexService.enqueueOwnerJob = async (...args) => {
    enqueueCalls.push(args);
    return { id: "rag-job-rebuild" };
  };

  try {
    const result = await service.updateDocumentStatus("knowledge-doc-1", "enabled");

    assert.equal(result.status, "enabled");
    assert.deepEqual(updateArgs, {
      where: { id: "knowledge-doc-1" },
      data: {
        status: "enabled",
        latestIndexStatus: "queued",
      },
    });
    assert.deepEqual(enqueueCalls, [
      ["rebuild", "knowledge_document", "knowledge-doc-1"],
    ]);
  } finally {
    prisma.knowledgeDocument.findUnique = originalFindUnique;
    prisma.knowledgeDocument.update = originalUpdate;
    ragServices.ragIndexService.enqueueOwnerJob = originalEnqueueOwnerJob;
  }
});

test("archiving knowledge document queues index cleanup and leaves document content untouched", async () => {
  const service = new KnowledgeService();
  const originalFindUnique = prisma.knowledgeDocument.findUnique;
  const originalUpdate = prisma.knowledgeDocument.update;
  const originalEnqueueOwnerJob = ragServices.ragIndexService.enqueueOwnerJob;
  const enqueueCalls = [];
  let updateArgs = null;

  prisma.knowledgeDocument.findUnique = async () => ({
    id: "knowledge-doc-1",
    status: "enabled",
    activeVersionId: "knowledge-version-1",
  });
  prisma.knowledgeDocument.update = async (args) => {
    updateArgs = args;
    return {
      id: args.where.id,
      status: args.data.status,
      latestIndexStatus: args.data.latestIndexStatus,
    };
  };
  ragServices.ragIndexService.enqueueOwnerJob = async (...args) => {
    enqueueCalls.push(args);
    return { id: "rag-job-delete" };
  };

  try {
    const result = await service.updateDocumentStatus("knowledge-doc-1", "archived");

    assert.equal(result.status, "archived");
    assert.deepEqual(updateArgs, {
      where: { id: "knowledge-doc-1" },
      data: {
        status: "archived",
        latestIndexStatus: "idle",
      },
    });
    assert.deepEqual(enqueueCalls, [
      ["delete", "knowledge_document", "knowledge-doc-1"],
    ]);
  } finally {
    prisma.knowledgeDocument.findUnique = originalFindUnique;
    prisma.knowledgeDocument.update = originalUpdate;
    ragServices.ragIndexService.enqueueOwnerJob = originalEnqueueOwnerJob;
  }
});

test("completed knowledge delete job leaves archived document index status idle", async () => {
  const service = new RagIndexService({}, {});
  const originalFindUnique = prisma.ragIndexJob.findUnique;
  const originalUpdate = prisma.ragIndexJob.update;
  const originalUpdateMany = prisma.knowledgeDocument.updateMany;
  let updateManyArgs = null;

  prisma.ragIndexJob.findUnique = async () => ({
    status: "running",
    payloadJson: null,
  });
  prisma.ragIndexJob.update = async (args) => {
    if (args.data.status) {
      return {
        id: args.where.id,
        ownerType: "knowledge_document",
        ownerId: "knowledge-doc-1",
        jobType: "delete",
      };
    }
    return { id: args.where.id };
  };
  prisma.knowledgeDocument.updateMany = async (args) => {
    updateManyArgs = args;
    return { count: 1 };
  };

  try {
    await service.updateJobStatus("rag-job-delete", {
      status: "succeeded",
    });

    assert.deepEqual(updateManyArgs, {
      where: { id: "knowledge-doc-1" },
      data: {
        latestIndexStatus: "idle",
      },
    });
  } finally {
    prisma.ragIndexJob.findUnique = originalFindUnique;
    prisma.ragIndexJob.update = originalUpdate;
    prisma.knowledgeDocument.updateMany = originalUpdateMany;
  }
});
