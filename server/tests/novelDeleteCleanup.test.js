const test = require("node:test");
const assert = require("node:assert/strict");

const { NovelCoreCrudService } = require("../dist/services/novel/novelCoreCrudService.js");
const { prisma } = require("../dist/db/prisma.js");
const { ragServices } = require("../dist/services/rag/index.js");

test("deleteNovel removes failed novel tasks and their archive markers before deleting the novel", async () => {
  const originalTransaction = prisma.$transaction;
  const originalEnqueueDelete = ragServices.ragIndexService.enqueueDelete;
  const calls = [];

  const transaction = {
    novelWorkflowTask: {
      findMany: async (query) => {
        calls.push(["findFailedTasks", query]);
        return [{ id: "failed_task_1" }, { id: "failed_task_2" }];
      },
      deleteMany: async (query) => {
        calls.push(["deleteFailedTasks", query]);
        return { count: 2 };
      },
    },
    agentRun: {
      findMany: async (query) => {
        calls.push(["findFailedAgentRuns", query]);
        return [{ id: "failed_agent_1" }];
      },
      deleteMany: async (query) => {
        calls.push(["deleteFailedAgentRuns", query]);
        return { count: 1 };
      },
    },
    generationJob: {
      findMany: async (query) => {
        calls.push(["findFailedPipelineJobs", query]);
        return [{ id: "failed_pipeline_1" }];
      },
    },
    imageGenerationTask: {
      findMany: async (query) => {
        calls.push(["findFailedImageTasks", query]);
        return [{ id: "failed_image_1" }];
      },
    },
    taskCenterArchive: {
      deleteMany: async (query) => {
        calls.push(["deleteArchiveMarkers", query]);
        return { count: 1 };
      },
    },
    novel: {
      delete: async (query) => {
        calls.push(["deleteNovel", query]);
        return { id: "novel_1" };
      },
    },
  };

  prisma.$transaction = async (callback) => callback(transaction);
  ragServices.ragIndexService.enqueueDelete = async (ownerType, ownerId) => {
    calls.push(["queueRagDelete", { ownerType, ownerId }]);
  };

  try {
    await new NovelCoreCrudService().deleteNovel("novel_1");

    assert.deepEqual(calls, [
      ["findFailedTasks", {
        where: { novelId: "novel_1", status: "failed" },
        select: { id: true },
      }],
      ["findFailedAgentRuns", {
        where: { novelId: "novel_1", status: "failed" },
        select: { id: true },
      }],
      ["findFailedPipelineJobs", {
        where: { novelId: "novel_1", status: "failed" },
        select: { id: true },
      }],
      ["findFailedImageTasks", {
        where: { novelId: "novel_1", status: "failed" },
        select: { id: true },
      }],
      ["deleteArchiveMarkers", {
        where: {
          OR: [
            { taskKind: "novel_workflow", taskId: { in: ["failed_task_1", "failed_task_2"] } },
            { taskKind: "agent_run", taskId: { in: ["failed_agent_1"] } },
            { taskKind: "novel_pipeline", taskId: { in: ["failed_pipeline_1"] } },
            { taskKind: "image_generation", taskId: { in: ["failed_image_1"] } },
          ],
        },
      }],
      ["deleteFailedTasks", {
        where: { id: { in: ["failed_task_1", "failed_task_2"] } },
      }],
      ["deleteFailedAgentRuns", {
        where: { id: { in: ["failed_agent_1"] } },
      }],
      ["deleteNovel", { where: { id: "novel_1" } }],
      ["queueRagDelete", { ownerType: "novel", ownerId: "novel_1" }],
      ["queueRagDelete", { ownerType: "bible", ownerId: "novel_1" }],
    ]);
  } finally {
    prisma.$transaction = originalTransaction;
    ragServices.ragIndexService.enqueueDelete = originalEnqueueDelete;
  }
});
