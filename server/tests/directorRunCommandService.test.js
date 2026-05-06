const test = require("node:test");
const assert = require("node:assert/strict");

const { DirectorCommandService } = require("../dist/services/novel/director/DirectorCommandService.js");
const { prisma } = require("../dist/db/prisma.js");

function createTask(overrides = {}) {
  return {
    id: "task-1",
    novelId: "novel-1",
    lane: "auto_director",
    status: "waiting_approval",
    updatedAt: new Date("2026-04-29T12:00:00.000Z"),
    ...overrides,
  };
}

function createConfirmRequest(overrides = {}) {
  return {
    idea: "A college girl accidentally enters a supernatural organization.",
    title: "Neon Archive",
    narrativePov: "third_person",
    pacePreference: "balanced",
    emotionIntensity: "medium",
    aiFreedom: "medium",
    projectMode: "ai_led",
    writingMode: "original",
    estimatedChapterCount: 30,
    runMode: "auto_to_execution",
    workflowTaskId: "task-1",
    candidate: {
      id: "candidate-1",
      workingTitle: "Neon Archive",
      logline: "A college girl enters a hidden power network.",
      positioning: "Urban supernatural growth thriller.",
      sellingPoint: "An ordinary girl levels up inside a dangerous secret organization.",
      coreConflict: "The organization pushes back as she gets closer to the truth.",
      protagonistPath: "She grows from cautious student into an active operator.",
      endingDirection: "Hopeful victory with a meaningful cost.",
      hookStrategy: "Each arc reveals a deeper layer of the conspiracy.",
      progressionLoop: "Find clue, face pressure, pay cost, gain leverage.",
      whyItFits: "It keeps the urban premise clear and easy to continue.",
      toneKeywords: ["urban", "thriller"],
      targetChapterCount: 30,
    },
    ...overrides,
  };
}

function createCandidatesRequest(overrides = {}) {
  return {
    idea: "A college girl accidentally enters a supernatural organization.",
    title: "Neon Archive",
    narrativePov: "third_person",
    pacePreference: "balanced",
    emotionIntensity: "medium",
    aiFreedom: "medium",
    projectMode: "ai_led",
    writingMode: "original",
    estimatedChapterCount: 30,
    runMode: "auto_to_execution",
    ...overrides,
  };
}

function createHarness(task = createTask()) {
  const commands = [];
  const bootstraps = [];
  const requeued = [];
  const stepUpdates = [];
  const jobUpdates = [];
  const directorEvents = [];
  const taskUpdates = [];
  const originalDirectorRunCommand = {
    findFirst: prisma.directorRunCommand.findFirst,
    create: prisma.directorRunCommand.create,
    findUnique: prisma.directorRunCommand.findUnique,
    updateMany: prisma.directorRunCommand.updateMany,
    findMany: prisma.directorRunCommand.findMany,
  };
  const originalNovelWorkflowTask = {
    updateMany: prisma.novelWorkflowTask.updateMany,
  };
  const originalDirectorStepRun = {
    updateMany: prisma.directorStepRun.updateMany,
  };
  const originalGenerationJob = {
    updateMany: prisma.generationJob.updateMany,
  };
  const originalDirectorRun = {
    findUnique: prisma.directorRun.findUnique,
  };
  const originalDirectorEvent = {
    create: prisma.directorEvent.create,
  };
  const workflowService = {
    async getTaskById(taskId) {
      return taskId === task.id ? task : null;
    },
    async getTaskByIdWithoutHealing(taskId) {
      return taskId === task.id ? task : null;
    },
    async retryTask() {
      task.status = "queued";
      task.updatedAt = new Date(task.updatedAt.getTime() + 1);
      return task;
    },
    async applyAutoDirectorLlmOverride() {},
    async cancelTask() {
      task.status = "cancelled";
      task.cancelRequestedAt = new Date();
      task.updatedAt = new Date(task.updatedAt.getTime() + 1);
      return task;
    },
    async requeueTaskForRecovery(taskId, message) {
      requeued.push({ taskId, message });
      task.status = "queued";
      task.pendingManualRecovery = true;
      task.lastError = message;
      task.heartbeatAt = null;
      task.updatedAt = new Date(task.updatedAt.getTime() + 1);
      return task;
    },
    async bootstrapTask(input) {
      bootstraps.push(input);
      task.id = input.workflowTaskId?.trim() || (input.novelId ? `takeover-task-${commands.length + 1}` : task.id);
      task.novelId = input.novelId ?? null;
      task.lane = input.lane;
      task.status = "queued";
      task.updatedAt = new Date(task.updatedAt.getTime() + 1);
      return task;
    },
  };

  prisma.directorRunCommand.findFirst = async ({ where }) => {
    let rows = commands;
    if (where?.novelId) {
      rows = rows.filter((row) => row.novelId === where.novelId);
    }
    if (where?.taskId) {
      rows = rows.filter((row) => row.taskId === where.taskId);
    }
    if (where?.commandType) {
      if (typeof where.commandType === "string") {
        rows = rows.filter((row) => row.commandType === where.commandType);
      } else if (Array.isArray(where.commandType.in)) {
        rows = rows.filter((row) => where.commandType.in.includes(row.commandType));
      }
    }
    if (where?.status) {
      if (typeof where.status === "string") {
        rows = rows.filter((row) => row.status === where.status);
      } else if (Array.isArray(where.status.in)) {
        rows = rows.filter((row) => where.status.in.includes(row.status));
      }
    }
    if (where?.runAfter?.lte) {
      rows = rows.filter((row) => row.runAfter <= where.runAfter.lte);
    }
    return rows[0] ?? null;
  };
  prisma.directorRunCommand.create = async ({ data }) => {
    const row = {
      id: `command-${commands.length + 1}`,
      novelId: data.novelId ?? null,
      leaseOwner: null,
      leaseExpiresAt: null,
      attempt: 0,
      runAfter: new Date(),
      errorMessage: null,
      startedAt: null,
      finishedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...data,
      novelId: data.novelId ?? null,
    };
    commands.push(row);
    return row;
  };
  prisma.directorRunCommand.findUnique = async ({ where }) => (
    commands.find((row) => row.id === where.id) ?? null
  );
  prisma.directorRunCommand.findMany = async ({ where }) => {
    let rows = commands;
    if (where?.taskId) {
      rows = rows.filter((row) => row.taskId === where.taskId);
    }
    if (where?.status?.in) {
      rows = rows.filter((row) => where.status.in.includes(row.status));
    }
    if (where?.leaseExpiresAt?.lt) {
      rows = rows.filter((row) => row.leaseExpiresAt && row.leaseExpiresAt < where.leaseExpiresAt.lt);
    }
    return rows.map((row) => ({
      id: row.id,
      taskId: row.taskId,
      commandType: row.commandType,
      attempt: row.attempt,
      payloadJson: row.payloadJson,
    }));
  };
  prisma.directorRunCommand.updateMany = async ({ where, data }) => {
    let count = 0;
    for (const row of commands) {
      if (where?.id) {
        if (typeof where.id === "string" && row.id !== where.id) {
          continue;
        }
        if (Array.isArray(where.id.in) && !where.id.in.includes(row.id)) {
          continue;
        }
      }
      if (where?.taskId && row.taskId !== where.taskId) {
        continue;
      }
      if (where?.leaseOwner && row.leaseOwner !== where.leaseOwner) {
        continue;
      }
      if (where?.status) {
        if (typeof where.status === "string" && row.status !== where.status) {
          continue;
        }
        if (Array.isArray(where.status.in) && !where.status.in.includes(row.status)) {
          continue;
        }
      }
      if (data?.attempt?.increment) {
        row.attempt += data.attempt.increment;
      }
      for (const [key, value] of Object.entries(data ?? {})) {
        if (key !== "attempt") {
          row[key] = value;
        }
      }
      row.updatedAt = new Date();
      count += 1;
    }
    return { count };
  };
  prisma.novelWorkflowTask.updateMany = async (args) => {
    taskUpdates.push(args);
    if (args?.where?.id) {
      if (typeof args.where.id === "string" && args.where.id !== task.id) {
        return { count: 0 };
      }
      if (Array.isArray(args.where.id.in) && !args.where.id.in.includes(task.id)) {
        return { count: 0 };
      }
    }
    Object.assign(task, args?.data ?? {});
    task.updatedAt = new Date(task.updatedAt.getTime() + 1);
    return { count: 1 };
  };
  prisma.directorStepRun.updateMany = async (args) => {
    stepUpdates.push(args);
    return { count: 1 };
  };
  prisma.generationJob.updateMany = async (args) => {
    jobUpdates.push(args);
    return { count: 1 };
  };
  prisma.directorRun.findUnique = async ({ where }) => (
    where.taskId === task.id
      ? { id: "run-1", novelId: task.novelId }
      : null
  );
  prisma.directorEvent.create = async ({ data }) => {
    directorEvents.push(data);
    return data;
  };

  return {
    commands,
    bootstraps,
    requeued,
    task,
    stepUpdates,
    jobUpdates,
    directorEvents,
    taskUpdates,
    service: new DirectorCommandService(workflowService),
    restore() {
      Object.assign(prisma.directorRunCommand, originalDirectorRunCommand);
      Object.assign(prisma.novelWorkflowTask, originalNovelWorkflowTask);
      Object.assign(prisma.directorStepRun, originalDirectorStepRun);
      Object.assign(prisma.generationJob, originalGenerationJob);
      Object.assign(prisma.directorRun, originalDirectorRun);
      Object.assign(prisma.directorEvent, originalDirectorEvent);
    },
  };
}

test("director command service reuses active continue commands", async () => {
  const harness = createHarness();
  try {
    const first = await harness.service.enqueueContinueCommand("task-1", {
      continuationMode: "auto_execute_range",
    });
    const second = await harness.service.enqueueContinueCommand("task-1", {
      continuationMode: "auto_execute_range",
    });
    assert.equal(first.commandId, second.commandId);
    assert.equal(harness.commands.length, 1);
    assert.equal(first.status, "queued");
  } finally {
    harness.restore();
  }
});

test("director command service queues candidate confirmation as a serialized command", async () => {
  const harness = createHarness(createTask({
    novelId: null,
    status: "waiting_approval",
  }));
  try {
    const accepted = await harness.service.enqueueConfirmCandidateCommand(createConfirmRequest());

    assert.equal(accepted.status, "queued");
    assert.equal(accepted.commandType, "confirm_candidate");
    assert.equal(accepted.taskId, "task-1");
    assert.equal(accepted.novelId, null);
    assert.equal(harness.commands.length, 1);
    assert.equal(harness.bootstraps.length, 1);
    assert.equal(harness.bootstraps[0].lane, "auto_director");
    assert.equal(harness.bootstraps[0].initialState.itemKey, "candidate_confirm");
    const payload = JSON.parse(harness.commands[0].payloadJson);
    assert.equal(payload.confirmRequest.workflowTaskId, "task-1");
    assert.equal(payload.confirmRequest.runMode, "auto_to_execution");
    assert.equal(payload.confirmRequest.candidate.workingTitle, "Neon Archive");
    assert.equal(harness.task.status, "queued");
    assert.equal(harness.task.currentItemKey, "candidate_confirm");
    assert.equal(harness.task.currentItemLabel, "书级方向提交完成，等待 AI 创建小说项目");
    assert.equal(harness.task.pendingManualRecovery, false);
  } finally {
    harness.restore();
  }
});

test("director command service queues candidate generation as a serialized command", async () => {
  const harness = createHarness(createTask({
    novelId: null,
    status: "queued",
  }));
  try {
    const accepted = await harness.service.enqueueGenerateCandidatesCommand(createCandidatesRequest());

    assert.equal(accepted.status, "queued");
    assert.equal(accepted.commandType, "generate_candidates");
    assert.equal(accepted.taskId, "task-1");
    assert.equal(harness.commands.length, 1);
    assert.equal(harness.bootstraps.length, 1);
    assert.equal(harness.bootstraps[0].initialState.itemKey, "candidate_direction_batch");
    const payload = JSON.parse(harness.commands[0].payloadJson);
    assert.equal(payload.candidatesRequest.workflowTaskId, "task-1");
    assert.equal(payload.candidatesRequest.idea, "A college girl accidentally enters a supernatural organization.");
    assert.equal(harness.task.currentItemLabel, "AI 正在生成书级方向候选");
  } finally {
    harness.restore();
  }
});

test("director command service reuses active candidate generation commands", async () => {
  const harness = createHarness(createTask({
    novelId: null,
    status: "queued",
  }));
  try {
    const first = await harness.service.enqueueGenerateCandidatesCommand(createCandidatesRequest());
    const second = await harness.service.enqueueGenerateCandidatesCommand(createCandidatesRequest());

    assert.equal(first.commandId, second.commandId);
    assert.equal(harness.commands.length, 1);
    assert.equal(harness.commands[0].commandType, "generate_candidates");
  } finally {
    harness.restore();
  }
});

test("director command service queues approve gate as a one-shot command", async () => {
  const harness = createHarness();
  try {
    const accepted = await harness.service.enqueueApproveGateCommand("task-1");

    assert.equal(accepted.status, "queued");
    assert.equal(accepted.commandType, "approve_gate");
    assert.equal(harness.commands.length, 1);
    const payload = JSON.parse(harness.commands[0].payloadJson);
    assert.equal(payload.continuationMode, "resume");
    assert.equal(payload.forceResume, true);
    assert.equal(harness.task.currentItemKey, "approve_gate");
  } finally {
    harness.restore();
  }
});

test("director command service queues policy updates without directly mutating runtime policy", async () => {
  const harness = createHarness();
  try {
    const accepted = await harness.service.enqueuePolicyUpdateCommand("task-1", {
      mode: "run_next_step",
      autoApproveActions: ["chapter_execution_continue"],
    });

    assert.equal(accepted.status, "queued");
    assert.equal(accepted.commandType, "policy_update");
    assert.equal(harness.commands.length, 1);
    const payload = JSON.parse(harness.commands[0].payloadJson);
    assert.equal(payload.policyUpdateRequest.mode, "run_next_step");
    assert.deepEqual(payload.policyUpdateRequest.autoApproveActions, ["chapter_execution_continue"]);
    assert.equal(harness.task.currentItemKey, "policy_update");
    assert.equal(harness.task.currentItemLabel, "已提交运行策略调整，等待 AI 按新策略推进");
  } finally {
    harness.restore();
  }
});

test("director command service applies the full-book autopilot contract before queueing confirmation", async () => {
  const harness = createHarness(createTask({
    novelId: null,
    status: "waiting_approval",
  }));
  try {
    await harness.service.enqueueConfirmCandidateCommand(createConfirmRequest({
      runMode: "full_book_autopilot",
      autoExecutionPlan: {
        mode: "front10",
        endOrder: 10,
        autoReview: false,
        autoRepair: false,
      },
      autoApproval: {
        enabled: false,
        approvalPointCodes: ["candidate_direction_confirmed"],
      },
    }));

    const payload = JSON.parse(harness.commands[0].payloadJson);
    assert.equal(payload.confirmRequest.runMode, "full_book_autopilot");
    assert.deepEqual(payload.confirmRequest.autoExecutionPlan, {
      mode: "book",
      autoReview: true,
      autoRepair: true,
    });
    assert.equal(payload.confirmRequest.autoApproval.enabled, true);
    assert.ok(payload.confirmRequest.autoApproval.approvalPointCodes.includes("chapter_execution_continue"));
    assert.ok(payload.confirmRequest.autoApproval.approvalPointCodes.includes("replan_continue"));
    assert.deepEqual(harness.bootstraps[0].seedPayload.autoExecutionPlan, {
      mode: "book",
      autoReview: true,
      autoRepair: true,
    });
    assert.equal(harness.bootstraps[0].seedPayload.autoApproval.enabled, true);
  } finally {
    harness.restore();
  }
});

test("director command service clears manual recovery state when a stale running task is continued", async () => {
  const harness = createHarness(createTask({
    status: "running",
    pendingManualRecovery: true,
    lastError: "Director Worker 已中断，任务已暂停，等待手动恢复。",
  }));
  try {
    const accepted = await harness.service.enqueueContinueCommand("task-1", {
      forceResume: true,
    });

    assert.equal(accepted.status, "queued");
    assert.equal(harness.commands.length, 1);
    assert.equal(harness.task.status, "queued");
    assert.equal(harness.task.pendingManualRecovery, false);
    assert.equal(harness.task.lastError, null);
    assert.equal(harness.task.finishedAt, null);
    assert.equal(harness.task.cancelRequestedAt, null);
    assert.deepEqual(harness.taskUpdates[0].where.OR, [
      { status: { in: ["queued", "running", "waiting_approval", "failed"] } },
      { pendingManualRecovery: true },
    ]);
  } finally {
    harness.restore();
  }
});

test("director command service reuses active takeover command by novel", async () => {
  const harness = createHarness();
  try {
    const first = await harness.service.enqueueTakeoverCommand({
      novelId: "novel-1",
      entryStep: "structured",
      strategy: "continue_existing",
    });
    const second = await harness.service.enqueueTakeoverCommand({
      novelId: "novel-1",
      entryStep: "structured",
      strategy: "continue_existing",
    });
    assert.equal(first.commandId, second.commandId);
    assert.equal(first.commandType, "takeover");
    assert.equal(harness.commands.length, 1);
  } finally {
    harness.restore();
  }
});

test("director command service queues chapter title repair without clearing the warning", async () => {
  const harness = createHarness(createTask({
    status: "failed",
    lastError: "章节标题过于相似，需要修复。",
  }));
  try {
    const accepted = await harness.service.enqueueChapterTitleRepairCommand("task-1", {
      volumeId: " volume-1 ",
    });

    assert.equal(accepted.status, "queued");
    assert.equal(accepted.commandType, "repair_chapter_titles");
    assert.equal(harness.commands.length, 1);
    assert.equal(harness.commands[0].payloadJson, "{\"volumeId\":\"volume-1\"}");
    assert.equal(harness.task.status, "queued");
    assert.equal(harness.task.lastError, "章节标题过于相似，需要修复。");
    assert.equal("lastError" in harness.taskUpdates[0].data, false);
  } finally {
    harness.restore();
  }
});

test("director command service queues chapter title repair with a null volume filter", async () => {
  const harness = createHarness(createTask({ status: "failed" }));
  try {
    const accepted = await harness.service.enqueueChapterTitleRepairCommand("task-1", {
      volumeId: "   ",
    });

    assert.equal(accepted.commandType, "repair_chapter_titles");
    assert.equal(harness.commands.length, 1);
    assert.equal(harness.commands[0].payloadJson, "{\"volumeId\":null}");
    assert.equal("lastError" in harness.taskUpdates[0].data, false);
  } finally {
    harness.restore();
  }
});

test("director command service leases a queued command once", async () => {
  const harness = createHarness();
  try {
    await harness.service.enqueueContinueCommand("task-1");
    const leased = await harness.service.leaseNextCommand({
      workerId: "worker-a",
      leaseMs: 30_000,
    });
    assert.equal(leased.id, "command-1");
    assert.equal(leased.status, "leased");
    assert.equal(leased.leaseOwner, "worker-a");
    assert.equal(leased.attempt, 1);
    const next = await harness.service.leaseNextCommand({
      workerId: "worker-b",
      leaseMs: 30_000,
    });
    assert.equal(next, null);
  } finally {
    harness.restore();
  }
});

test("director command service marks a leased command cancelled and closes running children", async () => {
  const harness = createHarness();
  try {
    await harness.service.enqueueContinueCommand("task-1");
    const leased = await harness.service.leaseNextCommand({
      workerId: "worker-a",
      leaseMs: 30_000,
    });

    await harness.service.markCommandCancelled(leased.id, "worker-a");

    assert.equal(harness.commands[0].status, "cancelled");
    assert.equal(harness.commands[0].leaseExpiresAt, null);
    assert.equal(harness.commands[0].errorMessage, "自动导演任务已取消。");
    assert.equal(harness.stepUpdates.length, 1);
    assert.equal(harness.stepUpdates[0].where.taskId, "task-1");
    assert.equal(harness.stepUpdates[0].where.status, "running");
    assert.equal(harness.stepUpdates[0].data.status, "failed");
    assert.equal(harness.stepUpdates[0].data.error, "自动导演任务已取消。");
    assert.equal(harness.jobUpdates.length, 1);
    assert.deepEqual(harness.jobUpdates[0].where.status, { in: ["queued", "running"] });
    assert.deepEqual(harness.jobUpdates[0].where.payload, { contains: "task-1" });
    assert.equal(harness.jobUpdates[0].data.status, "cancelled");
    assert.equal(harness.directorEvents.length, 1);
    assert.equal(harness.directorEvents[0].type, "run_cancelled");
    assert.equal(harness.directorEvents[0].summary, "自动导演已停止，后台运行状态已收束。");
  } finally {
    harness.restore();
  }
});

test("director command service auto requeues first stale continue lease", async () => {
  const harness = createHarness(createTask({
    status: "running",
    pendingManualRecovery: false,
    lastError: null,
  }));
  try {
    await harness.service.enqueueContinueCommand("task-1");
    harness.commands[0].status = "running";
    harness.commands[0].leaseOwner = "worker-a";
    harness.commands[0].attempt = 1;
    harness.commands[0].leaseExpiresAt = new Date("2026-04-29T12:00:00.000Z");
    const count = await harness.service.recoverStaleLeases(new Date("2026-04-29T12:01:00.000Z"));
    assert.equal(count, 1);
    assert.equal(harness.commands[0].status, "queued");
    assert.equal(harness.commands[0].leaseOwner, null);
    assert.equal(harness.commands[0].leaseExpiresAt, null);
    assert.equal(harness.commands[0].startedAt, null);
    assert.equal(harness.commands[0].finishedAt, null);
    assert.equal(harness.commands[0].errorMessage, "\u540e\u53f0\u6267\u884c\u4e2d\u65ad\uff0c\u7cfb\u7edf\u5df2\u81ea\u52a8\u4ece\u6700\u8fd1\u8fdb\u5ea6\u7ee7\u7eed\u3002");
    assert.equal(harness.requeued.length, 0);
    assert.equal(harness.stepUpdates.length, 0);
    assert.equal(harness.task.status, "queued");
    assert.equal(harness.task.pendingManualRecovery, false);
    assert.equal(harness.task.lastError, null);
  } finally {
    harness.restore();
  }
});

test("director command service marks exhausted expired leases stale and requeues task recovery", async () => {
  const harness = createHarness();
  try {
    await harness.service.enqueueContinueCommand("task-1");
    harness.commands[0].status = "running";
    harness.commands[0].leaseOwner = "worker-a";
    harness.commands[0].attempt = 2;
    harness.commands[0].leaseExpiresAt = new Date("2026-04-29T12:00:00.000Z");
    const count = await harness.service.recoverStaleLeases(new Date("2026-04-29T12:01:00.000Z"));
    assert.equal(count, 1);
    assert.equal(harness.commands[0].status, "stale");
    assert.equal(harness.requeued.length, 1);
    assert.equal(harness.requeued[0].taskId, "task-1");
    assert.match(harness.requeued[0].message, /\u70b9\u51fb\u6062\u590d/);
    assert.equal(harness.stepUpdates.length, 1);
    assert.equal(harness.stepUpdates[0].where.taskId, "task-1");
    assert.equal(harness.stepUpdates[0].where.status, "running");
    assert.equal(harness.stepUpdates[0].data.status, "failed");
    assert.match(harness.stepUpdates[0].data.error, /\u79df\u7ea6\u8fc7\u671f/);
  } finally {
    harness.restore();
  }
});

test("director command service auto requeues full-book autopilot stale leases before manual recovery", async () => {
  const harness = createHarness(createTask({
    status: "running",
    pendingManualRecovery: false,
    lastError: null,
  }));
  try {
    await harness.service.enqueueConfirmCandidateCommand(createConfirmRequest({
      runMode: "full_book_autopilot",
    }));
    harness.commands[0].status = "running";
    harness.commands[0].leaseOwner = "worker-a";
    harness.commands[0].attempt = 2;
    harness.commands[0].leaseExpiresAt = new Date("2026-04-29T12:00:00.000Z");

    const count = await harness.service.recoverStaleLeases(new Date("2026-04-29T12:01:00.000Z"));

    assert.equal(count, 1);
    assert.equal(harness.commands[0].status, "queued");
    assert.equal(harness.commands[0].leaseOwner, null);
    assert.equal(harness.commands[0].leaseExpiresAt, null);
    assert.equal(harness.requeued.length, 0);
    assert.equal(harness.task.status, "queued");
    assert.equal(harness.task.pendingManualRecovery, false);
  } finally {
    harness.restore();
  }
});

test("director command service clears exhausted stale command before accepting a new continue", async () => {
  const harness = createHarness(createTask({
    status: "running",
    pendingManualRecovery: true,
    lastError: "服务重启后任务已暂停，等待手动恢复。",
  }));
  try {
    await harness.service.enqueueContinueCommand("task-1");
    harness.commands[0].status = "running";
    harness.commands[0].leaseOwner = "worker-a";
    harness.commands[0].attempt = 2;
    harness.commands[0].leaseExpiresAt = new Date("2026-04-29T12:00:00.000Z");
    harness.task.status = "running";
    harness.task.pendingManualRecovery = true;
    harness.task.lastError = "服务重启后任务已暂停，等待手动恢复。";

    const accepted = await harness.service.enqueueContinueCommand("task-1");

    assert.equal(harness.commands[0].status, "stale");
    assert.equal(harness.commands.length, 2);
    assert.notEqual(harness.commands[0].idempotencyKey, harness.commands[1].idempotencyKey);
    assert.equal(accepted.commandId, "command-2");
    assert.equal(accepted.status, "queued");
    assert.equal(harness.task.status, "queued");
    assert.equal(harness.task.pendingManualRecovery, false);
    assert.equal(harness.task.lastError, null);
  } finally {
    harness.restore();
  }
});

test("director command service requeues task recovery when worker execution fails", async () => {
  const harness = createHarness();
  try {
    await harness.service.enqueueContinueCommand("task-1");
    harness.commands[0].status = "running";
    harness.commands[0].leaseOwner = "worker-a";

    await harness.service.markCommandFailed("command-1", "worker-a", new Error("worker boom"));

    assert.equal(harness.commands[0].status, "failed");
    assert.equal(harness.commands[0].leaseExpiresAt, null);
    assert.equal(harness.commands[0].errorMessage, "worker boom");
    assert.equal(harness.requeued.length, 1);
    assert.deepEqual(harness.requeued[0], {
      taskId: "task-1",
      message: "worker boom",
    });
    assert.equal(harness.stepUpdates.length, 1);
    assert.equal(harness.stepUpdates[0].where.taskId, "task-1");
    assert.equal(harness.stepUpdates[0].where.status, "running");
    assert.equal(harness.stepUpdates[0].data.status, "failed");
    assert.equal(harness.stepUpdates[0].data.error, "worker boom");
  } finally {
    harness.restore();
  }
});
