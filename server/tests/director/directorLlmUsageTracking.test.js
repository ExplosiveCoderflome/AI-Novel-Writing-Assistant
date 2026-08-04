const test = require("node:test");
const assert = require("node:assert/strict");

const {
  runWithLlmUsageTracking,
  recordTrackedLlmUsage,
} = require("../../dist/llm/usageTracking.js");
const { prisma } = require("../../dist/db/prisma.js");

function installPrismaUsageSpies() {
  const records = [];
  const workflowUpdates = [];
  const generationJobUpdates = [];
  const styleTaskUpdates = [];
  const original = {
    createUsage: prisma.directorLlmUsageRecord.create,
    updateWorkflowTask: prisma.novelWorkflowTask.updateMany,
    updateGenerationJob: prisma.generationJob.updateMany,
    updateStyleTask: prisma.styleExtractionTask.updateMany,
  };

  prisma.directorLlmUsageRecord.create = async (input) => {
    records.push(input.data);
    return { id: `usage-${records.length}`, ...input.data };
  };
  prisma.novelWorkflowTask.updateMany = async (input) => {
    workflowUpdates.push(input);
    return { count: 1 };
  };
  prisma.generationJob.updateMany = async (input) => {
    generationJobUpdates.push(input);
    return { count: 1 };
  };
  prisma.styleExtractionTask.updateMany = async (input) => {
    styleTaskUpdates.push(input);
    return { count: 1 };
  };

  return {
    records,
    workflowUpdates,
    generationJobUpdates,
    styleTaskUpdates,
    restore() {
      prisma.directorLlmUsageRecord.create = original.createUsage;
      prisma.novelWorkflowTask.updateMany = original.updateWorkflowTask;
      prisma.generationJob.updateMany = original.updateGenerationJob;
      prisma.styleExtractionTask.updateMany = original.updateStyleTask;
    },
  };
}

test("director llm usage records step attribution and keeps task aggregate", async () => {
  const spies = installPrismaUsageSpies();
  try {
    await runWithLlmUsageTracking({
      workflowTaskId: "task-1",
      directorTelemetry: true,
      novelId: "novel-1",
      directorRunId: "run-1",
      directorStepIdempotencyKey: "task-1:chapter_write:chapter:chapter-1",
      directorNodeKey: "chapter_write",
    }, () => recordTrackedLlmUsage({
      promptTokens: 100,
      completionTokens: 40,
      totalTokens: 140,
    }, {
      durationMs: 2500,
      meta: {
        provider: "deepseek",
        model: "deepseek-chat",
        taskType: "chapter_write",
        promptMeta: {
          promptId: "novel.chapter.writer",
          promptVersion: "v5",
          novelId: "novel-from-prompt",
          taskId: "task-from-prompt",
          chapterId: "chapter-1",
        },
      },
    }));

    assert.equal(spies.records.length, 1);
    assert.equal(spies.records[0].novelId, "novel-1");
    assert.equal(spies.records[0].taskId, "task-1");
    assert.equal(spies.records[0].runId, "run-1");
    assert.equal(spies.records[0].stepIdempotencyKey, "task-1:chapter_write:chapter:chapter-1");
    assert.equal(spies.records[0].nodeKey, "chapter_write");
    assert.equal(spies.records[0].promptAssetKey, "novel.chapter.writer");
    assert.equal(spies.records[0].promptVersion, "v5");
    assert.equal(spies.records[0].provider, "deepseek");
    assert.equal(spies.records[0].model, "deepseek-chat");
    assert.equal(spies.records[0].modelRoute, "chapter_write");
    assert.equal(spies.records[0].attributionStatus, "step_attributed");
    assert.equal(spies.records[0].durationMs, 2500);
    assert.equal(spies.records[0].promptTokens, 100);
    assert.equal(spies.records[0].completionTokens, 40);
    assert.equal(spies.records[0].totalTokens, 140);
    assert.equal(spies.workflowUpdates.length, 1);
    assert.deepEqual(spies.workflowUpdates[0].data.llmCallCount, { increment: 1 });
  } finally {
    spies.restore();
  }
});

test("director llm usage without a step is marked task only", async () => {
  const spies = installPrismaUsageSpies();
  try {
    await runWithLlmUsageTracking({
      workflowTaskId: "task-2",
      directorTelemetry: true,
    }, () => recordTrackedLlmUsage({
      promptTokens: 12,
      completionTokens: 8,
      totalTokens: 20,
    }));

    assert.equal(spies.records.length, 1);
    assert.equal(spies.records[0].taskId, "task-2");
    assert.equal(spies.records[0].stepIdempotencyKey, null);
    assert.equal(spies.records[0].attributionStatus, "task_only");
    assert.equal(spies.workflowUpdates.length, 1);
  } finally {
    spies.restore();
  }
});

test("non-director tracked usage does not create director telemetry records", async () => {
  const spies = installPrismaUsageSpies();
  try {
    await runWithLlmUsageTracking({
      workflowTaskId: "task-3",
    }, () => recordTrackedLlmUsage({
      promptTokens: 5,
      completionTokens: 4,
      totalTokens: 9,
    }));

    assert.equal(spies.records.length, 0);
    assert.equal(spies.workflowUpdates.length, 1);
  } finally {
    spies.restore();
  }
});
