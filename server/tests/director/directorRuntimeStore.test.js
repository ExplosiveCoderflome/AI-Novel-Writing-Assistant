const test = require("node:test");
const assert = require("node:assert/strict");
const { prisma } = require("../../dist/db/prisma.js");

const {
  DirectorRuntimeStore,
} = require("../../dist/services/novel/director/runtime/DirectorRuntimeStore.js");

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
    artifactFindMany: prisma.directorArtifact.findMany,
    dependencyDeleteMany: prisma.directorArtifactDependency.deleteMany,
    dependencyUpsert: prisma.directorArtifactDependency.upsert,
  };

  prisma.novelWorkflowTask.findUnique = async () => ({
    id: "task-1",
    novelId: "novel-1",
    seedPayloadJson: JSON.stringify({ novelId: "novel-1" }),
  });
  prisma.novelWorkflowTask.update = async ({ data }) => {
    calls.push(["workflow.update", data.seedPayloadJson]);
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
  prisma.directorArtifact.findMany = async ({ where }) => (
    (where?.id?.in ?? []).map((id) => ({ id }))
  );
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
    assert.equal(
      calls.some((call) => call[0] === "workflow.update"),
      false,
      "runtime snapshot updates must not rewrite NovelWorkflowTask.seedPayloadJson on every step",
    );
  } finally {
    prisma.novelWorkflowTask.findUnique = originals.workflowFindUnique;
    prisma.novelWorkflowTask.update = originals.workflowUpdate;
    prisma.directorRun.upsert = originals.runUpsert;
    prisma.directorStepRun.upsert = originals.stepUpsert;
    prisma.directorEvent.upsert = originals.eventUpsert;
    prisma.directorArtifact.upsert = originals.artifactUpsert;
    prisma.directorArtifact.findMany = originals.artifactFindMany;
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
    artifactFindMany: prisma.directorArtifact.findMany,
  };

  prisma.novelWorkflowTask.findUnique = async () => ({
    id: "task-1",
    novelId: "novel-1",
    seedPayloadJson: JSON.stringify({ novelId: "novel-1" }),
  });
  prisma.novelWorkflowTask.update = async () => ({});
  prisma.directorRun.upsert = async () => ({});
  prisma.directorArtifact.upsert = async () => ({});
  prisma.directorArtifact.findMany = async ({ where }) => (
    (where?.id?.in ?? []).map((id) => ({ id }))
  );
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
    prisma.directorArtifact.findMany = originals.artifactFindMany;
  }
});

test("director runtime store writes all artifacts before artifact dependencies", async () => {
  const store = new DirectorRuntimeStore();
  const calls = [];
  const originals = {
    workflowFindUnique: prisma.novelWorkflowTask.findUnique,
    workflowUpdate: prisma.novelWorkflowTask.update,
    runUpsert: prisma.directorRun.upsert,
    dependencyDeleteMany: prisma.directorArtifactDependency.deleteMany,
    dependencyUpsert: prisma.directorArtifactDependency.upsert,
    artifactUpsert: prisma.directorArtifact.upsert,
    artifactFindMany: prisma.directorArtifact.findMany,
  };

  prisma.novelWorkflowTask.findUnique = async () => ({
    id: "task-1",
    novelId: "novel-1",
    seedPayloadJson: JSON.stringify({ novelId: "novel-1" }),
  });
  prisma.novelWorkflowTask.update = async () => ({});
  prisma.directorRun.upsert = async () => ({});
  prisma.directorArtifact.upsert = async ({ create }) => {
    calls.push(["artifact.upsert", create.id]);
    return {};
  };
  prisma.directorArtifact.findMany = async ({ where }) => (
    (where?.id?.in ?? []).map((id) => ({ id }))
  );
  prisma.directorArtifactDependency.deleteMany = async ({ where }) => {
    calls.push(["dependency.deleteMany", where.artifactId]);
    return { count: 0 };
  };
  prisma.directorArtifactDependency.upsert = async ({ create }) => {
    calls.push(["dependency.upsert", create.artifactId, create.dependsOnArtifactId]);
    return {};
  };

  try {
    await store.mutateSnapshot("task-1", (snapshot) => ({
      ...snapshot,
      runId: "task-1",
      novelId: "novel-1",
      artifacts: [
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
          dependsOn: [{
            artifactId: "story_macro:novel:novel-1:StoryMacroPlan:macro-1",
            version: 1,
          }],
        },
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
      ],
    }));

    assert.deepEqual(calls.slice(0, 2), [
      ["artifact.upsert", "volume_strategy:novel:novel-1:VolumePlan:volume-1"],
      ["artifact.upsert", "story_macro:novel:novel-1:StoryMacroPlan:macro-1"],
    ]);
    assert.ok(
      calls.findIndex((call) => call[0] === "dependency.upsert")
        > calls.findLastIndex((call) => call[0] === "artifact.upsert"),
      "dependency writes must happen after all artifact rows exist",
    );
  } finally {
    prisma.novelWorkflowTask.findUnique = originals.workflowFindUnique;
    prisma.novelWorkflowTask.update = originals.workflowUpdate;
    prisma.directorRun.upsert = originals.runUpsert;
    prisma.directorArtifactDependency.deleteMany = originals.dependencyDeleteMany;
    prisma.directorArtifactDependency.upsert = originals.dependencyUpsert;
    prisma.directorArtifact.upsert = originals.artifactUpsert;
    prisma.directorArtifact.findMany = originals.artifactFindMany;
  }
});

test("director runtime store skips dependencies whose target is outside snapshot and database", async () => {
  const store = new DirectorRuntimeStore();
  const dependencyCalls = [];
  const existingArtifact = {
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
  };
  const originals = {
    workflowFindUnique: prisma.novelWorkflowTask.findUnique,
    workflowUpdate: prisma.novelWorkflowTask.update,
    runFindUnique: prisma.directorRun.findUnique,
    runUpsert: prisma.directorRun.upsert,
    dependencyDeleteMany: prisma.directorArtifactDependency.deleteMany,
    dependencyUpsert: prisma.directorArtifactDependency.upsert,
    artifactUpsert: prisma.directorArtifact.upsert,
    artifactFindMany: prisma.directorArtifact.findMany,
  };

  prisma.novelWorkflowTask.findUnique = async () => ({
    id: "task-1",
    novelId: "novel-1",
    seedPayloadJson: JSON.stringify({
      novelId: "novel-1",
      directorRuntime: {
        schemaVersion: 1,
        runId: "task-1",
        novelId: "novel-1",
        entrypoint: "takeover",
        policy: { mode: "suggest_only", updatedAt: "2026-04-28T00:00:00.000Z" },
        steps: [],
        events: [],
        artifacts: [],
        updatedAt: "2026-04-28T00:00:00.000Z",
      },
    }),
  });
  prisma.novelWorkflowTask.update = async () => ({});
  prisma.directorRun.findUnique = async () => null;
  prisma.directorRun.upsert = async () => ({});
  prisma.directorArtifact.upsert = async () => ({});
  prisma.directorArtifact.findMany = async () => [];
  prisma.directorArtifactDependency.deleteMany = async () => ({ count: 0 });
  prisma.directorArtifactDependency.upsert = async ({ create }) => {
    dependencyCalls.push([create.artifactId, create.dependsOnArtifactId]);
    return {};
  };

  try {
    await store.mutateSnapshot("task-1", (snapshot) => ({
      ...snapshot,
      artifacts: [
        ...snapshot.artifacts,
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
          dependsOn: [{
            artifactId: existingArtifact.id,
            version: 1,
          }],
        },
      ],
    }));

    assert.deepEqual(dependencyCalls, []);
  } finally {
    prisma.novelWorkflowTask.findUnique = originals.workflowFindUnique;
    prisma.novelWorkflowTask.update = originals.workflowUpdate;
    prisma.directorRun.findUnique = originals.runFindUnique;
    prisma.directorRun.upsert = originals.runUpsert;
    prisma.directorArtifactDependency.deleteMany = originals.dependencyDeleteMany;
    prisma.directorArtifactDependency.upsert = originals.dependencyUpsert;
    prisma.directorArtifact.upsert = originals.artifactUpsert;
    prisma.directorArtifact.findMany = originals.artifactFindMany;
  }
});

test("director runtime store writes dependencies to persisted snapshot targets", async () => {
  const store = new DirectorRuntimeStore();
  const dependencyCalls = [];
  const existingArtifact = {
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
  };
  const originals = {
    workflowFindUnique: prisma.novelWorkflowTask.findUnique,
    workflowUpdate: prisma.novelWorkflowTask.update,
    runFindUnique: prisma.directorRun.findUnique,
    runUpsert: prisma.directorRun.upsert,
    dependencyDeleteMany: prisma.directorArtifactDependency.deleteMany,
    dependencyUpsert: prisma.directorArtifactDependency.upsert,
    artifactUpsert: prisma.directorArtifact.upsert,
    artifactFindMany: prisma.directorArtifact.findMany,
  };

  prisma.novelWorkflowTask.findUnique = async () => ({
    id: "task-1",
    novelId: "novel-1",
    seedPayloadJson: JSON.stringify({
      novelId: "novel-1",
      directorRuntime: {
        schemaVersion: 1,
        runId: "task-1",
        novelId: "novel-1",
        entrypoint: "takeover",
        policy: { mode: "suggest_only", updatedAt: "2026-04-28T00:00:00.000Z" },
        steps: [],
        events: [],
        artifacts: [existingArtifact],
        updatedAt: "2026-04-28T00:00:00.000Z",
      },
    }),
  });
  prisma.novelWorkflowTask.update = async () => ({});
  prisma.directorRun.findUnique = async () => null;
  prisma.directorRun.upsert = async () => ({});
  prisma.directorArtifact.upsert = async () => ({});
  prisma.directorArtifact.findMany = async ({ where }) => (
    (where?.id?.in ?? []).includes(existingArtifact.id) ? [{ id: existingArtifact.id }] : []
  );
  prisma.directorArtifactDependency.deleteMany = async () => ({ count: 0 });
  prisma.directorArtifactDependency.upsert = async ({ create }) => {
    dependencyCalls.push([create.artifactId, create.dependsOnArtifactId]);
    return {};
  };

  try {
    await store.mutateSnapshot("task-1", (snapshot) => ({
      ...snapshot,
      artifacts: [
        ...snapshot.artifacts,
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
          dependsOn: [{
            artifactId: existingArtifact.id,
            version: 1,
          }],
        },
      ],
    }));

    assert.deepEqual(dependencyCalls, [[
      "volume_strategy:novel:novel-1:VolumePlan:volume-1",
      existingArtifact.id,
    ]]);
  } finally {
    prisma.novelWorkflowTask.findUnique = originals.workflowFindUnique;
    prisma.novelWorkflowTask.update = originals.workflowUpdate;
    prisma.directorRun.findUnique = originals.runFindUnique;
    prisma.directorRun.upsert = originals.runUpsert;
    prisma.directorArtifactDependency.deleteMany = originals.dependencyDeleteMany;
    prisma.directorArtifactDependency.upsert = originals.dependencyUpsert;
    prisma.directorArtifact.upsert = originals.artifactUpsert;
    prisma.directorArtifact.findMany = originals.artifactFindMany;
  }
});

test("director runtime store persists legacy seed artifacts before new dependency edges", async () => {
  const store = new DirectorRuntimeStore();
  const artifactCalls = [];
  const dependencyCalls = [];
  const parentArtifact = {
    id: "story_macro:novel:novel-1:StoryMacroPlan:macro-legacy",
    novelId: "novel-1",
    artifactType: "story_macro",
    targetType: "novel",
    targetId: "novel-1",
    version: 1,
    status: "active",
    source: "ai_generated",
    contentRef: { table: "StoryMacroPlan", id: "macro-legacy" },
    schemaVersion: "test",
  };
  const originals = {
    workflowFindUnique: prisma.novelWorkflowTask.findUnique,
    workflowUpdate: prisma.novelWorkflowTask.update,
    runFindUnique: prisma.directorRun.findUnique,
    runUpsert: prisma.directorRun.upsert,
    dependencyDeleteMany: prisma.directorArtifactDependency.deleteMany,
    dependencyUpsert: prisma.directorArtifactDependency.upsert,
    artifactUpsert: prisma.directorArtifact.upsert,
    artifactFindMany: prisma.directorArtifact.findMany,
  };

  prisma.novelWorkflowTask.findUnique = async () => ({
    id: "task-legacy",
    novelId: "novel-1",
    seedPayloadJson: JSON.stringify({
      novelId: "novel-1",
      directorRuntime: {
        schemaVersion: 1,
        runId: "task-legacy",
        novelId: "novel-1",
        entrypoint: "takeover",
        policy: { mode: "run_until_gate", updatedAt: "2026-04-28T00:00:00.000Z" },
        steps: [],
        events: [],
        artifacts: [parentArtifact],
        updatedAt: "2026-04-28T00:00:00.000Z",
      },
    }),
  });
  prisma.novelWorkflowTask.update = async () => ({});
  prisma.directorRun.findUnique = async () => null;
  prisma.directorRun.upsert = async () => ({});
  prisma.directorArtifact.upsert = async ({ create }) => {
    artifactCalls.push(create.id);
    return {};
  };
  prisma.directorArtifact.findMany = async ({ where }) => (
    (where?.id?.in ?? []).map((id) => ({ id }))
  );
  prisma.directorArtifactDependency.deleteMany = async () => ({ count: 0 });
  prisma.directorArtifactDependency.upsert = async ({ create }) => {
    dependencyCalls.push([create.artifactId, create.dependsOnArtifactId]);
    return {};
  };

  try {
    await store.mutateSnapshot("task-legacy", (snapshot) => ({
      ...snapshot,
      artifacts: [
        ...snapshot.artifacts,
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
          dependsOn: [{
            artifactId: parentArtifact.id,
            version: 1,
          }],
        },
      ],
    }));

    assert.deepEqual(artifactCalls, [
      parentArtifact.id,
      "volume_strategy:novel:novel-1:VolumePlan:volume-1",
    ]);
    assert.deepEqual(dependencyCalls, [[
      "volume_strategy:novel:novel-1:VolumePlan:volume-1",
      parentArtifact.id,
    ]]);
  } finally {
    prisma.novelWorkflowTask.findUnique = originals.workflowFindUnique;
    prisma.novelWorkflowTask.update = originals.workflowUpdate;
    prisma.directorRun.findUnique = originals.runFindUnique;
    prisma.directorRun.upsert = originals.runUpsert;
    prisma.directorArtifactDependency.deleteMany = originals.dependencyDeleteMany;
    prisma.directorArtifactDependency.upsert = originals.dependencyUpsert;
    prisma.directorArtifact.upsert = originals.artifactUpsert;
    prisma.directorArtifact.findMany = originals.artifactFindMany;
  }
});

test("director runtime store backfills legacy seed artifacts missing from persistent runs", async () => {
  const store = new DirectorRuntimeStore();
  const artifactCalls = [];
  const legacyArtifact = {
    id: "book_contract:novel:novel-1:BookContract:contract-legacy",
    novelId: "novel-1",
    artifactType: "book_contract",
    targetType: "novel",
    targetId: "novel-1",
    version: 1,
    status: "active",
    source: "ai_generated",
    contentRef: { table: "BookContract", id: "contract-legacy" },
    schemaVersion: "test",
  };
  const originals = {
    workflowFindUnique: prisma.novelWorkflowTask.findUnique,
    workflowUpdate: prisma.novelWorkflowTask.update,
    runFindUnique: prisma.directorRun.findUnique,
    runUpsert: prisma.directorRun.upsert,
    dependencyDeleteMany: prisma.directorArtifactDependency.deleteMany,
    artifactUpsert: prisma.directorArtifact.upsert,
    artifactFindMany: prisma.directorArtifact.findMany,
  };

  prisma.novelWorkflowTask.findUnique = async () => ({
    id: "task-legacy-existing-run",
    novelId: "novel-1",
    seedPayloadJson: JSON.stringify({
      novelId: "novel-1",
      directorRuntime: {
        schemaVersion: 1,
        runId: "task-legacy-existing-run",
        novelId: "novel-1",
        entrypoint: "takeover",
        policy: { mode: "run_until_gate", updatedAt: "2026-04-28T00:00:00.000Z" },
        steps: [],
        events: [],
        artifacts: [legacyArtifact],
        updatedAt: "2026-04-28T00:00:00.000Z",
      },
    }),
  });
  prisma.novelWorkflowTask.update = async () => ({});
  prisma.directorRun.findUnique = async () => ({
    id: "task-legacy-existing-run",
    novelId: "novel-1",
    entrypoint: "takeover",
    policyJson: JSON.stringify({ mode: "run_until_gate", updatedAt: "2026-04-28T00:00:00.000Z" }),
    lastWorkspaceAnalysisJson: null,
    updatedAt: new Date("2026-04-28T00:00:00.000Z"),
    steps: [],
    events: [],
    artifacts: [],
  });
  prisma.directorRun.upsert = async () => ({});
  prisma.directorArtifact.upsert = async ({ create }) => {
    artifactCalls.push(create.id);
    return {};
  };
  prisma.directorArtifact.findMany = async () => [];
  prisma.directorArtifactDependency.deleteMany = async () => ({ count: 0 });

  try {
    await store.mutateSnapshot("task-legacy-existing-run", (snapshot) => snapshot);

    assert.deepEqual(artifactCalls, [legacyArtifact.id]);
  } finally {
    prisma.novelWorkflowTask.findUnique = originals.workflowFindUnique;
    prisma.novelWorkflowTask.update = originals.workflowUpdate;
    prisma.directorRun.findUnique = originals.runFindUnique;
    prisma.directorRun.upsert = originals.runUpsert;
    prisma.directorArtifactDependency.deleteMany = originals.dependencyDeleteMany;
    prisma.directorArtifact.upsert = originals.artifactUpsert;
    prisma.directorArtifact.findMany = originals.artifactFindMany;
  }
});

test("director runtime store tolerates duplicate artifact ledger recovery writes", async () => {
  const store = new DirectorRuntimeStore();
  const artifactUpdates = [];
  const dependencyDeleteCalls = [];
  const dependencyUpdates = [];
  let artifactUpsertCalls = 0;
  let dependencyUpsertCalls = 0;
  const originals = {
    workflowFindUnique: prisma.novelWorkflowTask.findUnique,
    workflowUpdate: prisma.novelWorkflowTask.update,
    runUpsert: prisma.directorRun.upsert,
    dependencyDeleteMany: prisma.directorArtifactDependency.deleteMany,
    dependencyUpsert: prisma.directorArtifactDependency.upsert,
    dependencyUpdate: prisma.directorArtifactDependency.update,
    artifactUpsert: prisma.directorArtifact.upsert,
    artifactFindMany: prisma.directorArtifact.findMany,
    artifactUpdate: prisma.directorArtifact.update,
  };

  prisma.novelWorkflowTask.findUnique = async () => ({
    id: "task-1",
    novelId: "novel-1",
    seedPayloadJson: JSON.stringify({ novelId: "novel-1" }),
  });
  prisma.novelWorkflowTask.update = async () => ({});
  prisma.directorRun.upsert = async () => ({});
  prisma.directorArtifact.upsert = async ({ create }) => {
    artifactUpsertCalls += 1;
    if (create.id === "story_macro:novel:novel-1:StoryMacroPlan:macro-1") {
      throw { code: "P2002" };
    }
    return {};
  };
  prisma.directorArtifact.update = async ({ where, data }) => {
    artifactUpdates.push([where.id, data.version]);
    return {};
  };
  prisma.directorArtifact.findMany = async ({ where }) => (
    (where?.id?.in ?? []).map((id) => ({ id }))
  );
  prisma.directorArtifactDependency.deleteMany = async ({ where }) => {
    dependencyDeleteCalls.push(where);
    return { count: 0 };
  };
  prisma.directorArtifactDependency.upsert = async ({ create }) => {
    dependencyUpsertCalls += 1;
    if (create.artifactId === "volume_strategy:novel:novel-1:VolumePlan:volume-1") {
      throw { code: "P2002" };
    }
    return {};
  };
  prisma.directorArtifactDependency.update = async ({ where, data }) => {
    dependencyUpdates.push([
      where.artifactId_dependsOnArtifactId.artifactId,
      where.artifactId_dependsOnArtifactId.dependsOnArtifactId,
      data.dependsOnVersion,
    ]);
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
          version: 2,
          status: "active",
          source: "ai_generated",
          contentRef: { table: "VolumePlan", id: "volume-1" },
          schemaVersion: "test",
          dependsOn: [{
            artifactId: "story_macro:novel:novel-1:StoryMacroPlan:macro-1",
            version: 1,
          }],
        },
      ],
    }));

    assert.equal(artifactUpsertCalls, 2);
    assert.deepEqual(artifactUpdates, [[
      "story_macro:novel:novel-1:StoryMacroPlan:macro-1",
      1,
    ]]);
    assert.equal(dependencyUpsertCalls, 1);
    assert.deepEqual(dependencyUpdates, [[
      "volume_strategy:novel:novel-1:VolumePlan:volume-1",
      "story_macro:novel:novel-1:StoryMacroPlan:macro-1",
      1,
    ]]);
    assert.deepEqual(
      dependencyDeleteCalls.find((where) => (
        where.artifactId === "volume_strategy:novel:novel-1:VolumePlan:volume-1"
      )),
      {
        artifactId: "volume_strategy:novel:novel-1:VolumePlan:volume-1",
        dependsOnArtifactId: {
          notIn: ["story_macro:novel:novel-1:StoryMacroPlan:macro-1"],
        },
      },
    );
  } finally {
    prisma.novelWorkflowTask.findUnique = originals.workflowFindUnique;
    prisma.novelWorkflowTask.update = originals.workflowUpdate;
    prisma.directorRun.upsert = originals.runUpsert;
    prisma.directorArtifactDependency.deleteMany = originals.dependencyDeleteMany;
    prisma.directorArtifactDependency.upsert = originals.dependencyUpsert;
    prisma.directorArtifactDependency.update = originals.dependencyUpdate;
    prisma.directorArtifact.upsert = originals.artifactUpsert;
    prisma.directorArtifact.findMany = originals.artifactFindMany;
    prisma.directorArtifact.update = originals.artifactUpdate;
  }
});
