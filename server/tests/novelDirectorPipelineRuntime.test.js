const test = require("node:test");
const assert = require("node:assert/strict");

const {
  NovelDirectorPipelineRuntime,
} = require("../dist/services/novel/director/novelDirectorPipelineRuntime.js");

function buildDirectorInput(overrides = {}) {
  return {
    idea: "A courier discovers a hidden rule-bound city underworld.",
    batchId: "batch_1",
    round: 1,
    candidate: {
      id: "candidate_1",
      workingTitle: "Rulebound Courier",
      logline: "A courier is dragged into a hidden network of rules.",
      positioning: "Urban rule-based growth thriller",
      sellingPoint: "Rule anomalies + grassroots climb",
      coreConflict: "To survive she must exploit the same rules that are hunting her.",
      protagonistPath: "From self-preserving courier to rule-breaking operator.",
      endingDirection: "Costly breakthrough with room for escalation.",
      hookStrategy: "Every delivery exposes one deeper rule and one stronger predator.",
      progressionLoop: "Discover rule, pay cost, gain leverage, strike back.",
      whyItFits: "Strong serialized pressure and fast beginner-friendly drive.",
      toneKeywords: ["urban", "rules", "growth"],
      targetChapterCount: 30,
    },
    workflowTaskId: "task_pipeline_demo",
    provider: "deepseek",
    model: "deepseek-chat",
    temperature: 0.7,
    runMode: "auto_to_ready",
    writingMode: "original",
    projectMode: "ai_led",
    narrativePov: "third_person",
    pacePreference: "balanced",
    emotionIntensity: "medium",
    aiFreedom: "medium",
    estimatedChapterCount: 30,
    ...overrides,
  };
}

function createRuntime(overrides = {}) {
  const deps = {
    workflowService: {},
    novelContextService: {
      async listCharacters() {
        return [];
      },
    },
    characterDynamicsService: {},
    characterPreparationService: {
      async listCharacterCastOptions() {
        return [];
      },
    },
    storyMacroService: {
      async getPlan() {
        return null;
      },
    },
    bookContractService: {
      async getByNovelId() {
        return null;
      },
    },
    volumeService: {
      async getVolumes() {
        return { volumes: [], strategyPlan: null };
      },
    },
    runtimeOrchestrator: {
      async runStepModule({ module }) {
        return module.id === "character.cast.prepare" ? false : null;
      },
      async runChapterExecutionNode() {},
      async markTaskRunning() {},
    },
    buildDirectorSeedPayload() {
      return {};
    },
    async assertHighMemoryStartAllowed() {},
    ...overrides,
  };
  return new NovelDirectorPipelineRuntime(deps);
}

test("pipeline resumes structured outline from persisted volume workspace when volume step is already completed", async () => {
  const modules = [];
  const highMemoryChecks = [];
  let getVolumeCalls = 0;
  const persistedWorkspace = {
    volumes: [
      {
        id: "volume_1",
        chapters: [],
      },
    ],
    strategyPlan: {
      targetChapterCount: 30,
    },
  };
  const runtime = createRuntime({
    volumeService: {
      async getVolumes() {
        getVolumeCalls += 1;
        if (getVolumeCalls === 1) {
          return { volumes: [], strategyPlan: null };
        }
        return persistedWorkspace;
      },
    },
    runtimeOrchestrator: {
      async runStepModule({ module }) {
        modules.push(module.id);
        if (module.id === "volume.strategy.plan") {
          return undefined;
        }
        return null;
      },
      async runChapterExecutionNode() {},
      async markTaskRunning() {},
    },
    async assertHighMemoryStartAllowed(input) {
      highMemoryChecks.push(input);
    },
  });

  await runtime.runPipeline({
    taskId: "task_pipeline_resume",
    novelId: "novel_pipeline_resume",
    input: buildDirectorInput({ workflowTaskId: "task_pipeline_resume" }),
    startPhase: "volume_strategy",
  });

  assert.deepEqual(modules, [
    "volume.strategy.plan",
    "volume.beat_sheet.generate",
    "volume.chapter_list.generate",
    "volume.chapter_detail_bundle.generate",
    "chapter.execution_contract.sync",
  ]);
  assert.equal(highMemoryChecks.length, 1);
  assert.equal(highMemoryChecks[0].volumeId, "volume_1");
});

test("auto-to-execution volume strategy approval is passed into the runtime gate", async () => {
  const calls = [];
  const runtime = createRuntime({
    runtimeOrchestrator: {
      async runStepModule(input) {
        calls.push({
          moduleId: input.module.id,
          approveCurrentGate: input.approveCurrentGate,
          approveAutoExecutionScope: input.approveAutoExecutionScope,
        });
        return null;
      },
      async runChapterExecutionNode() {},
      async markTaskRunning() {},
    },
  });

  await runtime.runPipeline({
    taskId: "task_auto_to_execution_volume_gate",
    novelId: "novel_auto_to_execution_volume_gate",
    input: buildDirectorInput({
      workflowTaskId: "task_auto_to_execution_volume_gate",
      runMode: "auto_to_execution",
      autoApproval: {
        enabled: true,
        approvalPointCodes: ["volume_strategy_ready"],
      },
    }),
    startPhase: "volume_strategy",
  });

  assert.deepEqual(calls, [{
    moduleId: "volume.strategy.plan",
    approveCurrentGate: true,
    approveAutoExecutionScope: true,
  }]);
});

test("auto-to-execution structured outline approval is passed into each structured runtime gate", async () => {
  const calls = [];
  const workspace = {
    volumes: [{ id: "volume_1", chapters: [] }],
    strategyPlan: { targetChapterCount: 30 },
  };
  const runtime = createRuntime({
    runtimeOrchestrator: {
      async runStepModule(input) {
        calls.push({
          moduleId: input.module.id,
          approveCurrentGate: input.approveCurrentGate,
          approveAutoExecutionScope: input.approveAutoExecutionScope,
        });
        return undefined;
      },
      async runChapterExecutionNode() {},
      async markTaskRunning() {},
    },
  });

  await runtime.runStructuredOutlineNode({
    taskId: "task_auto_to_execution_outline_gate",
    novelId: "novel_auto_to_execution_outline_gate",
    input: buildDirectorInput({
      workflowTaskId: "task_auto_to_execution_outline_gate",
      runMode: "auto_to_execution",
      autoApproval: {
        enabled: true,
        approvalPointCodes: ["structured_outline_ready"],
      },
    }),
    startPhase: "structured_outline",
  }, workspace);

  assert.deepEqual(calls, [
    {
      moduleId: "volume.beat_sheet.generate",
      approveCurrentGate: true,
      approveAutoExecutionScope: true,
    },
    {
      moduleId: "volume.chapter_list.generate",
      approveCurrentGate: true,
      approveAutoExecutionScope: true,
    },
    {
      moduleId: "volume.chapter_detail_bundle.generate",
      approveCurrentGate: true,
      approveAutoExecutionScope: true,
    },
  ]);
});

test("auto-to-execution does not pass planning gates without matching approval", async () => {
  const calls = [];
  const runtime = createRuntime({
    runtimeOrchestrator: {
      async runStepModule(input) {
        calls.push({
          moduleId: input.module.id,
          approveCurrentGate: input.approveCurrentGate,
          approveAutoExecutionScope: input.approveAutoExecutionScope,
        });
        return null;
      },
      async runChapterExecutionNode() {},
      async markTaskRunning() {},
    },
  });

  await runtime.runPipeline({
    taskId: "task_auto_to_execution_unapproved_volume_gate",
    novelId: "novel_auto_to_execution_unapproved_volume_gate",
    input: buildDirectorInput({
      workflowTaskId: "task_auto_to_execution_unapproved_volume_gate",
      runMode: "auto_to_execution",
      autoApproval: {
        enabled: true,
        approvalPointCodes: ["structured_outline_ready"],
      },
    }),
    startPhase: "volume_strategy",
  });

  assert.deepEqual(calls, [{
    moduleId: "volume.strategy.plan",
    approveCurrentGate: false,
    approveAutoExecutionScope: false,
  }]);
});

test("pipeline pauses after volume strategy checkpoint instead of falling through to structured outline", async () => {
  const modules = [];
  let getVolumeCalls = 0;
  const runtime = createRuntime({
    volumeService: {
      async getVolumes() {
        getVolumeCalls += 1;
        if (getVolumeCalls === 1) {
          return { volumes: [], strategyPlan: null };
        }
        return {
          volumes: [{ id: "volume_1", chapters: [] }],
          strategyPlan: { targetChapterCount: 30 },
        };
      },
    },
    runtimeOrchestrator: {
      async runStepModule({ module }) {
        modules.push(module.id);
        if (module.id === "volume.strategy.plan") {
          return null;
        }
        throw new Error(`unexpected module after volume checkpoint: ${module.id}`);
      },
      async runChapterExecutionNode() {},
      async markTaskRunning() {},
    },
  });

  await runtime.runPipeline({
    taskId: "task_pipeline_volume_checkpoint",
    novelId: "novel_pipeline_volume_checkpoint",
    input: buildDirectorInput({
      workflowTaskId: "task_pipeline_volume_checkpoint",
      runMode: "stage_review",
    }),
    startPhase: "volume_strategy",
  });

  assert.deepEqual(modules, ["volume.strategy.plan"]);
  assert.equal(getVolumeCalls, 1);
});

test("pipeline resumes book contract when story macro exists without contract", async () => {
  const modules = [];
  const runtime = createRuntime({
    storyMacroService: {
      async getPlan() {
        return {
          id: "story_macro_existing",
          storyInput: "story",
          decomposition: { core_conflict: "conflict" },
        };
      },
    },
    runtimeOrchestrator: {
      async runStepModule({ module }) {
        modules.push(module.id);
        if (module.id === "character.cast.prepare") {
          return false;
        }
        return null;
      },
      async runChapterExecutionNode() {},
      async markTaskRunning() {},
    },
  });

  await runtime.runPipeline({
    taskId: "task_pipeline_story_skip",
    novelId: "novel_pipeline_story_skip",
    input: buildDirectorInput({ workflowTaskId: "task_pipeline_story_skip" }),
    startPhase: "story_macro",
  });

  assert.deepEqual(modules, ["book.contract.create", "character.cast.prepare", "volume.strategy.plan"]);
});

test("pipeline does not rerun book planning nodes when story macro and contract already exist", async () => {
  const modules = [];
  const runtime = createRuntime({
    storyMacroService: {
      async getPlan() {
        return {
          id: "story_macro_existing",
          storyInput: "story",
          decomposition: { core_conflict: "conflict" },
        };
      },
    },
    bookContractService: {
      async getByNovelId() {
        return { id: "book_contract_existing" };
      },
    },
    runtimeOrchestrator: {
      async runStepModule({ module }) {
        modules.push(module.id);
        if (module.id === "character.cast.prepare") {
          return false;
        }
        return null;
      },
      async runChapterExecutionNode() {},
      async markTaskRunning() {},
    },
  });

  await runtime.runPipeline({
    taskId: "task_pipeline_book_skip",
    novelId: "novel_pipeline_book_skip",
    input: buildDirectorInput({ workflowTaskId: "task_pipeline_book_skip" }),
    startPhase: "story_macro",
  });

  assert.deepEqual(modules, ["character.cast.prepare", "volume.strategy.plan"]);
});

test("pipeline treats empty story macro shell as incomplete during recovery", async () => {
  const modules = [];
  const runtime = createRuntime({
    storyMacroService: {
      async getPlan() {
        return { id: "story_macro_shell", storyInput: "", decomposition: null };
      },
    },
    bookContractService: {
      async getByNovelId() {
        return { id: "book_contract_existing" };
      },
    },
    novelContextService: {
      async listCharacters() {
        return [{ id: "character_1", name: "Courier" }];
      },
    },
    volumeService: {
      async getVolumes() {
        return {
          volumes: [{ id: "volume_1", chapters: [] }],
          strategyPlan: { targetChapterCount: 30 },
        };
      },
    },
    runtimeOrchestrator: {
      async runStepModule({ module }) {
        modules.push(module.id);
        return null;
      },
      async runChapterExecutionNode() {},
      async markTaskRunning() {},
    },
  });

  await runtime.runPipeline({
    taskId: "task_pipeline_story_shell",
    novelId: "novel_pipeline_story_shell",
    input: buildDirectorInput({ workflowTaskId: "task_pipeline_story_shell" }),
    startPhase: "structured_outline",
  });

  assert.equal(modules[0], "story.macro.plan");
});
