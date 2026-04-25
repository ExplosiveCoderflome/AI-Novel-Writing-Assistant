const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveHighMemoryDirectorStartDecision,
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
