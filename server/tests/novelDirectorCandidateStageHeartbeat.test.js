const test = require("node:test");
const assert = require("node:assert/strict");

require("../dist/app.js");
const {
  NovelDirectorCandidateStageService,
} = require("../dist/services/novel/director/novelDirectorCandidateStage.js");
const promptRunner = require("../dist/prompting/core/promptRunner.js");
const titleHelpers = require("../dist/services/novel/director/novelDirectorHelpers.js");
const titleServiceModule = require("../dist/services/title/TitleGenerationService.js");

function buildGeneratedCandidate(overrides = {}) {
  return {
    workingTitle: "Rulebound Courier",
    logline: "A courier is dragged into a hidden network of rules.",
    positioning: "Urban rule-based growth thriller",
    sellingPoint: "Rule anomalies + grassroots climb",
    coreConflict: "To survive she must exploit the rules hunting her.",
    protagonistPath: "From courier to operator.",
    endingDirection: "Costly breakthrough.",
    hookStrategy: "Every delivery reveals a deeper rule.",
    progressionLoop: "Discover rule, pay cost, gain leverage.",
    whyItFits: "Fast serialized pressure.",
    toneKeywords: ["urban", "rules"],
    ...overrides,
  };
}

function buildWorkflowTask(taskId, overrides = {}) {
  return {
    id: taskId,
    status: "running",
    cancelRequestedAt: null,
    attemptCount: 0,
    ...overrides,
  };
}

function buildGenerateInput(overrides = {}) {
  return {
    idea: "A courier discovers a hidden rule-bound city underworld.",
    workflowTaskId: "task_candidate_progress",
    provider: "custom_coding_plan",
    model: "kimi-k2.5",
    temperature: 0.8,
    ...overrides,
  };
}

function buildTitleRefineInput(overrides = {}) {
  return {
    idea: "A courier discovers a hidden rule-bound city underworld.",
    workflowTaskId: "task_candidate_title_progress",
    provider: "custom_coding_plan",
    model: "kimi-k2.5",
    temperature: 0.8,
    feedback: "更都市，更高级感",
    batchId: "batch_1",
    candidateId: "candidate_1",
    previousBatches: [
      {
        id: "batch_1",
        round: 1,
        roundLabel: "第 1 轮",
        idea: "A courier discovers a hidden rule-bound city underworld.",
        refinementSummary: "初始方案",
        presets: [],
        createdAt: new Date("2026-04-16T12:00:00.000Z").toISOString(),
        candidates: [
          {
            id: "candidate_1",
            ...buildGeneratedCandidate(),
            titleOptions: [
              { title: "Rulebound Courier", clickRate: 60, style: "high_concept", angle: "当前方案书名", reason: "沿用当前方案书名。" },
            ],
          },
        ],
      },
    ],
    ...overrides,
  };
}

function createLongRunningPrompt() {
  let resolvePrompt;
  const pending = new Promise((resolve) => {
    resolvePrompt = () => resolve({
      output: {
        candidates: [buildGeneratedCandidate()],
      },
    });
  });
  return {
    pending,
    resolvePrompt,
  };
}

function createLongRunningTitles() {
  let resolveTitles;
  const pending = new Promise((resolve) => {
    resolveTitles = () => resolve({
      titles: [
        { title: "City Rule Courier", clickRate: 81, style: "urban", angle: "都市升级", reason: "更都市" },
      ],
    });
  });
  return {
    pending,
    resolveTitles,
  };
}

test("generateCandidates records staged progress before candidate selection checkpoint", async () => {
  const workflowCalls = [];
  const taskId = "task_candidate_progress";
  const promptRun = createLongRunningPrompt();
  const workflowService = {
    bootstrapTask: async () => buildWorkflowTask(taskId),
    markTaskRunning: async (runningTaskId, input) => {
      workflowCalls.push(["running", runningTaskId, input]);
      return buildWorkflowTask(runningTaskId);
    },
    recordCandidateSelectionRequired: async (checkpointTaskId, input) => {
      workflowCalls.push(["checkpoint", checkpointTaskId, input]);
      return buildWorkflowTask(checkpointTaskId, { status: "waiting_approval" });
    },
  };
  const service = new NovelDirectorCandidateStageService(workflowService);
  const originalRunStructuredPrompt = promptRunner.runStructuredPrompt;
  const originalEnhanceCandidateTitles = titleHelpers.enhanceCandidateTitles;

  promptRunner.runStructuredPrompt = async () => promptRun.pending;
  titleHelpers.enhanceCandidateTitles = async (candidate) => ({
    ...candidate,
    titleOptions: [],
  });

  try {
    const pending = service.generateCandidates(buildGenerateInput({ workflowTaskId: taskId }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const runningCallsBeforeResolve = workflowCalls.filter(([type]) => type === "running");
    assert.ok(runningCallsBeforeResolve.some(([, , input]) => input.itemKey === "candidate_seed_alignment"));
    assert.ok(runningCallsBeforeResolve.some(([, , input]) => input.itemKey === "candidate_project_framing"));
    assert.ok(runningCallsBeforeResolve.some(([, , input]) => input.itemKey === "candidate_direction_batch"));
    assert.equal(workflowCalls.some(([type]) => type === "checkpoint"), false);

    promptRun.resolvePrompt();
    await pending;

    const directionBatchCalls = workflowCalls.filter(([type, , input]) => type === "running" && input.itemKey === "candidate_direction_batch");
    const titlePackCalls = workflowCalls.filter(([type, , input]) => type === "running" && input.itemKey === "candidate_title_pack");
    const checkpointCalls = workflowCalls.filter(([type]) => type === "checkpoint");

    assert.equal(directionBatchCalls.length, 1);
    assert.equal(titlePackCalls.length, 1);
    assert.equal(checkpointCalls.length, 1);
    assert.match(checkpointCalls[0][2].summary, /已生成 1 套书级方向/);
  } finally {
    promptRunner.runStructuredPrompt = originalRunStructuredPrompt;
    titleHelpers.enhanceCandidateTitles = originalEnhanceCandidateTitles;
  }
});

test("refineCandidateTitleOptions records title-pack progress before checkpoint", async () => {
  const workflowCalls = [];
  const taskId = "task_candidate_title_progress";
  const titleRun = createLongRunningTitles();
  const workflowService = {
    bootstrapTask: async () => buildWorkflowTask(taskId),
    markTaskRunning: async (runningTaskId, input) => {
      workflowCalls.push(["running", runningTaskId, input]);
      return buildWorkflowTask(runningTaskId);
    },
    recordCandidateSelectionRequired: async (checkpointTaskId, input) => {
      workflowCalls.push(["checkpoint", checkpointTaskId, input]);
      return buildWorkflowTask(checkpointTaskId, { status: "waiting_approval" });
    },
  };
  const service = new NovelDirectorCandidateStageService(workflowService);
  const originalGenerateTitleIdeas = titleServiceModule.titleGenerationService.generateTitleIdeas;

  titleServiceModule.titleGenerationService.generateTitleIdeas = async () => titleRun.pending;

  try {
    const pending = service.refineCandidateTitleOptions(buildTitleRefineInput({ workflowTaskId: taskId }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const runningCallsBeforeResolve = workflowCalls.filter(([type]) => type === "running");
    assert.ok(runningCallsBeforeResolve.some(([, , input]) => input.itemKey === "candidate_title_pack"));
    assert.equal(workflowCalls.some(([type]) => type === "checkpoint"), false);

    titleRun.resolveTitles();
    await pending;

    const titlePackCalls = workflowCalls.filter(([type, , input]) => type === "running" && input.itemKey === "candidate_title_pack");
    const checkpointCalls = workflowCalls.filter(([type]) => type === "checkpoint");

    assert.equal(titlePackCalls.length, 1);
    assert.equal(checkpointCalls.length, 1);
    assert.match(checkpointCalls[0][2].summary, /已按你的意见重做/);
  } finally {
    titleServiceModule.titleGenerationService.generateTitleIdeas = originalGenerateTitleIdeas;
  }
});
