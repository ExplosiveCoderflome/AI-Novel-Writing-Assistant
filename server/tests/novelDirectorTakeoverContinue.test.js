const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildContinueExistingDownstreamReset,
  cancelContinueExistingReplacedRuns,
} = require("../dist/services/novel/director/novelDirectorTakeoverContinue.js");
const { prisma } = require("../dist/db/prisma.js");

test("buildContinueExistingDownstreamReset resets steps after user selected entry and preserves assets", () => {
  const result = buildContinueExistingDownstreamReset({
    entryStep: "structured",
  });

  assert.deepEqual(result, {
    preserveAssets: true,
    resetStatus: "not_started",
    fromStep: "structured",
    resetSteps: ["chapter", "pipeline"],
  });
});

test("cancelContinueExistingReplacedRuns marks only overlapping active runs as replaced", async () => {
  const originals = {
    workflowFindMany: prisma.novelWorkflowTask.findMany,
    workflowUpdate: prisma.novelWorkflowTask.update,
    generationFindMany: prisma.generationJob.findMany,
    generationUpdateMany: prisma.generationJob.updateMany,
  };
  const workflowUpdates = [];
  const generationUpdates = [];
  const cancelAttempts = [];

  prisma.novelWorkflowTask.findMany = async () => ([
    {
      id: "task_old_overlap",
      seedPayloadJson: JSON.stringify({
        autoExecution: {
          enabled: true,
          mode: "chapter_range",
          startOrder: 8,
          endOrder: 12,
        },
      }),
    },
    {
      id: "task_old_outside",
      seedPayloadJson: JSON.stringify({
        autoExecution: {
          enabled: true,
          mode: "chapter_range",
          startOrder: 31,
          endOrder: 40,
        },
      }),
    },
  ]);
  prisma.novelWorkflowTask.update = async ({ where, data }) => {
    workflowUpdates.push({ where, data });
    return { id: where.id, ...data };
  };
  prisma.generationJob.findMany = async () => ([
    { id: "job_overlap", startOrder: 9, endOrder: 10 },
    { id: "job_outside", startOrder: 31, endOrder: 40 },
  ]);
  prisma.generationJob.updateMany = async ({ where, data }) => {
    generationUpdates.push({ where, data });
    return { count: 1 };
  };

  try {
    const result = await cancelContinueExistingReplacedRuns({
      novelId: "novel_demo",
      replacementTaskId: "task_new",
      autoExecutionPlan: {
        mode: "chapter_range",
        startOrder: 10,
        endOrder: 20,
      },
      cancelPipelineJob: async (jobId) => {
        cancelAttempts.push(jobId);
        throw new Error("runtime cannot cancel queued job");
      },
    });

    assert.deepEqual(result.workflowTaskIds, ["task_old_overlap"]);
    assert.deepEqual(result.pipelineJobIds, ["job_overlap"]);
    assert.deepEqual(workflowUpdates.map((item) => item.where.id), ["task_old_overlap"]);
    assert.equal(workflowUpdates[0].data.status, "cancelled");
    assert.equal(workflowUpdates[0].data.lastError, "由本任务替代：task_new");
    const replacementPayload = JSON.parse(workflowUpdates[0].data.seedPayloadJson);
    assert.equal(replacementPayload.replacementTaskId, "task_new");
    assert.equal(replacementPayload.replacementReason, "由本任务替代");
    assert.deepEqual(cancelAttempts, ["job_overlap"]);
    assert.deepEqual(generationUpdates.map((item) => item.where.id), ["job_overlap"]);
    assert.equal(generationUpdates[0].data.error, "由本任务替代：task_new");
  } finally {
    prisma.novelWorkflowTask.findMany = originals.workflowFindMany;
    prisma.novelWorkflowTask.update = originals.workflowUpdate;
    prisma.generationJob.findMany = originals.generationFindMany;
    prisma.generationJob.updateMany = originals.generationUpdateMany;
  }
});
