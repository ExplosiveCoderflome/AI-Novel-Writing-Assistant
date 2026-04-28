const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DirectorNodeRunner,
} = require("../dist/services/novel/director/runtime/DirectorNodeRunner.js");
const {
  DirectorPolicyEngine,
} = require("../dist/services/novel/director/runtime/DirectorPolicyEngine.js");

function buildSnapshot(policy) {
  return {
    schemaVersion: 1,
    runId: "task-1",
    novelId: "novel-1",
    entrypoint: "test",
    policy,
    steps: [],
    events: [],
    artifacts: [],
    updatedAt: "2026-04-28T00:00:00.000Z",
  };
}

function buildStore(snapshot) {
  const calls = [];
  return {
    calls,
    getSnapshot: async () => snapshot,
    recordNodeGate: async (input) => {
      calls.push({ type: "gate", input });
    },
    recordStepStarted: async (input) => {
      calls.push({ type: "started", input });
    },
    recordStepCompleted: async (input) => {
      calls.push({ type: "completed", input });
    },
    recordStepFailed: async (input) => {
      calls.push({ type: "failed", input });
    },
  };
}

function buildContract(run) {
  return {
    nodeKey: "chapter_execution_node",
    label: "执行章节节点",
    reads: ["chapter_task_sheet"],
    writes: ["chapter_draft"],
    mayModifyUserContent: false,
    requiresApprovalByDefault: false,
    supportsAutoRetry: false,
    run,
  };
}

test("director node runner blocks writes when runtime policy is suggest-only", async () => {
  let executed = false;
  const store = buildStore(buildSnapshot({
    mode: "suggest_only",
    mayOverwriteUserContent: false,
    maxAutoRepairAttempts: 1,
    allowExpensiveReview: false,
    modelTier: "balanced",
    updatedAt: "2026-04-28T00:00:00.000Z",
  }));
  const runner = new DirectorNodeRunner(store, new DirectorPolicyEngine());

  const result = await runner.run(buildContract(async () => {
    executed = true;
    return { ok: true };
  }), {
    taskId: "task-1",
    novelId: "novel-1",
    targetType: "chapter",
    targetId: "chapter-1",
    input: undefined,
  });

  assert.equal(executed, false);
  assert.equal(result.status, "blocked_scope");
  assert.equal(store.calls.length, 1);
  assert.equal(store.calls[0].type, "gate");
  assert.equal(store.calls[0].input.status, "blocked_scope");
  assert.equal(store.calls[0].input.targetType, "chapter");
  assert.equal(store.calls[0].input.targetId, "chapter-1");
});

test("director node runner records target-scoped step completion", async () => {
  const store = buildStore(buildSnapshot({
    mode: "run_until_gate",
    mayOverwriteUserContent: false,
    maxAutoRepairAttempts: 1,
    allowExpensiveReview: false,
    modelTier: "balanced",
    updatedAt: "2026-04-28T00:00:00.000Z",
  }));
  const runner = new DirectorNodeRunner(store, new DirectorPolicyEngine());

  const result = await runner.run(buildContract(async () => ({ chapterId: "chapter-1" })), {
    taskId: "task-1",
    novelId: "novel-1",
    targetType: "chapter",
    targetId: "chapter-1",
    input: undefined,
  }, () => [{
    id: "chapter_draft:chapter:chapter-1:Chapter:chapter-1",
    novelId: "novel-1",
    artifactType: "chapter_draft",
    targetType: "chapter",
    targetId: "chapter-1",
    version: 1,
    status: "active",
    source: "ai_generated",
    contentRef: { table: "Chapter", id: "chapter-1" },
    schemaVersion: "test",
  }]);

  assert.equal(result.status, "completed");
  assert.deepEqual(store.calls.map((call) => call.type), ["started", "completed"]);
  assert.equal(store.calls[0].input.targetType, "chapter");
  assert.equal(store.calls[0].input.targetId, "chapter-1");
  assert.equal(store.calls[1].input.targetType, "chapter");
  assert.equal(store.calls[1].input.targetId, "chapter-1");
  assert.equal(store.calls[1].input.producedArtifacts.length, 1);
});

test("director node runner passes contract policy action into policy decisions", async () => {
  const store = buildStore(buildSnapshot({
    mode: "run_until_gate",
    mayOverwriteUserContent: false,
    maxAutoRepairAttempts: 1,
    allowExpensiveReview: false,
    modelTier: "balanced",
    updatedAt: "2026-04-28T00:00:00.000Z",
  }));
  const decisions = [];
  const runner = new DirectorNodeRunner(store, {
    decide: (input) => {
      decisions.push(input);
      return {
        canRun: true,
        requiresApproval: false,
        reason: "ok",
        mayOverwriteUserContent: false,
        affectedArtifacts: [],
        autoRetryBudget: input.action === "repair" ? 1 : 0,
        onQualityFailure: input.action === "repair" ? "repair_once" : "continue_with_risk",
      };
    },
  });

  const contract = {
    ...buildContract(async () => ({ ok: true })),
    policyAction: "repair",
  };
  const result = await runner.run(contract, {
    taskId: "task-1",
    novelId: "novel-1",
    targetType: "chapter",
    targetId: "chapter-1",
    input: undefined,
  });

  assert.equal(result.status, "completed");
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].action, "repair");
});
