const test = require("node:test");
const assert = require("node:assert/strict");
const { prisma } = require("../dist/db/prisma.js");

const {
  DirectorRuntimeStore,
} = require("../dist/services/novel/director/runtime/DirectorRuntimeStore.js");

function buildSnapshot() {
  return {
    schemaVersion: 1,
    runId: "task-1",
    novelId: "novel-1",
    entrypoint: "test",
    policy: {
      mode: "run_until_gate",
      mayOverwriteUserContent: false,
      maxAutoRepairAttempts: 1,
      allowExpensiveReview: false,
      modelTier: "balanced",
      updatedAt: "2026-04-28T00:00:00.000Z",
    },
    steps: [],
    events: [],
    artifacts: [],
    updatedAt: "2026-04-28T00:00:00.000Z",
  };
}

test("director runtime store records repeated running updates as heartbeat events", async () => {
  const store = new DirectorRuntimeStore();
  let snapshot = buildSnapshot();
  store.mutateSnapshot = async (_taskId, mutator) => {
    snapshot = mutator(snapshot, {});
    return snapshot;
  };

  await store.recordStepStarted({
    taskId: "task-1",
    novelId: "novel-1",
    nodeKey: "volume_strategy.volume_generation",
    label: "正在生成卷战略",
    targetType: "volume",
    targetId: "volume-1",
  });
  const startedAt = snapshot.steps[0].startedAt;

  await store.recordStepStarted({
    taskId: "task-1",
    novelId: "novel-1",
    nodeKey: "volume_strategy.volume_generation",
    label: "正在生成卷战略（已等待 30s）",
    targetType: "volume",
    targetId: "volume-1",
  });

  assert.equal(snapshot.steps.length, 1);
  assert.equal(snapshot.steps[0].startedAt, startedAt);
  assert.equal(snapshot.steps[0].label, "正在生成卷战略（已等待 30s）");
  assert.deepEqual(snapshot.events.map((event) => event.type), ["node_started", "node_heartbeat"]);
  assert.equal(snapshot.events[1].affectedScope, "volume:volume-1");
});

test("director runtime store records explicit run resume events", async () => {
  const store = new DirectorRuntimeStore();
  let snapshot = buildSnapshot();
  store.mutateSnapshot = async (_taskId, mutator) => {
    snapshot = mutator(snapshot, {});
    return snapshot;
  };

  await store.recordRunResumed({
    taskId: "task-1",
    novelId: "novel-1",
    summary: "用户确认后继续。",
    reason: "manual_recovery_confirmed",
  });

  assert.equal(snapshot.events.length, 1);
  assert.equal(snapshot.events[0].type, "run_resumed");
  assert.equal(snapshot.events[0].summary, "用户确认后继续。");
  assert.deepEqual(snapshot.events[0].metadata, {
    reason: "manual_recovery_confirmed",
  });
});

test("director runtime store dual-writes runtime snapshot into persistent ledger tables", async () => {
  const store = new DirectorRuntimeStore();
  const calls = [];
  const originals = {
    workflowFindUnique: prisma.novelWorkflowTask.findUnique,
    workflowUpdate: prisma.novelWorkflowTask.update,
    runUpsert: prisma.directorRun.upsert,
    stepUpsert: prisma.directorStepRun.upsert,
    eventUpsert: prisma.directorEvent.upsert,
    artifactUpsert: prisma.directorArtifact.upsert,
    dependencyDeleteMany: prisma.directorArtifactDependency.deleteMany,
    dependencyUpsert: prisma.directorArtifactDependency.upsert,
  };

  prisma.novelWorkflowTask.findUnique = async () => ({
    id: "task-1",
    novelId: "novel-1",
    seedPayloadJson: JSON.stringify({ novelId: "novel-1" }),
  });
  prisma.novelWorkflowTask.update = async ({ data }) => {
    calls.push(["workflow.update", JSON.parse(data.seedPayloadJson).directorRuntime.runId]);
    return {};
  };
  prisma.directorRun.upsert = async ({ create, update }) => {
    calls.push(["run.upsert", create.id, update.policyJson]);
    return {};
  };
  prisma.directorStepRun.upsert = async ({ create }) => {
    calls.push(["step.upsert", create.idempotencyKey, create.status]);
    return {};
  };
  prisma.directorEvent.upsert = async ({ create }) => {
    calls.push(["event.upsert", create.id, create.type]);
    return {};
  };
  prisma.directorArtifact.upsert = async ({ create }) => {
    calls.push(["artifact.upsert", create.id, create.version]);
    return {};
  };
  prisma.directorArtifactDependency.deleteMany = async ({ where }) => {
    calls.push(["dependency.deleteMany", where.artifactId]);
    return { count: 0 };
  };
  prisma.directorArtifactDependency.upsert = async ({ create, update }) => {
    calls.push(["dependency.upsert", create.artifactId, create.dependsOnArtifactId, update.dependsOnVersion]);
    return {};
  };

  try {
    await store.mutateSnapshot("task-1", (snapshot) => ({
      ...snapshot,
      runId: "task-1",
      novelId: "novel-1",
      steps: [{
        idempotencyKey: "task-1:chapter_quality_review_node:chapter:chapter-1",
        nodeKey: "chapter_quality_review_node",
        label: "检查章节质量",
        status: "succeeded",
        targetType: "chapter",
        targetId: "chapter-1",
        startedAt: "2026-04-28T00:00:01.000Z",
        finishedAt: "2026-04-28T00:00:02.000Z",
      }],
      events: [{
        eventId: "event-1",
        type: "node_completed",
        taskId: "task-1",
        novelId: "novel-1",
        nodeKey: "chapter_quality_review_node",
        summary: "审校完成。",
        occurredAt: "2026-04-28T00:00:02.000Z",
      }],
      artifacts: [
        {
          id: "chapter_draft:chapter:chapter-1:Chapter:chapter-1",
          novelId: "novel-1",
          artifactType: "chapter_draft",
          targetType: "chapter",
          targetId: "chapter-1",
          version: 1,
          status: "active",
          source: "user_edited",
          contentRef: { table: "Chapter", id: "chapter-1" },
          schemaVersion: "test",
          protectedUserContent: true,
        },
        {
          id: "audit_report:chapter:chapter-1:AuditReport:audit-1",
          novelId: "novel-1",
          artifactType: "audit_report",
          targetType: "chapter",
          targetId: "chapter-1",
          version: 1,
          status: "active",
          source: "ai_generated",
          contentRef: { table: "AuditReport", id: "audit-1" },
          schemaVersion: "test",
          dependsOn: [{
            artifactId: "chapter_draft:chapter:chapter-1:Chapter:chapter-1",
            version: 1,
          }],
        },
      ],
    }));

    assert.ok(calls.some((call) => call[0] === "run.upsert" && call[1] === "task-1"));
    assert.ok(calls.some((call) => call[0] === "step.upsert" && call[2] === "succeeded"));
    assert.ok(calls.some((call) => call[0] === "event.upsert" && call[2] === "node_completed"));
    assert.equal(calls.filter((call) => call[0] === "artifact.upsert").length, 2);
    assert.ok(calls.some((call) => (
      call[0] === "dependency.upsert"
      && call[1] === "audit_report:chapter:chapter-1:AuditReport:audit-1"
    )));
  } finally {
    prisma.novelWorkflowTask.findUnique = originals.workflowFindUnique;
    prisma.novelWorkflowTask.update = originals.workflowUpdate;
    prisma.directorRun.upsert = originals.runUpsert;
    prisma.directorStepRun.upsert = originals.stepUpsert;
    prisma.directorEvent.upsert = originals.eventUpsert;
    prisma.directorArtifact.upsert = originals.artifactUpsert;
    prisma.directorArtifactDependency.deleteMany = originals.dependencyDeleteMany;
    prisma.directorArtifactDependency.upsert = originals.dependencyUpsert;
  }
});

test("director runtime store deduplicates repeated artifact dependencies before ledger upsert", async () => {
  const store = new DirectorRuntimeStore();
  const dependencyCalls = [];
  const originals = {
    workflowFindUnique: prisma.novelWorkflowTask.findUnique,
    workflowUpdate: prisma.novelWorkflowTask.update,
    runUpsert: prisma.directorRun.upsert,
    dependencyDeleteMany: prisma.directorArtifactDependency.deleteMany,
    dependencyUpsert: prisma.directorArtifactDependency.upsert,
    artifactUpsert: prisma.directorArtifact.upsert,
  };

  prisma.novelWorkflowTask.findUnique = async () => ({
    id: "task-1",
    novelId: "novel-1",
    seedPayloadJson: JSON.stringify({ novelId: "novel-1" }),
  });
  prisma.novelWorkflowTask.update = async () => ({});
  prisma.directorRun.upsert = async () => ({});
  prisma.directorArtifact.upsert = async () => ({});
  prisma.directorArtifactDependency.deleteMany = async () => ({ count: 0 });
  prisma.directorArtifactDependency.upsert = async ({ create }) => {
    dependencyCalls.push([create.artifactId, create.dependsOnArtifactId, create.dependsOnVersion]);
    return {};
  };

  try {
    await store.mutateSnapshot("task-1", (snapshot) => ({
      ...snapshot,
      runId: "task-1",
      novelId: "novel-1",
      artifacts: [
        {
          id: "story_macro:novel:novel-1:StoryMacroPlan:macro-1",
          novelId: "novel-1",
          artifactType: "story_macro",
          targetType: "novel",
          targetId: "novel-1",
          version: 1,
          status: "active",
          source: "ai_generated",
          contentRef: { table: "StoryMacroPlan", id: "macro-1" },
          schemaVersion: "test",
        },
        {
          id: "volume_strategy:novel:novel-1:VolumePlan:volume-1",
          novelId: "novel-1",
          artifactType: "volume_strategy",
          targetType: "novel",
          targetId: "novel-1",
          version: 1,
          status: "active",
          source: "ai_generated",
          contentRef: { table: "VolumePlan", id: "volume-1" },
          schemaVersion: "test",
          dependsOn: [
            {
              artifactId: "story_macro:novel:novel-1:StoryMacroPlan:macro-1",
              version: 1,
            },
            {
              artifactId: "story_macro:novel:novel-1:StoryMacroPlan:macro-1",
              version: 1,
            },
          ],
        },
      ],
    }));

    assert.deepEqual(dependencyCalls, [[
      "volume_strategy:novel:novel-1:VolumePlan:volume-1",
      "story_macro:novel:novel-1:StoryMacroPlan:macro-1",
      1,
    ]]);
  } finally {
    prisma.novelWorkflowTask.findUnique = originals.workflowFindUnique;
    prisma.novelWorkflowTask.update = originals.workflowUpdate;
    prisma.directorRun.upsert = originals.runUpsert;
    prisma.directorArtifactDependency.deleteMany = originals.dependencyDeleteMany;
    prisma.directorArtifactDependency.upsert = originals.dependencyUpsert;
    prisma.directorArtifact.upsert = originals.artifactUpsert;
  }
});
