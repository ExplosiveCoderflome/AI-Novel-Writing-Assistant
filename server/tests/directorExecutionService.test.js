const test = require("node:test");
const assert = require("node:assert/strict");

const { prisma } = require("../dist/db/prisma.js");
const { DirectorExecutionService } = require("../dist/services/novel/director/DirectorExecutionService.js");
const { DirectorPipelineEngine } = require("../dist/services/novel/director/DirectorPipelineEngine.js");
const { DirectorStateReader } = require("../dist/services/novel/director/DirectorStateReader.js");
const { NovelDirectorService } = require("../dist/services/novel/director/NovelDirectorService.js");
const { NovelWorkflowService } = require("../dist/services/novel/workflow/NovelWorkflowService.js");

function recoveryCommand(commandType = "resume_from_checkpoint") {
  return {
    id: `command-${commandType}`,
    taskId: "task-1",
    novelId: "novel-1",
    commandType,
    status: "running",
    payloadJson: "{\"forceResume\":true}",
  };
}

function confirmCommand() {
  return {
    id: "command-confirm",
    taskId: "task-1",
    novelId: null,
    commandType: "confirm_candidate",
    status: "running",
    payloadJson: JSON.stringify({
      confirmRequest: {
        workflowTaskId: "old-task",
        runMode: "auto_to_execution",
        idea: "A college girl enters a hidden power network.",
        candidate: {
          id: "candidate-1",
          workingTitle: "Neon Archive",
          logline: "A student follows her missing father into a secret organization.",
          positioning: "Urban supernatural growth thriller.",
          sellingPoint: "A beginner-friendly direction for a full novel.",
          coreConflict: "Truth-seeking versus organizational pressure.",
          protagonistPath: "Cautious student to active operator.",
          endingDirection: "Hopeful breakthrough with cost.",
          hookStrategy: "Reveal one conspiracy layer at a time.",
          progressionLoop: "Clue, pressure, cost, leverage.",
          whyItFits: "Clear enough for automatic planning.",
          toneKeywords: ["urban"],
          targetChapterCount: 30,
        },
      },
    }),
  };
}

function mockPipelineState(t, overrides = {}) {
  const original = DirectorStateReader.prototype.readByTaskId;
  DirectorStateReader.prototype.readByTaskId = async (taskId) => ({
    task: {
      id: taskId,
      novelId: "novel-1",
      status: "running",
      ...overrides.task,
    },
    run: overrides.run ?? null,
    runtime: overrides.runtime ?? null,
    latestCommand: overrides.latestCommand ?? null,
    activeStep: overrides.activeStep ?? null,
    seedPayload: overrides.seedPayload ?? {},
    chapterProgress: overrides.chapterProgress ?? null,
  });
  t.after(() => {
    DirectorStateReader.prototype.readByTaskId = original;
  });
}

test("director execution delegates worker commands through the pipeline engine", async (t) => {
  const calls = [];
  const original = DirectorPipelineEngine.prototype.dispatch;
  DirectorPipelineEngine.prototype.dispatch = async function dispatchMock(input) {
    calls.push(input);
    return "completed";
  };
  t.after(() => {
    DirectorPipelineEngine.prototype.dispatch = original;
  });

  const service = new DirectorExecutionService();
  const outcome = await service.executeCommand(recoveryCommand("continue"));

  assert.equal(outcome, "completed");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command.commandType, "continue");
  assert.deepEqual(calls[0].payload, { forceResume: true });
});

test("director execution confirms candidates through the worker command path", async (t) => {
  mockPipelineState(t);
  const calls = [];
  const originalConfirm = NovelDirectorService.prototype.confirmCandidate;
  NovelDirectorService.prototype.confirmCandidate = async function confirmCandidateMock(input) {
    calls.push(input);
  };

  try {
    const service = new DirectorExecutionService();
    await service.executeCommand(confirmCommand());

    assert.equal(calls.length, 1);
    assert.equal(calls[0].workflowTaskId, "task-1");
    assert.equal(calls[0].runMode, "auto_to_execution");
    assert.equal(calls[0].candidate.workingTitle, "Neon Archive");
  } finally {
    NovelDirectorService.prototype.confirmCandidate = originalConfirm;
  }
});

test("director execution replays takeover request when recovery task lacks director input", async (t) => {
  mockPipelineState(t);
  const calls = [];
  const takeoverRequest = {
    novelId: "novel-1",
    entryStep: "structured",
    strategy: "continue_existing",
    runMode: "auto_to_execution",
  };
  const originals = {
    startTakeover: NovelDirectorService.prototype.startTakeover,
    executeContinueTask: NovelDirectorService.prototype.executeContinueTask,
    getTaskByIdWithoutHealing: NovelWorkflowService.prototype.getTaskByIdWithoutHealing,
    commandFindFirst: prisma.directorRunCommand.findFirst,
  };

  NovelWorkflowService.prototype.getTaskByIdWithoutHealing = async () => ({
    id: "task-1",
    lane: "auto_director",
    seedPayloadJson: JSON.stringify({
      takeover: {
        entryStep: "structured",
      },
    }),
  });
  prisma.directorRunCommand.findFirst = async () => ({
    id: "command-takeover",
    taskId: "task-1",
    commandType: "takeover",
    payloadJson: JSON.stringify({ takeoverRequest }),
  });
  NovelDirectorService.prototype.startTakeover = async (request, options) => {
    calls.push(["takeover", request, options]);
  };
  NovelDirectorService.prototype.executeContinueTask = async () => {
    calls.push(["continue"]);
  };

  try {
    const service = new DirectorExecutionService();
    await service.executeCommand(recoveryCommand());

    assert.deepEqual(calls, [[
      "takeover",
      takeoverRequest,
      { workflowTaskId: "task-1" },
    ]]);
  } finally {
    NovelDirectorService.prototype.startTakeover = originals.startTakeover;
    NovelDirectorService.prototype.executeContinueTask = originals.executeContinueTask;
    NovelWorkflowService.prototype.getTaskByIdWithoutHealing = originals.getTaskByIdWithoutHealing;
    prisma.directorRunCommand.findFirst = originals.commandFindFirst;
  }
});

test("director execution reports cancelled outcome after inline takeover observes cancellation", async (t) => {
  mockPipelineState(t);
  const takeoverRequest = {
    novelId: "novel-1",
    entryStep: "structured",
    strategy: "continue_existing",
    runMode: "auto_to_execution",
  };
  const originals = {
    startTakeover: NovelDirectorService.prototype.startTakeover,
    getTaskByIdWithoutHealing: NovelWorkflowService.prototype.getTaskByIdWithoutHealing,
  };

  NovelDirectorService.prototype.startTakeover = async () => ({ workflowTaskId: "task-1" });
  NovelWorkflowService.prototype.getTaskByIdWithoutHealing = async () => ({
    id: "task-1",
    lane: "auto_director",
    status: "cancelled",
    cancelRequestedAt: new Date("2026-04-30T10:00:00.000Z"),
    seedPayloadJson: "{}",
  });

  try {
    const service = new DirectorExecutionService();
    const outcome = await service.executeCommand({
      id: "command-takeover",
      taskId: "task-1",
      novelId: "novel-1",
      commandType: "takeover",
      status: "running",
      payloadJson: JSON.stringify({ takeoverRequest }),
    });

    assert.equal(outcome, "cancelled");
  } finally {
    NovelDirectorService.prototype.startTakeover = originals.startTakeover;
    NovelWorkflowService.prototype.getTaskByIdWithoutHealing = originals.getTaskByIdWithoutHealing;
  }
});

test("director execution replays takeover request when a contextless recovery is continued", async (t) => {
  mockPipelineState(t);
  const calls = [];
  const takeoverRequest = {
    novelId: "novel-1",
    entryStep: "structured",
    strategy: "continue_existing",
    runMode: "auto_to_execution",
  };
  const originals = {
    startTakeover: NovelDirectorService.prototype.startTakeover,
    executeContinueTask: NovelDirectorService.prototype.executeContinueTask,
    getTaskByIdWithoutHealing: NovelWorkflowService.prototype.getTaskByIdWithoutHealing,
    commandFindFirst: prisma.directorRunCommand.findFirst,
  };

  NovelWorkflowService.prototype.getTaskByIdWithoutHealing = async () => ({
    id: "task-1",
    lane: "auto_director",
    seedPayloadJson: JSON.stringify({
      takeover: {
        entryStep: "structured",
      },
    }),
  });
  prisma.directorRunCommand.findFirst = async () => ({
    id: "command-takeover",
    taskId: "task-1",
    commandType: "takeover",
    payloadJson: JSON.stringify({ takeoverRequest }),
  });
  NovelDirectorService.prototype.startTakeover = async (request, options) => {
    calls.push(["takeover", request, options]);
  };
  NovelDirectorService.prototype.executeContinueTask = async () => {
    calls.push(["continue"]);
  };

  try {
    const service = new DirectorExecutionService();
    await service.executeCommand(recoveryCommand("continue"));

    assert.deepEqual(calls, [[
      "takeover",
      takeoverRequest,
      { workflowTaskId: "task-1" },
    ]]);
  } finally {
    NovelDirectorService.prototype.startTakeover = originals.startTakeover;
    NovelDirectorService.prototype.executeContinueTask = originals.executeContinueTask;
    NovelWorkflowService.prototype.getTaskByIdWithoutHealing = originals.getTaskByIdWithoutHealing;
    prisma.directorRunCommand.findFirst = originals.commandFindFirst;
  }
});

test("director execution keeps normal recovery path when director input is already persisted", async (t) => {
  mockPipelineState(t);
  const calls = [];
  const originals = {
    startTakeover: NovelDirectorService.prototype.startTakeover,
    executeContinueTask: NovelDirectorService.prototype.executeContinueTask,
    getTaskByIdWithoutHealing: NovelWorkflowService.prototype.getTaskByIdWithoutHealing,
    commandFindFirst: prisma.directorRunCommand.findFirst,
  };

  NovelWorkflowService.prototype.getTaskByIdWithoutHealing = async () => ({
    id: "task-1",
    lane: "auto_director",
    seedPayloadJson: JSON.stringify({
      directorInput: {
        candidate: {
          workingTitle: "Demo",
        },
        runMode: "auto_to_ready",
      },
    }),
  });
  prisma.directorRunCommand.findFirst = async () => {
    throw new Error("takeover replay should not be queried");
  };
  NovelDirectorService.prototype.startTakeover = async () => {
    calls.push(["takeover"]);
  };
  NovelDirectorService.prototype.executeContinueTask = async (taskId, input) => {
    calls.push(["continue", taskId, input.forceResume]);
  };

  try {
    const service = new DirectorExecutionService();
    await service.executeCommand(recoveryCommand());

    assert.deepEqual(calls, [["continue", "task-1", true]]);
  } finally {
    NovelDirectorService.prototype.startTakeover = originals.startTakeover;
    NovelDirectorService.prototype.executeContinueTask = originals.executeContinueTask;
    NovelWorkflowService.prototype.getTaskByIdWithoutHealing = originals.getTaskByIdWithoutHealing;
    prisma.directorRunCommand.findFirst = originals.commandFindFirst;
  }
});
