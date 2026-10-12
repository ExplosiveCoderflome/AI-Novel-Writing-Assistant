const test = require("node:test");
const assert = require("node:assert/strict");

const Module = require("node:module");
const tasks = new Map();
const prisma = {
  novelWorkflowTask: { findUnique: async ({ where }) => tasks.get(where.id) ?? null },
  novel: { update: async ({ where, data }) => ({ id: where.id, ...data }) },
};
const foundation = {
  genreId: "genre-resolved", primaryStoryModeId: "mode-primary", secondaryStoryModeId: "mode-secondary",
  recommendation: { genre: { id: "genre-resolved" }, primaryStoryMode: { id: "mode-primary" }, secondaryStoryMode: { id: "mode-secondary" } },
};
const framing = {
  targetAudience: "beginner readers", bookSellingPoint: "a completed novel", competingFeel: "steady progress",
  first30ChapterPromise: "a clear growth arc", commercialTags: ["growth"],
};
const originalLoad = Module._load;
let NovelDirectorConfirmRuntime, syncAutoExecutionTaskState, buildDirectorWorkflowSeedPayload, readDirectorTaskState;
try {
  // Intercept persistence and external generation before importing any runtime.
  // Writer, Reader, framing resolver and request builder remain real.
  Module._load = function (request, parent, isMain) {
    if (/[\\/]db[\\/]prisma(?:\.js)?$/.test(request)) return { prisma };
    if (request.endsWith("NovelFramingSuggestionService")) return { novelFramingSuggestionService: { suggest: async () => framing } };
    if (request.endsWith("NovelCreateResourceRecommendationService")) return { novelCreateResourceRecommendationService: { resolveRequired: async () => foundation } };
    if (request.endsWith("modules/novel/writing-platform")) return { writingPlatformProfileService: { snapshot: async () => ({ profileVersion: 1 }) } };
    if (request.endsWith("directorWorkflowStepModules")) return { getDirectorConfirmNovelCreateStepModule: () => ({ id: "novel_create" }) };
    return originalLoad.call(this, request, parent, isMain);
  };
  ({ NovelDirectorConfirmRuntime } = require("../dist/services/novel/director/runtime/novelDirectorConfirmRuntime.js"));
  ({ syncAutoExecutionTaskState } = require("../dist/services/novel/director/automation/novelDirectorAutoExecutionCheckpointRuntime.js"));
  ({ buildDirectorWorkflowSeedPayload } = require("../dist/services/novel/director/runtime/novelDirectorHelpers.js"));
  ({ readDirectorTaskState } = require("../dist/services/novel/director/state/DirectorStateReader.js"));
} finally {
  Module._load = originalLoad;
}

function buildRequest(overrides = {}) {
  return {
    idea: "A beginner writer wants AI to turn a rough concept into a full novel project.",
    batchId: "batch-confirm-launch",
    round: 1,
    candidate: {
      id: "candidate-confirm-launch",
      workingTitle: "确认启动合同",
      logline: "AI guides a beginner from one idea to a complete novel.",
      positioning: "Beginner-friendly AI novel production story",
      sellingPoint: "A clear path from an idea to a finished book.",
      coreConflict: "The writer must keep moving through each production stage.",
      protagonistPath: "From uncertain beginner to confident author.",
      endingDirection: "The novel reaches a complete ending.",
      hookStrategy: "Each stage creates a clear next step.",
      progressionLoop: "Plan, draft, review, continue.",
      whyItFits: "It keeps the workflow concrete and easy to follow.",
      toneKeywords: ["guided", "clear"],
      targetChapterCount: 60,
    },
    workflowTaskId: "task-confirm-launch",
    runMode: "auto_to_execution",
    writingMode: "original",
    projectMode: "ai_led",
    narrativePov: "third_person",
    pacePreference: "balanced",
    emotionIntensity: "medium",
    aiFreedom: "medium",
    estimatedChapterCount: 60,
    ...overrides,
  };
}

function createWorkflow(request, novelId = null) {
  const task = {
    id: request.workflowTaskId, novelId, lane: "auto_director", status: "queued",
    currentItemKey: "candidate_confirm", pendingManualRecovery: false,
    seedPayloadJson: JSON.stringify(buildDirectorWorkflowSeedPayload(request, novelId)),
    resumeTargetJson: null,
  };
  tasks.set(task.id, task);
  const events = [];
  let launchAtAttach;
  return {
    task, events,
    get launchAtAttach() { return launchAtAttach; },
    async getTaskById(id) { return tasks.get(id) ?? null; },
    async getTaskByIdWithoutHealing(id) { return tasks.get(id) ?? null; },
    async bootstrapTask(input) {
      events.push(["bootstrap", task.novelId]);
      if (input.novelId !== undefined) task.novelId = input.novelId;
      task.title = input.title;
      task.seedPayloadJson = JSON.stringify(input.seedPayload);
      return task;
    },
    async updateTaskWithRetry({ where, data }) {
      assert.equal(where.id, task.id);
      Object.assign(task, data);
      events.push(["update", task.novelId]);
      return task;
    },
    async claimAutoDirectorNovelCreation() {
      events.push(["claim"]);
      if (task.novelId) return { status: "attached", task };
      if (task.currentItemKey === "novel_create") return { status: "in_progress", task };
      task.currentItemKey = "novel_create";
      return { status: "claimed", task };
    },
    async markTaskRunning() { task.status = "running"; },
    async attachNovelToTask(taskId, id) {
      assert.equal(taskId, task.id);
      launchAtAttach = structuredClone(readDirectorTaskState(task).launch);
      task.novelId = id;
      events.push(["attach", id]);
    },
    async markTaskFailed(_id, message) { task.status = "failed"; events.push(["failed", message]); },
  };
}

function createRuntime(workflow) {
  const scheduled = [];
  const pipelineRuns = [];
  let created = 0;
  const runtime = new NovelDirectorConfirmRuntime({
    workflowService: workflow,
    novelContextService: {
      async createNovel(input) { created += 1; workflow.events.push(["create", input.genreId]); return { id: "novel-confirmed", title: input.title }; },
      async getNovelById(id) { return { id, title: "确认启动合同" }; },
    },
    directorRuntime: { initializeRun: async () => undefined, analyzeWorkspace: async () => ({ inventory: { artifacts: [] } }) },
    runtimeOrchestrator: {
      async runStepModule(input) { return input.runner(); },
      async markRunning() { workflow.task.status = "running"; },
    },
    pipelineRuntime: { async runPipeline(input) { pipelineRuns.push(input); } },
    buildDirectorSeedPayload: buildDirectorWorkflowSeedPayload,
    enrichDirectorStyleContext: async (input) => ({ ...input, styleTone: "resolved style" }),
    ensurePrimaryNovelStyleBinding: async () => undefined,
    withWorkflowTaskUsage: async (_id, runner) => runner(),
    scheduleBackgroundRun: (_id, runner) => scheduled.push(runner),
  });
  return { runtime, scheduled, pipelineRuns, get created() { return created; } };
}

test("candidate confirmation freezes resolved framing and foundation before attachment and starts the full pipeline", async () => {
  const request = buildRequest({ writingPlatformPreference: "qidian" });
  const workflow = createWorkflow(request);
  const harness = createRuntime(workflow);
  const result = await harness.runtime.confirmCandidate(request);
  assert.equal(result.novel.id, "novel-confirmed");
  assert.equal(workflow.task.novelId, "novel-confirmed");
  assert.equal(workflow.task.status, "running");
  assert.equal(harness.created, 1);
  assert.equal(workflow.events.filter(([event]) => event === "claim").length, 1);
  assert.ok(workflow.events.findIndex(([event]) => event === "claim") < workflow.events.findIndex(([event]) => event === "create"));
  assert.equal(workflow.launchAtAttach.directorInput.genreId, "genre-resolved");
  assert.equal(workflow.launchAtAttach.directorInput.primaryStoryModeId, "mode-primary");
  assert.equal(workflow.launchAtAttach.directorInput.secondaryStoryModeId, "mode-secondary");
  assert.equal(workflow.launchAtAttach.directorInput.targetAudience, "beginner readers");
  assert.equal(workflow.launchAtAttach.directorInput.candidate.productionFoundation.genre.id, "genre-resolved");
  assert.equal(workflow.launchAtAttach.directorInput.styleTone, "resolved style");
  assert.equal(workflow.launchAtAttach.runMode, "full_book_autopilot");
  assert.deepEqual(readDirectorTaskState(workflow.task).launch, workflow.launchAtAttach);
  assert.equal(workflow.events.some(([event, id]) => event === "bootstrap" && id), false);
  assert.equal(JSON.parse(workflow.task.resumeTargetJson).novelId, "novel-confirmed");
  assert.equal(harness.scheduled.length, 1);
  await harness.scheduled[0]();
  assert.equal(harness.pipelineRuns[0].novelId, "novel-confirmed");
  assert.equal(harness.pipelineRuns[0].input.genreId, "genre-resolved");
  assert.equal(harness.pipelineRuns[0].startPhase, "story_macro");
  assert.equal(harness.pipelineRuns[0].approveAutoExecutionScope, true);
});

test("candidate confirmation keeps an adopted creative carryover contract in the frozen launch", async () => {
  const request = buildRequest({
    writingPlatformPreference: "qidian",
    referenceBookAnalysisId: "analysis-1",
  });
  const workflow = createWorkflow(request);
  const carryover = {
    schemaVersion: 1,
    mode: "adaptation",
    bookAnalysisId: "analysis-1",
    documentId: "document-1",
    documentVersionId: "version-1",
    documentVersionNumber: 1,
    usedSectionKeys: ["plot_structure"],
    generatedAt: "2026-09-29T00:00:00.000Z",
    adopted: true,
    sourceTraits: ["fast opening"],
    bookRealization: ["independent cast and setting"],
    openingChapters: [1, 2, 3].map((chapterNumber) => ({ chapterNumber, direction: `chapter ${chapterNumber}` })),
    basis: [{ sectionKey: "plot_structure", fieldKeys: ["reusablePatterns"], summary: "opening rhythm" }],
    continuationFocus: null,
    adaptationFocus: {
      hooks: ["opening question"],
      conflictLoops: ["pressure and response"],
      payoffRhythm: ["early payoff"],
      conversionPlan: "create new people and world",
    },
  };
  workflow.task.seedPayloadJson = JSON.stringify({
    ...JSON.parse(workflow.task.seedPayloadJson),
    creativeCarryoverContract: carryover,
  });
  const harness = createRuntime(workflow);

  const result = await harness.runtime.confirmCandidate(request);

  assert.equal(result.novel.id, "novel-confirmed");
  assert.deepEqual(workflow.launchAtAttach.creativeCarryoverContract, carryover);
  assert.deepEqual(readDirectorTaskState(workflow.task).launch.creativeCarryoverContract, carryover);
  assert.equal(harness.created, 1);
  assert.equal(harness.scheduled.length, 1);
});

test("repeat confirmation reuses the attached novel without rewriting its launch or scheduling another pipeline", async () => {
  const request = buildRequest({ writingPlatformPreference: "qidian" });
  const workflow = createWorkflow(request, "novel-existing");
  const frozen = structuredClone(readDirectorTaskState(workflow.task).launch);
  const harness = createRuntime(workflow);
  const result = await harness.runtime.confirmCandidate(request);
  assert.equal(result.novel.id, "novel-existing");
  assert.equal(harness.created, 0);
  assert.equal(harness.scheduled.length, 0);
  assert.equal(workflow.events.length, 0);
  assert.deepEqual(readDirectorTaskState(workflow.task).launch, frozen);
});

for (const mode of ["full_book_autopilot", "auto_to_execution"]) {
  test(`auto execution sync preserves auto_to_ready launch with effective ${mode}`, async () => {
    const request = buildRequest({ runMode: "auto_to_ready" });
    const workflow = createWorkflow(request, "novel-existing");
    const frozen = structuredClone(readDirectorTaskState(workflow.task).launch);
    const autoExecution = { enabled: true, nextChapterId: "chapter-2", nextChapterOrder: 2, remainingChapterCount: 4 };
    await syncAutoExecutionTaskState({
      workflowService: workflow, buildDirectorSeedPayload: buildDirectorWorkflowSeedPayload,
    }, {
      taskId: workflow.task.id, novelId: "novel-existing", request: { ...request, runMode: mode },
      range: { firstChapterId: "chapter-1", startOrder: 1, endOrder: 5, totalChapterCount: 5 },
      autoExecution, isBackgroundRunning: true,
    });
    const state = readDirectorTaskState(workflow.task);
    assert.deepEqual(state.launch, frozen);
    assert.deepEqual(state.run.autoExecution, autoExecution);
    assert.equal(state.run.directorSession.runMode, mode);
    assert.equal(state.run.directorSession.phase, "chapter_execution");
    assert.equal(JSON.parse(workflow.task.resumeTargetJson).novelId, "novel-existing");
    assert.equal(JSON.parse(workflow.task.resumeTargetJson).chapterId, "chapter-2");
    assert.equal(workflow.events.some(([event]) => event === "bootstrap"), false);
  });
}
