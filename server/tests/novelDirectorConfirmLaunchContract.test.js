const test = require("node:test");
const assert = require("node:assert/strict");

const { NovelDirectorConfirmRuntime } = require("../dist/services/novel/director/runtime/novelDirectorConfirmRuntime.js");
const { prisma } = require("../dist/db/prisma.js");

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

test("candidate confirmation replaces provisional launch data with the definitive full-book contract", async () => {
  const originalFindUnique = prisma.novelWorkflowTask.findUnique;
  const request = buildRequest();
  let task = {
    id: "task-confirm-launch",
    novelId: null,
    lane: "auto_director",
    status: "queued",
    currentItemKey: "candidate_confirm",
    seedPayloadJson: JSON.stringify({
      idea: request.idea,
      runMode: "auto_to_execution",
      directorInput: request,
      candidateStage: { mode: "generate" },
    }),
    resumeTargetJson: null,
  };
  let bootstrapInput = null;
  prisma.novelWorkflowTask.findUnique = async ({ where }) => (where.id === task.id ? task : null);
  const workflowService = {
    async getTaskByIdWithoutHealing(taskId) {
      return taskId === task.id ? task : null;
    },
    async getTaskById(taskId) {
      return taskId === task.id ? task : null;
    },
    async bootstrapTask(input) {
      bootstrapInput = input;
      task = { ...task, ...input, seedPayloadJson: JSON.stringify(input.seedPayload) };
      return task;
    },
    async claimAutoDirectorNovelCreation() {
      throw new Error("stop after launch contract initialization");
    },
    async markTaskFailed() {},
  };
  const runtime = new NovelDirectorConfirmRuntime({
    workflowService,
    novelContextService: {},
    directorRuntime: { initializeRun: async () => undefined },
    runtimeOrchestrator: {},
    pipelineRuntime: {},
    buildDirectorSeedPayload: (input, novelId, extra) => ({
      ...input,
      novelId,
      ...extra,
    }),
    enrichDirectorStyleContext: async (input) => input,
    ensurePrimaryNovelStyleBinding: async () => undefined,
    withWorkflowTaskUsage: async (_taskId, runner) => runner(),
    scheduleBackgroundRun: () => undefined,
  });

  try {
    await assert.rejects(
      runtime.confirmCandidate(request),
      /stop after launch contract initialization/,
    );
    assert.equal(bootstrapInput.seedPayload.runMode, "full_book_autopilot");
    assert.equal(bootstrapInput.seedPayload.idea, request.idea);
  } finally {
    prisma.novelWorkflowTask.findUnique = originalFindUnique;
  }
});
