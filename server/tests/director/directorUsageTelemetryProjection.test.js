const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DirectorUsageTelemetryQueryService,
} = require("../../dist/services/novel/director/runtime/DirectorUsageTelemetryQueryService.js");
const {
  getDirectorNodeDisplayLabel,
} = require("../../../shared/dist/types/directorRuntime.js");
const { prisma } = require("../../dist/db/prisma.js");

function usageRow(overrides = {}) {
  return {
    id: "usage-1",
    novelId: "novel-1",
    taskId: "task-1",
    runId: "run-1",
    stepIdempotencyKey: "task-1:node-a:global:global",
    nodeKey: "node-a",
    promptAssetKey: "asset-a",
    promptVersion: "v1",
    modelRoute: "chapter_write",
    provider: "deepseek",
    model: "deepseek-chat",
    status: "recorded",
    attributionStatus: "step_attributed",
    durationMs: 1000,
    promptTokens: 10,
    completionTokens: 5,
    totalTokens: 15,
    recordedAt: new Date("2026-04-30T05:00:00.000Z"),
    ...overrides,
  };
}

function installFindManySpy(rows) {
  const calls = [];
  const original = prisma.directorLlmUsageRecord.findMany;
  prisma.directorLlmUsageRecord.findMany = async (input) => {
    calls.push(input);
    return rows;
  };
  return {
    calls,
    restore() {
      prisma.directorLlmUsageRecord.findMany = original;
    },
  };
}

test("director usage telemetry projection summarizes task and step records", async () => {
  const spies = installFindManySpy([
    usageRow({
      id: "usage-later",
      durationMs: 2000,
      promptTokens: 20,
      completionTokens: 8,
      totalTokens: 28,
      recordedAt: new Date("2026-04-30T05:01:00.000Z"),
    }),
    usageRow({ id: "usage-earlier" }),
  ]);
  try {
    const service = new DirectorUsageTelemetryQueryService();
    const result = await service.getTaskUsage("task-1", [{
      idempotencyKey: "task-1:node-a:global:global",
      nodeKey: "node-a",
      label: "生成章节任务单",
      status: "succeeded",
      startedAt: "2026-04-30T05:00:00.000Z",
      finishedAt: "2026-04-30T05:02:00.000Z",
    }]);

    assert.equal(spies.calls[0].where.taskId, "task-1");
    assert.equal(result.summary.llmCallCount, 2);
    assert.equal(result.summary.promptTokens, 30);
    assert.equal(result.summary.completionTokens, 13);
    assert.equal(result.summary.totalTokens, 43);
    assert.equal(result.summary.durationMs, 3000);
    assert.equal(result.recentUsage[0].id, "usage-later");
    assert.equal(result.stepUsage.length, 1);
    assert.equal(result.stepUsage[0].label, "生成章节任务单");
    assert.equal(result.stepUsage[0].llmCallCount, 2);
    assert.equal(result.promptUsage.length, 1);
    assert.equal(result.promptUsage[0].promptAssetKey, "asset-a");
    assert.equal(result.promptUsage[0].llmCallCount, 2);
  } finally {
    spies.restore();
  }
});

test("director usage labels distinguish chapter workflow from draft writing", () => {
  assert.equal(
    getDirectorNodeDisplayLabel({ nodeKey: "chapter_execution_node" }),
    "章节执行流程",
  );
  assert.equal(
    getDirectorNodeDisplayLabel({ label: "novel.chapter.writer", nodeKey: "chapter_execution_node" }),
    "章节正文生成",
  );
});

test("director usage telemetry projection can query a book by novel or task ids", async () => {
  const spies = installFindManySpy([usageRow()]);
  try {
    const service = new DirectorUsageTelemetryQueryService();
    await service.getBookUsage({
      novelId: "novel-1",
      taskIds: ["task-1", "task-2", "task-1"],
    });

    assert.deepEqual(spies.calls[0].where, {
      OR: [
        { novelId: "novel-1" },
        { taskId: { in: ["task-1", "task-2"] } },
      ],
    });
  } finally {
    spies.restore();
  }
});
