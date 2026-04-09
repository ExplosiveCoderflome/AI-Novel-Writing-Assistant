const test = require("node:test");
const assert = require("node:assert/strict");

require("../dist/app.js");
const { NovelWorkflowTaskAdapter } = require("../dist/services/task/adapters/NovelWorkflowTaskAdapter.js");
const { prisma } = require("../dist/db/prisma.js");

test("task detail exposes candidate-stage bound model before directorInput exists", async () => {
  const originals = {
    findUnique: prisma.novelWorkflowTask.findUnique,
  };

  prisma.novelWorkflowTask.findUnique = async () => ({
    id: "task_candidate_binding",
    title: "AI 自动导演",
    lane: "auto_director",
    status: "running",
    progress: 0.1,
    currentStage: "AI 自动导演",
    currentItemKey: "candidate_direction_batch",
    currentItemLabel: "正在生成第一批书级方案",
    checkpointType: null,
    checkpointSummary: null,
    resumeTargetJson: null,
    attemptCount: 1,
    maxAttempts: 3,
    lastError: null,
    createdAt: new Date("2026-04-09T09:00:00.000Z"),
    updatedAt: new Date("2026-04-09T09:05:00.000Z"),
    heartbeatAt: new Date("2026-04-09T09:05:00.000Z"),
    promptTokens: 1200,
    completionTokens: 600,
    totalTokens: 1800,
    llmCallCount: 2,
    lastTokenRecordedAt: new Date("2026-04-09T09:05:00.000Z"),
    novelId: null,
    novel: null,
    startedAt: new Date("2026-04-09T09:00:00.000Z"),
    finishedAt: null,
    cancelRequestedAt: null,
    milestonesJson: null,
    seedPayloadJson: JSON.stringify({
      idea: "A courier discovers a hidden rule-bound city underworld.",
      provider: "custom_coding_plan",
      model: "kimi-k2.5",
      temperature: 0.8,
      candidateStage: {
        mode: "generate",
      },
    }),
  });

  const adapter = new NovelWorkflowTaskAdapter();
  const originalHeal = adapter.workflowService.healAutoDirectorTaskState;
  adapter.workflowService.healAutoDirectorTaskState = async () => false;

  try {
    const detail = await adapter.detail("task_candidate_binding");
    assert.ok(detail);
    assert.equal(detail.provider, "custom_coding_plan");
    assert.equal(detail.model, "kimi-k2.5");
    assert.deepEqual(detail.meta.llm, {
      provider: "custom_coding_plan",
      model: "kimi-k2.5",
      temperature: 0.8,
    });
  } finally {
    prisma.novelWorkflowTask.findUnique = originals.findUnique;
    adapter.workflowService.healAutoDirectorTaskState = originalHeal;
  }
});
