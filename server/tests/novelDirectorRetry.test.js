const test = require("node:test");
const assert = require("node:assert/strict");
require("../dist/app.js");
const {
  applyDirectorLlmOverride,
  getDirectorLlmOptionsFromSeedPayload,
} = require("../dist/services/novel/director/novelDirectorHelpers.js");
const { NovelDirectorService } = require("../dist/services/novel/director/NovelDirectorService.js");

function buildDirectorInput(overrides = {}) {
  return {
    idea: "A courier discovers a hidden rule-bound city underworld.",
    batchId: "batch_1",
    round: 1,
    candidate: {
      id: "candidate_1",
      workingTitle: "Rulebound Courier",
      logline: "A courier is dragged into a hidden network of rules, debts and urban anomalies.",
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
    workflowTaskId: "task_retry_demo",
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

test("applyDirectorLlmOverride rewrites persisted auto director model selection", () => {
  const nextSeedPayload = applyDirectorLlmOverride({
    novelId: "novel_retry_demo",
    directorInput: buildDirectorInput(),
  }, {
    provider: "openai",
    model: "gpt-5-mini",
    temperature: 1,
  });

  assert.ok(nextSeedPayload);
  assert.equal(nextSeedPayload.directorInput.provider, "openai");
  assert.equal(nextSeedPayload.directorInput.model, "gpt-5-mini");
  assert.equal(nextSeedPayload.directorInput.temperature, 1);
  assert.equal(nextSeedPayload.directorInput.candidate.workingTitle, "Rulebound Courier");
});

test("applyDirectorLlmOverride also rewrites candidate-stage seed payload before directorInput exists", () => {
  const nextSeedPayload = applyDirectorLlmOverride({
    idea: "A courier discovers a hidden rule-bound city underworld.",
    provider: "custom_coding_plan",
    model: "kimi-k2.5",
    temperature: 0.8,
    candidateStage: {
      mode: "generate",
    },
  }, {
    provider: "glm",
    model: "glm-5",
    temperature: 0.6,
  });

  assert.ok(nextSeedPayload);
  assert.equal(nextSeedPayload.provider, "glm");
  assert.equal(nextSeedPayload.model, "glm-5");
  assert.equal(nextSeedPayload.temperature, 0.6);
  assert.deepEqual(getDirectorLlmOptionsFromSeedPayload(nextSeedPayload), {
    provider: "glm",
    model: "glm-5",
    temperature: 0.6,
  });
});

test("generateCandidates marks workflow task failed when candidate-stage generation throws", async () => {
  const service = new NovelDirectorService();
  const originalGenerate = service.candidateStageService.generateCandidates;
  const originalMarkTaskFailed = service.workflowService.markTaskFailed;
  const failures = [];

  service.candidateStageService.generateCandidates = async () => {
    throw new Error("结构化输出解析失败");
  };
  service.workflowService.markTaskFailed = async (taskId, message) => {
    failures.push([taskId, message]);
    return null;
  };

  try {
    await assert.rejects(
      service.generateCandidates({
        idea: "A courier discovers a hidden rule-bound city underworld.",
        workflowTaskId: "task_candidate_failed",
      }),
      /结构化输出解析失败/,
    );
    assert.deepEqual(failures, [
      ["task_candidate_failed", "结构化输出解析失败"],
    ]);
  } finally {
    service.candidateStageService.generateCandidates = originalGenerate;
    service.workflowService.markTaskFailed = originalMarkTaskFailed;
  }
});

test("continueTask resumes queued candidate-stage tasks before novel creation", async () => {
  const service = new NovelDirectorService();
  const originalGetTaskById = service.workflowService.getTaskById;
  const originalScheduleBackgroundRun = service.scheduleBackgroundRun;
  const originalGenerate = service.candidateStageService.generateCandidates;
  const resumed = [];

  service.workflowService.getTaskById = async () => ({
    id: "task_candidate_resume",
    lane: "auto_director",
    status: "queued",
    novelId: null,
    checkpointType: null,
    currentItemKey: "candidate_direction_batch",
    seedPayloadJson: JSON.stringify({
      idea: "A courier discovers a hidden rule-bound city underworld.",
      provider: "custom_coding_plan",
      model: "kimi-k2.5",
      temperature: 0.8,
      runMode: "auto_to_ready",
      candidateStage: {
        mode: "generate",
      },
    }),
  });
  service.scheduleBackgroundRun = (taskId, runner) => {
    void runner();
  };
  service.candidateStageService.generateCandidates = async (input) => {
    resumed.push(input);
    return { batch: { id: "batch_resume" } };
  };

  try {
    await service.continueTask("task_candidate_resume");
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(resumed.length, 1);
    assert.equal(resumed[0].workflowTaskId, "task_candidate_resume");
    assert.equal(resumed[0].provider, "custom_coding_plan");
    assert.equal(resumed[0].model, "kimi-k2.5");
    assert.equal(resumed[0].temperature, 0.8);
  } finally {
    service.workflowService.getTaskById = originalGetTaskById;
    service.scheduleBackgroundRun = originalScheduleBackgroundRun;
    service.candidateStageService.generateCandidates = originalGenerate;
  }
});
