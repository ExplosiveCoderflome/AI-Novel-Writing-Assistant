const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveHighMemoryDirectorStartDecision,
  assertHighMemoryDirectorStartAllowed,
  isHighMemoryDirectorStage,
  AUTO_DIRECTOR_HIGH_MEMORY_BATCH_LIMIT,
} = require("../dist/services/novel/director/autoDirectorMemorySafety.js");
const {
  isStaleAutoDirectorRunningTask,
} = require("../dist/services/novel/workflow/autoDirectorStaleTaskRecovery.js");
const {
  isHighMemoryVolumeGeneration,
  resolveHighMemoryVolumeGenerationKey,
} = require("../dist/services/novel/volume/volumeGenerationMemorySafety.js");
const {
  withHighMemoryVolumeGenerationGuard,
} = require("../dist/services/novel/volume/volumeGenerationTelemetry.js");
const {
  acquireScopedHighMemoryReservation,
} = require("../dist/services/novel/highMemoryReservation.js");
const { prisma } = require("../dist/db/prisma.js");

function installFuturePersistentLockMock(ownerId = "other-process") {
  const originals = {
    create: prisma.appSetting.create,
    findUnique: prisma.appSetting.findUnique,
    updateMany: prisma.appSetting.updateMany,
    deleteMany: prisma.appSetting.deleteMany,
  };
  const futureLock = JSON.stringify({
    ownerId,
    token: "token-other-process",
    acquiredAt: "2026-04-25T08:00:00.000Z",
    expiresAt: "2099-04-25T08:00:00.000Z",
  });
  prisma.appSetting.create = async () => {
    const error = new Error("Unique constraint failed");
    error.code = "P2002";
    throw error;
  };
  prisma.appSetting.findUnique = async ({ where }) => ({
    key: where.key,
    value: futureLock,
    createdAt: new Date("2026-04-25T08:00:00.000Z"),
    updatedAt: new Date("2026-04-25T08:00:00.000Z"),
  });
  prisma.appSetting.updateMany = async () => ({ count: 0 });
  prisma.appSetting.deleteMany = async () => ({ count: 0 });
  return () => {
    prisma.appSetting.create = originals.create;
    prisma.appSetting.findUnique = originals.findUnique;
    prisma.appSetting.updateMany = originals.updateMany;
    prisma.appSetting.deleteMany = originals.deleteMany;
  };
}

function installPersistentReservationStoreMock() {
  const originals = {
    create: prisma.appSetting.create,
    findUnique: prisma.appSetting.findUnique,
    findMany: prisma.appSetting.findMany,
    updateMany: prisma.appSetting.updateMany,
    deleteMany: prisma.appSetting.deleteMany,
  };
  const rows = new Map();
  prisma.appSetting.create = async ({ data }) => {
    if (rows.has(data.key)) {
      const error = new Error("Unique constraint failed");
      error.code = "P2002";
      throw error;
    }
    const row = {
      key: data.key,
      value: data.value,
      createdAt: new Date("2026-04-25T08:00:00.000Z"),
      updatedAt: new Date("2026-04-25T08:00:00.000Z"),
    };
    rows.set(data.key, row);
    return row;
  };
  prisma.appSetting.findUnique = async ({ where }) => rows.get(where.key) ?? null;
  prisma.appSetting.findMany = async ({ where } = {}) => {
    const prefix = where?.key?.startsWith;
    const allRows = Array.from(rows.values());
    return prefix ? allRows.filter((row) => row.key.startsWith(prefix)) : allRows;
  };
  prisma.appSetting.updateMany = async ({ where, data }) => {
    const row = rows.get(where.key);
    if (!row || (where.value !== undefined && row.value !== where.value)) {
      return { count: 0 };
    }
    rows.set(where.key, {
      ...row,
      value: data.value,
      updatedAt: new Date("2026-04-25T08:01:00.000Z"),
    });
    return { count: 1 };
  };
  prisma.appSetting.deleteMany = async ({ where }) => {
    const row = rows.get(where.key);
    if (!row || (where.value !== undefined && row.value !== where.value)) {
      return { count: 0 };
    }
    rows.delete(where.key);
    return { count: 1 };
  };
  return () => {
    prisma.appSetting.create = originals.create;
    prisma.appSetting.findUnique = originals.findUnique;
    prisma.appSetting.findMany = originals.findMany;
    prisma.appSetting.updateMany = originals.updateMany;
    prisma.appSetting.deleteMany = originals.deleteMany;
  };
}

function installReservationGateOrderingMock() {
  const originals = {
    create: prisma.appSetting.create,
    findUnique: prisma.appSetting.findUnique,
    findMany: prisma.appSetting.findMany,
    updateMany: prisma.appSetting.updateMany,
    deleteMany: prisma.appSetting.deleteMany,
  };
  const rows = new Map();
  const events = [];
  prisma.appSetting.create = async ({ data }) => {
    if (rows.has(data.key)) {
      const error = new Error("Unique constraint failed");
      error.code = "P2002";
      throw error;
    }
    events.push(data.key.includes(".gate.") ? "gate-create" : "scope-create");
    const row = {
      key: data.key,
      value: data.value,
      createdAt: new Date("2026-04-25T08:00:00.000Z"),
      updatedAt: new Date("2026-04-25T08:00:00.000Z"),
    };
    rows.set(data.key, row);
    return row;
  };
  prisma.appSetting.findUnique = async ({ where }) => rows.get(where.key) ?? null;
  prisma.appSetting.findMany = async ({ where } = {}) => {
    const prefix = where?.key?.startsWith;
    const allRows = Array.from(rows.values());
    return prefix ? allRows.filter((row) => row.key.startsWith(prefix)) : allRows;
  };
  prisma.appSetting.updateMany = async ({ where, data }) => {
    const row = rows.get(where.key);
    if (!row || (where.value !== undefined && row.value !== where.value)) {
      return { count: 0 };
    }
    rows.set(where.key, {
      ...row,
      value: data.value,
      updatedAt: new Date("2026-04-25T08:01:00.000Z"),
    });
    return { count: 1 };
  };
  prisma.appSetting.deleteMany = async ({ where }) => {
    const row = rows.get(where.key);
    if (!row || (where.value !== undefined && row.value !== where.value)) {
      return { count: 0 };
    }
    events.push(where.key.includes(".gate.") ? "gate-release" : "scope-release");
    rows.delete(where.key);
    return { count: 1 };
  };
  return {
    events,
    restore: () => {
      prisma.appSetting.create = originals.create;
      prisma.appSetting.findUnique = originals.findUnique;
      prisma.appSetting.findMany = originals.findMany;
      prisma.appSetting.updateMany = originals.updateMany;
      prisma.appSetting.deleteMany = originals.deleteMany;
    },
  };
}

test("resolveHighMemoryDirectorStartDecision blocks duplicate high-memory work for the same novel and scope", () => {
  const decision = resolveHighMemoryDirectorStartDecision({
    novelId: "novel-1",
    stage: "structured_outline",
    itemKey: "chapter_list",
    scope: "volume:volume-1",
    activeTasks: [
      {
        id: "task-running",
        novelId: "novel-1",
        status: "running",
        currentStage: "节奏 / 拆章",
        currentItemKey: "chapter_list",
        resumeTarget: {
          stage: "structured",
          volumeId: "volume-1",
        },
      },
    ],
    currentTaskId: "task-new",
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "duplicate_active_high_memory_task");
  assert.equal(decision.conflictingTaskId, "task-running");
});

test("resolveHighMemoryDirectorStartDecision allows lower-memory or unrelated scopes", () => {
  const lowerMemory = resolveHighMemoryDirectorStartDecision({
    novelId: "novel-1",
    stage: "story_macro",
    itemKey: "book_contract",
    scope: "book",
    activeTasks: [{
      id: "task-running",
      novelId: "novel-1",
      status: "running",
      currentStage: "节奏 / 拆章",
      currentItemKey: "chapter_list",
      resumeTarget: { stage: "structured", volumeId: "volume-1" },
    }],
  });
  const differentScope = resolveHighMemoryDirectorStartDecision({
    novelId: "novel-1",
    stage: "structured_outline",
    itemKey: "chapter_list",
    scope: "volume:volume-2",
    activeTasks: [{
      id: "task-running",
      novelId: "novel-1",
      status: "running",
      currentStage: "节奏 / 拆章",
      currentItemKey: "chapter_list",
      resumeTarget: { stage: "structured", volumeId: "volume-1" },
    }],
  });

  assert.equal(lowerMemory.allowed, true);
  assert.equal(differentScope.allowed, true);
  assert.equal(isHighMemoryDirectorStage("structured_outline", "chapter_detail_bundle"), true);
  assert.equal(isHighMemoryDirectorStage("chapter_execution", "chapter_execution"), false);
});

test("resolveHighMemoryDirectorStartDecision treats full-book work as overlapping targeted ranges", () => {
  const bookAgainstVolume = resolveHighMemoryDirectorStartDecision({
    novelId: "novel-1",
    stage: "structured_outline",
    itemKey: "chapter_list",
    scope: "book",
    activeTasks: [{
      id: "task-volume",
      novelId: "novel-1",
      status: "running",
      currentItemKey: "chapter_list",
      resumeTarget: { stage: "structured", volumeId: "volume-2" },
    }],
    currentTaskId: "task-book",
  });
  const volumeAgainstBook = resolveHighMemoryDirectorStartDecision({
    novelId: "novel-1",
    stage: "structured_outline",
    itemKey: "chapter_list",
    scope: "volume:volume-2",
    activeTasks: [{
      id: "task-book",
      novelId: "novel-1",
      status: "running",
      currentItemKey: "chapter_list",
      resumeTarget: { stage: "structured" },
    }],
    currentTaskId: "task-volume",
  });

  assert.equal(bookAgainstVolume.allowed, false);
  assert.equal(bookAgainstVolume.conflictingTaskId, "task-volume");
  assert.equal(volumeAgainstBook.allowed, false);
  assert.equal(volumeAgainstBook.conflictingTaskId, "task-book");
});

test("resolveHighMemoryDirectorStartDecision limits batch fan-out of high-memory director tasks", () => {
  const decision = resolveHighMemoryDirectorStartDecision({
    stage: "structured_outline",
    itemKey: "chapter_list",
    scope: "volume:volume-1",
    activeTasks: [],
    batchAlreadyStartedCount: AUTO_DIRECTOR_HIGH_MEMORY_BATCH_LIMIT,
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "batch_high_memory_limit_reached");
});

test("resolveHighMemoryDirectorStartDecision does not apply batch limit to lower-memory stages", () => {
  const decision = resolveHighMemoryDirectorStartDecision({
    stage: "story_macro",
    itemKey: "book_contract",
    scope: "book",
    activeTasks: [],
    batchAlreadyStartedCount: AUTO_DIRECTOR_HIGH_MEMORY_BATCH_LIMIT,
  });

  assert.equal(decision.allowed, true);
});

test("isStaleAutoDirectorRunningTask marks old running structured-outline tasks as stale without touching fresh ones", () => {
  const now = new Date("2026-04-25T12:00:00.000Z");
  const stale = isStaleAutoDirectorRunningTask({
    status: "running",
    lane: "auto_director",
    currentItemKey: "chapter_list",
    heartbeatAt: new Date("2026-04-25T08:00:00.000Z"),
    updatedAt: new Date("2026-04-25T08:00:00.000Z"),
    pendingManualRecovery: false,
    cancelRequestedAt: null,
  }, now);
  const fresh = isStaleAutoDirectorRunningTask({
    status: "running",
    lane: "auto_director",
    currentItemKey: "chapter_list",
    heartbeatAt: new Date("2026-04-25T11:55:00.000Z"),
    updatedAt: new Date("2026-04-25T11:55:00.000Z"),
    pendingManualRecovery: false,
    cancelRequestedAt: null,
  }, now);

  assert.equal(stale, true);
  assert.equal(fresh, false);
});

test("resolveHighMemoryVolumeGenerationKey covers direct volume generation high-memory scopes", () => {
  assert.equal(isHighMemoryVolumeGeneration({ scope: "chapter_list" }), true);
  assert.equal(isHighMemoryVolumeGeneration({ scope: "strategy" }), false);
  assert.equal(
    resolveHighMemoryVolumeGenerationKey("novel-1", {
      scope: "volume",
      targetVolumeId: "volume-1",
    }),
    "novel-1:volume:volume-1",
  );
  assert.equal(
    resolveHighMemoryVolumeGenerationKey("novel-1", {
      scope: "chapter_detail",
      targetVolumeId: "volume-1",
      targetChapterId: "chapter-3",
    }),
    "novel-1:chapter:chapter-3",
  );
  assert.equal(resolveHighMemoryVolumeGenerationKey("novel-1", { scope: "strategy" }), null);
});

test("withHighMemoryVolumeGenerationGuard blocks a process-crossing duplicate reservation", async () => {
  const restore = installFuturePersistentLockMock();
  let runnerCalled = false;
  try {
    await assert.rejects(
      () => withHighMemoryVolumeGenerationGuard(
        "novel-1",
        {
          scope: "chapter_list",
          targetVolumeId: "volume-1",
          entrypoint: "direct_volume_route",
        },
        async () => {
          runnerCalled = true;
          return "unexpected";
        },
      ),
      (error) => error && error.statusCode === 409,
    );
    assert.equal(runnerCalled, false);
  } finally {
    restore();
  }
});

test("assertHighMemoryDirectorStartAllowed blocks a process-crossing duplicate start reservation", async () => {
  const restore = installFuturePersistentLockMock();
  try {
    await assert.rejects(
      () => assertHighMemoryDirectorStartAllowed(
        {
          listActiveTasksByNovelAndLane: async () => [],
        },
        {
          taskId: "task-new",
          novelId: "novel-1",
          stage: "structured_outline",
          itemKey: "chapter_list",
          scope: "volume:volume-1",
        },
      ),
      (error) => error && error.statusCode === 409,
    );
  } finally {
    restore();
  }
});

test("acquireScopedHighMemoryReservation blocks overlapping book and targeted scopes across entrypoints", async () => {
  const restore = installPersistentReservationStoreMock();
  try {
    const held = await acquireScopedHighMemoryReservation({
      namespace: "novel-high-memory",
      novelId: "novel-overlap",
      scope: "book",
      ownerId: "task-book",
      ttlMs: 60_000,
      metadata: {
        entrypoint: "auto_director",
      },
    });
    assert.equal(held.acquired, true);
    const duplicate = await acquireScopedHighMemoryReservation({
      namespace: "novel-high-memory",
      novelId: "novel-overlap",
      scope: "volume:volume-1",
      ownerId: "direct-volume",
      ttlMs: 60_000,
      metadata: {
        entrypoint: "direct_volume_route",
      },
    });
    assert.equal(duplicate.acquired, false);
    assert.equal(duplicate.ownerId, "task-book");
    await held.handle.release();
  } finally {
    restore();
  }
});

test("acquireScopedHighMemoryReservation keeps the novel gate until the scoped reservation is written", async () => {
  const { events, restore } = installReservationGateOrderingMock();
  try {
    const held = await acquireScopedHighMemoryReservation({
      namespace: "novel-high-memory",
      novelId: "novel-gate",
      scope: "book",
      ownerId: "task-book",
      ttlMs: 60_000,
      metadata: {
        entrypoint: "auto_director",
      },
    });
    assert.equal(held.acquired, true);
    assert.deepEqual(events.slice(0, 3), [
      "gate-create",
      "scope-create",
      "gate-release",
    ]);
    await held.handle.release();
  } finally {
    restore();
  }
});
