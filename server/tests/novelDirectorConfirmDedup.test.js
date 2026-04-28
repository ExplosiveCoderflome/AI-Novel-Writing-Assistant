const test = require("node:test");
const assert = require("node:assert/strict");
require("../dist/app.js");
const { NovelDirectorService } = require("../dist/services/novel/director/NovelDirectorService.js");
const { NovelDirectorConfirmRuntime } = require("../dist/services/novel/director/novelDirectorConfirmRuntime.js");

function buildDirectorInput(overrides = {}) {
  return {
    idea: "A beginner writer wants AI to turn a rough concept into a full novel project.",
    batchId: "batch_dedup_demo",
    round: 1,
    candidate: {
      id: "candidate_dedup_demo",
      workingTitle: "同名项目防重演示",
      logline: "A novice writer watches AI turn one idea into a complete guided project.",
      positioning: "Beginner-friendly AI novel production story",
      sellingPoint: "Low-cognitive-load guidance with a strong completion loop",
      coreConflict: "The writer needs one reliable path instead of conflicting project branches.",
      protagonistPath: "From hesitation to confident long-form completion",
      endingDirection: "The book finally lands because the workflow stops splitting",
      hookStrategy: "Each step removes one blocker and raises one clearer promise",
      progressionLoop: "Choose, confirm, execute, validate, continue",
      whyItFits: "It keeps the workflow concrete and easy for beginners to follow.",
      toneKeywords: ["guided", "clear", "completion"],
      targetChapterCount: 60,
    },
    workflowTaskId: "task_dedup_demo",
    runMode: "auto_to_ready",
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

function buildNovel(id = "novel_dedup_demo") {
  return {
    id,
    title: "同名项目防重演示",
    description: "A deduplicated director-confirm result.",
  };
}

function buildSeedPayloadJson(runMode = "auto_to_ready") {
  return JSON.stringify({
    directorSession: {
      runMode,
      isBackgroundRunning: true,
      lockedScopes: [],
      phase: "story_macro",
    },
  });
}

function buildResumeTargetJson(novelId, taskId) {
  return JSON.stringify({
    route: "/novels/:id/edit",
    novelId,
    taskId,
    stage: "story_macro",
  });
}

test("confirmCandidate reuses an already attached novel instead of creating a duplicate", async () => {
  const service = new NovelDirectorService();
  const originals = {
    bootstrapTask: service.workflowService.bootstrapTask,
    claimAutoDirectorNovelCreation: service.workflowService.claimAutoDirectorNovelCreation,
    getNovelById: service.novelContextService.getNovelById,
    createNovel: service.novelContextService.createNovel,
  };
  let createCalls = 0;
  let claimCalls = 0;
  const runtimeInitializations = [];

  service.workflowService.bootstrapTask = async () => ({
    id: "task_dedup_demo",
    novelId: "novel_existing_demo",
    seedPayloadJson: buildSeedPayloadJson(),
    resumeTargetJson: buildResumeTargetJson("novel_existing_demo", "task_dedup_demo"),
  });
  service.workflowService.claimAutoDirectorNovelCreation = async () => {
    claimCalls += 1;
    throw new Error("claimAutoDirectorNovelCreation should not run when the task already has a novel.");
  };
  service.novelContextService.getNovelById = async (id) => buildNovel(id);
  service.novelContextService.createNovel = async () => {
    createCalls += 1;
    throw new Error("createNovel should not run for an already attached workflow task.");
  };
  service.directorRuntime.initializeRun = async (input) => {
    runtimeInitializations.push(input);
    return null;
  };

  try {
    const result = await service.confirmCandidate(buildDirectorInput());
    assert.equal(result.novel.id, "novel_existing_demo");
    assert.equal(result.workflowTaskId, "task_dedup_demo");
    assert.equal(createCalls, 0);
    assert.equal(claimCalls, 0);
    assert.deepEqual(runtimeInitializations.map((item) => item.novelId), ["novel_existing_demo"]);
  } finally {
    service.workflowService.bootstrapTask = originals.bootstrapTask;
    service.workflowService.claimAutoDirectorNovelCreation = originals.claimAutoDirectorNovelCreation;
    service.novelContextService.getNovelById = originals.getNovelById;
    service.novelContextService.createNovel = originals.createNovel;
  }
});

test("confirmCandidate returns the in-flight novel instead of creating a second project", async () => {
  const service = new NovelDirectorService();
  const originals = {
    bootstrapTask: service.workflowService.bootstrapTask,
    claimAutoDirectorNovelCreation: service.workflowService.claimAutoDirectorNovelCreation,
    getTaskByIdWithoutHealing: service.workflowService.getTaskByIdWithoutHealing,
    getNovelById: service.novelContextService.getNovelById,
    createNovel: service.novelContextService.createNovel,
  };
  let createCalls = 0;
  let pollCalls = 0;
  const runtimeInitializations = [];

  service.workflowService.bootstrapTask = async () => ({
    id: "task_dedup_demo",
    novelId: null,
    seedPayloadJson: buildSeedPayloadJson(),
    resumeTargetJson: null,
  });
  service.workflowService.claimAutoDirectorNovelCreation = async () => ({
    status: "in_progress",
    task: {
      id: "task_dedup_demo",
      novelId: null,
      status: "running",
      lastError: null,
      seedPayloadJson: buildSeedPayloadJson(),
      resumeTargetJson: null,
    },
  });
  service.workflowService.getTaskByIdWithoutHealing = async () => {
    pollCalls += 1;
    return {
      id: "task_dedup_demo",
      novelId: "novel_existing_demo",
      status: "running",
      lastError: null,
      seedPayloadJson: buildSeedPayloadJson(),
      resumeTargetJson: buildResumeTargetJson("novel_existing_demo", "task_dedup_demo"),
    };
  };
  service.novelContextService.getNovelById = async (id) => buildNovel(id);
  service.novelContextService.createNovel = async () => {
    createCalls += 1;
    throw new Error("createNovel should not run while another confirmation is already creating the project.");
  };
  service.directorRuntime.initializeRun = async (input) => {
    runtimeInitializations.push(input);
    return null;
  };

  try {
    const result = await service.confirmCandidate(buildDirectorInput());
    assert.equal(result.novel.id, "novel_existing_demo");
    assert.equal(result.workflowTaskId, "task_dedup_demo");
    assert.equal(createCalls, 0);
    assert.equal(pollCalls, 1);
    assert.deepEqual(runtimeInitializations.map((item) => item.novelId), [null, "novel_existing_demo"]);
  } finally {
    service.workflowService.bootstrapTask = originals.bootstrapTask;
    service.workflowService.claimAutoDirectorNovelCreation = originals.claimAutoDirectorNovelCreation;
    service.workflowService.getTaskByIdWithoutHealing = originals.getTaskByIdWithoutHealing;
    service.novelContextService.getNovelById = originals.getNovelById;
    service.novelContextService.createNovel = originals.createNovel;
  }
});

test("confirm runtime creates the novel through the standard runtime node", async () => {
  const calls = [];
  const backgroundRuns = [];
  const input = buildDirectorInput({
    targetAudience: "新手作者",
    bookSellingPoint: "低门槛完成整本书",
    competingFeel: "稳定推进",
    first30ChapterPromise: "前 30 章持续兑现成长",
    commercialTags: ["AI 写作", "长篇完成"],
  });
  const runtime = new NovelDirectorConfirmRuntime({
    workflowService: {
      bootstrapTask: async ({ novelId }) => {
        calls.push(["bootstrapTask", novelId ?? null]);
        return {
          id: "task_dedup_demo",
          novelId: novelId ?? null,
          seedPayloadJson: buildSeedPayloadJson(),
          resumeTargetJson: novelId ? buildResumeTargetJson(novelId, "task_dedup_demo") : null,
        };
      },
      claimAutoDirectorNovelCreation: async () => {
        calls.push(["claim"]);
        return { status: "claimed" };
      },
      markTaskRunning: async (_taskId, state) => {
        calls.push(["markTaskRunning", state.stage, state.itemKey]);
      },
      attachNovelToTask: async (_taskId, novelId, stage) => {
        calls.push(["attachNovelToTask", novelId, stage]);
      },
      markTaskFailed: async (_taskId, message) => {
        calls.push(["markTaskFailed", message]);
      },
      getTaskByIdWithoutHealing: async () => null,
    },
    novelContextService: {
      createNovel: async (payload) => {
        calls.push(["createNovel", payload.title]);
        return buildNovel("novel_created_demo");
      },
      getNovelById: async (id) => buildNovel(id),
    },
    directorRuntime: {
      initializeRun: async ({ novelId, entrypoint }) => {
        calls.push(["initializeRun", novelId ?? null, entrypoint]);
      },
      analyzeWorkspace: async ({ novelId }) => {
        calls.push(["analyzeWorkspace", novelId]);
        return {
          inventory: { artifacts: [] },
        };
      },
    },
    runtimeOrchestrator: {
      runStepModule: async ({ module, runner, collectArtifacts }) => {
        calls.push(["runStepModule", module.nodeKey, module.reads.join(","), module.writes.join(",")]);
        const output = await runner();
        await collectArtifacts?.(output);
        return output;
      },
      markTaskRunning: async (_taskId, stage, itemKey) => {
        calls.push(["runtimeMarkTaskRunning", stage, itemKey]);
      },
    },
    pipelineRuntime: {
      runPipeline: async () => {
        calls.push(["runPipeline"]);
      },
    },
    buildDirectorSeedPayload: (_directorInput, novelId, extra) => ({
      novelId,
      ...extra,
    }),
    enrichDirectorStyleContext: async (value) => value,
    ensurePrimaryNovelStyleBinding: async (novelId) => {
      calls.push(["ensureStyleBinding", novelId]);
    },
    withWorkflowTaskUsage: async (_taskId, runner) => runner(),
    scheduleBackgroundRun: (_taskId, runner) => {
      backgroundRuns.push(runner);
    },
  });

  const result = await runtime.confirmCandidate(input);

  assert.equal(result.novel.id, "novel_created_demo");
  assert.equal(backgroundRuns.length, 1);
  assert.ok(calls.some((call) => (
    call[0] === "runStepModule"
    && call[1] === "novel_create"
    && call[2] === "candidate_batch,book_seed"
  )));
  assert.ok(calls.some((call) => (
    call[0] === "markTaskRunning"
    && call[1] === "auto_director"
    && call[2] === "novel_create"
  )));
  assert.ok(calls.some((call) => call[0] === "analyzeWorkspace" && call[1] === "novel_created_demo"));
  assert.ok(calls.some((call) => call[0] === "attachNovelToTask" && call[1] === "novel_created_demo"));
});
