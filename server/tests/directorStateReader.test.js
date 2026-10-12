const test = require("node:test");
const assert = require("node:assert/strict");

const { prisma } = require("../dist/db/prisma");
const {
  DirectorStateReader,
  readDirectorTaskState,
  readDirectorReplacementTaskId,
  toDirectorTaskDataView,
} = require("../dist/services/novel/director/state/DirectorStateReader.js");

test("replacement task reader accepts legacy and takeover state, preferring current takeover", () => {
  assert.equal(readDirectorReplacementTaskId(JSON.stringify({ replacementTaskId: "legacy" })), "legacy");
  assert.equal(readDirectorReplacementTaskId(JSON.stringify({ takeover: { replacementTaskId: "new" } })), "new");
  assert.equal(readDirectorReplacementTaskId(JSON.stringify({ replacementTaskId: "legacy", takeover: { replacementTaskId: "new" } })), "new");
  assert.equal(readDirectorReplacementTaskId("{invalid"), null);
});

test("readDirectorTaskState separates immutable launch from mutable run state", () => {
  const directorInput = { runMode: "full_book_autopilot", candidate: { workingTitle: "测试书" } };
  const directorSession = { phase: "chapter_execution" };
  const autoExecution = { nextChapterId: "chapter-next", completedChapterCount: 4 };
  const taskNotice = { code: "notice", summary: "检查提醒" };
  const stepReview = { stepId: "step-1", nodeKey: "world_setup", label: "世界观", targetType: "novel", completedAt: "2026-09-28T00:00:00.000Z" };
  const candidateStage = { mode: "refine", feedback: "再清晰一些" };
  const batches = [{ id: "batch-1", round: 2 }];
  const candidate = { workingTitle: "测试书" };
  const stepCalibration = { action: "regenerate", stepId: "story_macro", instruction: "强化动机" };
  const resumeTarget = { route: "/novels/:id/edit", novelId: "novel-1", chapterId: "column-chapter" };
  const parsed = readDirectorTaskState({
    seedPayloadJson: JSON.stringify({
      directorInput,
      runMode: "full_book_autopilot",
      autoExecutionPlan: { chapterBatchSize: 2 },
      autoApproval: { enabled: true },
      issueGovernanceVersion: 1,
      issuePolicy: { quality: "completion_first" },
      issuePolicySource: "novel",
      completionProfile: { targetChapterCount: 80 },
      startupPreparation: { selected: ["characters"] },
      provider: "openai",
      model: "gpt-test",
      temperature: 0.2,
      creativeCarryoverContract: { enabled: true },
      directorSession,
      autoExecution,
      taskNotice,
      stepReview,
      candidateStage,
      batches,
      candidate,
      productionExperience: "simple",
      stepCalibration,
      resumeTarget: { chapterId: "legacy-chapter" },
    }),
    resumeTargetJson: JSON.stringify(resumeTarget),
  });

  assert.deepEqual(parsed.launch.directorInput, directorInput);
  assert.equal(parsed.launch.runMode, "full_book_autopilot");
  assert.equal(parsed.launch.model, "gpt-test");
  assert.deepEqual(parsed.run.directorSession, directorSession);
  assert.deepEqual(parsed.run.autoExecution, autoExecution);
  assert.deepEqual(parsed.run.taskNotice, taskNotice);
  assert.deepEqual(parsed.run.stepReview, stepReview);
  assert.deepEqual(parsed.run.candidateStage, candidateStage);
  assert.deepEqual(parsed.run.batches, batches);
  assert.deepEqual(parsed.run.candidate, candidate);
  assert.equal(parsed.run.productionExperience, "simple");
  assert.deepEqual(parsed.run.stepCalibration, stepCalibration);
  assert.deepEqual(parsed.run.resumeTarget, resumeTarget);
});

test("toDirectorTaskDataView reads legacy fields from the canonical launch and run partitions", () => {
  const launch = { runMode: "full_book_autopilot", legacyContext: { idea: "只读创意" } };
  const run = { autoExecution: { nextChapterId: "chapter-5" }, directorRuntime: { status: "legacy" } };
  assert.deepEqual(toDirectorTaskDataView({ launch, run }), {
    runMode: "full_book_autopilot",
    idea: "只读创意",
    autoExecution: { nextChapterId: "chapter-5" },
    directorRuntime: { status: "legacy" },
  });
});

test("production experience overlays launch defaults in the effective task data view without changing stored launch", () => {
  const state = {
    launch: {
      runMode: "auto_to_ready",
      directorInput: { idea: "创意", runMode: "auto_to_ready", provider: "openai" },
      autoExecutionPlan: { chapterBatchSize: 1 },
      autoApproval: { enabled: false },
      legacyContext: {},
    },
    run: {
      productionExperience: "simple",
      stepCalibration: { action: "regenerate", stepId: "story_macro", instruction: "强化动机" },
      llmOverride: { provider: "deepseek", model: "deepseek-chat", temperature: 0.6 },
    },
  };
  const effective = toDirectorTaskDataView(state);
  assert.equal(effective.runMode, "full_book_autopilot");
  assert.equal(effective.directorInput.runMode, "full_book_autopilot");
  assert.deepEqual(effective.autoExecutionPlan, require("@ai-novel/shared/types/novelDirector").buildFullBookAutopilotExecutionPlan());
  assert.equal(effective.directorInput.stepCalibrationInstruction, "强化动机");
  assert.equal(effective.directorInput.provider, "deepseek");
  assert.equal(effective.directorInput.model, "deepseek-chat");
  assert.equal(effective.directorInput.temperature, 0.6);
  assert.equal(effective.provider, "deepseek");
  assert.equal(effective.model, "deepseek-chat");
  assert.equal(effective.temperature, 0.6);
  assert.equal(state.launch.runMode, "auto_to_ready");
  assert.equal(state.launch.directorInput.provider, "openai");
});

test("DirectorStateReader suppresses stale active step while task is waiting at checkpoint", async () => {
  const originals = {
    taskFindUnique: prisma.novelWorkflowTask.findUnique,
    runFindUnique: prisma.directorRun.findUnique,
    commandFindFirst: prisma.directorRunCommand.findFirst,
    stepFindFirst: prisma.directorStepRun.findFirst,
  };
  prisma.novelWorkflowTask.findUnique = async () => ({
    id: "task-1",
    novelId: "novel-1",
    lane: "auto_director",
    status: "waiting_approval",
    currentStage: "质量修复",
    currentItemKey: "quality_repair",
    currentItemLabel: "等待处理重规划建议",
    progress: 0.98,
    checkpointType: "replan_required",
    checkpointSummary: "第 3 章需要重规划。",
    lastError: null,
    pendingManualRecovery: false,
    cancelRequestedAt: null,
    seedPayloadJson: null,
  });
  prisma.directorRun.findUnique = async () => ({
    id: "run-1",
    novelId: "novel-1",
    entrypoint: "resume_from_checkpoint",
  });
  prisma.directorRunCommand.findFirst = async () => ({
    id: "command-1",
    commandType: "continue",
    status: "succeeded",
  });
  prisma.directorStepRun.findFirst = async () => ({
    idempotencyKey: "task-1:chapter_execution_node",
    nodeKey: "chapter_execution_node",
    label: "章节执行",
    status: "running",
  });

  try {
    const reader = new DirectorStateReader({
      inspectNovel: async () => null,
    });
    const state = await reader.readByTaskId("task-1");

    assert.equal(state.activeStep, null);
    assert.equal(state.runtime.currentStep, "quality_repair");
    assert.equal(state.runtime.status, "waiting_approval");
  } finally {
    prisma.novelWorkflowTask.findUnique = originals.taskFindUnique;
    prisma.directorRun.findUnique = originals.runFindUnique;
    prisma.directorRunCommand.findFirst = originals.commandFindFirst;
    prisma.directorStepRun.findFirst = originals.stepFindFirst;
  }
});
