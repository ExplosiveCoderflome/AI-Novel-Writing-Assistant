const test = require("node:test");
const assert = require("node:assert/strict");

const { directorIssueService } = require("../dist/services/novel/director/issues/DirectorIssueService.js");
const { prisma } = require("../dist/db/prisma.js");

const {createTask, createConfirmRequest, createCandidatesRequest, createHarness} = require("./director/commands/fixtures/DirectorCommandFixture.js");

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
    assert.equal(harness.task.pendingManualRecovery, undefined);
    assert.equal(Object.hasOwn(harness.taskUpdates[0].data, "pendingManualRecovery"), false);
  } finally {
    harness.restore();
  }
});

test("director command service restores corrupted confirmation text from the saved candidate batch", async () => {
  const authoritativeCandidate = {
    ...createConfirmRequest().candidate,
    workingTitle: "资本沉默战",
    logline: "金融天才在能源设备企业的危机中激活沉默资产。",
    positioning: "现代商战中的资本与产业博弈。",
    sellingPoint: "用规则与资本布局完成逆转。",
  };
  const harness = createHarness(createTask({
    novelId: null,
    status: "waiting_approval",
    seedPayloadJson: JSON.stringify({
      idea: "参考现实商战创作一部独立小说。",
      basicForm: {
        description: "参考现实商战创作一部独立小说。",
        targetAudience: "喜欢高密度智斗的读者。",
        bookSellingPoint: "规则博弈与阶层跃迁。",
        competingFeel: "冷静克制的商业对弈。",
        first30ChapterPromise: "前三十章完成第一次完整破局。",
        commercialTagsText: "现代商战，规则博弈",
      },
      candidate: {
        ...authoritativeCandidate,
        workingTitle: "资本不眠",
      },
      batches: [{
        id: "batch-1",
        round: 1,
        idea: "参考现实商战创作一部独立小说。",
        candidates: [authoritativeCandidate],
      }],
    }),
  }));
  try {
    await harness.service.enqueueConfirmCandidateCommand(createConfirmRequest({
      batchId: "batch-1",
      idea: "�ο���ʵ��ս",
      description: "�ο���ʵ��ս",
      targetAudience: "ϲ�����ܶ��Ƕ��Ķ���",
      bookSellingPoint: "�������ײ�ԾǨ",
      competingFeel: "�侲���Ƶ���ҵ����",
      first30ChapterPromise: "ǰ��ʮ����ɵ�һ������ƾ�",
      commercialTags: ["�ִ���ս", "�������"],
      candidate: {
        ...authoritativeCandidate,
        workingTitle: "�ʱ�����",
        logline: "������������Դ�豸��ҵ��Σ����",
      },
    }));

    const payload = JSON.parse(harness.commands[0].payloadJson).confirmRequest;
    assert.equal(payload.idea, "参考现实商战创作一部独立小说。");
    assert.equal(payload.description, "参考现实商战创作一部独立小说。");
    assert.equal(payload.targetAudience, "喜欢高密度智斗的读者。");
    assert.equal(payload.candidate.workingTitle, "资本不眠");
    assert.equal(payload.candidate.logline, authoritativeCandidate.logline);
    assert.deepEqual(payload.commercialTags, ["现代商战", "规则博弈"]);
    assert.equal(JSON.stringify(payload).includes("�"), false);
    assert.equal(JSON.stringify(harness.bootstraps[0].seedPayload).includes("�"), false);
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

test("director command service preserves an explicit chapter range while applying full-book autopilot approval", async () => {
  const harness = createHarness(createTask({
    novelId: null,
    status: "waiting_approval",
    seedPayloadJson: JSON.stringify({
      issueGovernanceVersion: 1,
      issuePolicy: { maxAutomaticRetries: 1, issueActions: {} },
      issuePolicySource: "global",
      runMode: "auto_to_execution",
    }),
  }));
  try {
    await harness.service.enqueueConfirmCandidateCommand(createConfirmRequest({
      runMode: "full_book_autopilot",
      autoExecutionPlan: {
        mode: "chapter_range",
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
      mode: "chapter_range",
      endOrder: 10,
      autoReview: false,
      autoRepair: false,
    });
    assert.equal(payload.confirmRequest.autoApproval.enabled, true);
    assert.ok(payload.confirmRequest.autoApproval.approvalPointCodes.includes("chapter_execution_continue"));
    assert.ok(payload.confirmRequest.autoApproval.approvalPointCodes.includes("replan_continue"));
    assert.deepEqual(harness.bootstraps[0].seedPayload.autoExecutionPlan, {
      mode: "chapter_range",
      endOrder: 10,
      autoReview: false,
      autoRepair: false,
    });
    assert.equal(harness.bootstraps[0].seedPayload.autoApproval.enabled, true);
  } finally {
    harness.restore();
  }
});

test("director command service preserves an explicit chapter range while applying full-book autopilot approval from an existing full-book launch", async () => {
  const harness = createHarness(createTask({
    novelId: null,
    status: "waiting_approval",
    seedPayloadJson: JSON.stringify({
      issueGovernanceVersion: 1,
      issuePolicy: { maxAutomaticRetries: 1, issueActions: {} },
      issuePolicySource: "global",
      runMode: "full_book_autopilot",
    }),
  }));
  try {
    await harness.service.enqueueConfirmCandidateCommand(createConfirmRequest({
      runMode: "full_book_autopilot",
      autoExecutionPlan: {
        mode: "chapter_range",
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
      mode: "chapter_range",
      endOrder: 10,
      autoReview: false,
      autoRepair: false,
    });
    assert.equal(payload.confirmRequest.autoApproval.enabled, true);
    assert.ok(payload.confirmRequest.autoApproval.approvalPointCodes.includes("chapter_execution_continue"));
    assert.ok(payload.confirmRequest.autoApproval.approvalPointCodes.includes("replan_continue"));
    assert.deepEqual(harness.bootstraps[0].seedPayload.autoExecutionPlan, {
      mode: "chapter_range",
      endOrder: 10,
      autoReview: false,
      autoRepair: false,
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
  const writer = harness.service.stateWriter;
  const originalClear = writer.clearPendingManualRecovery;
  let clearedByCommandId = null;
  writer.clearPendingManualRecovery = function(input, options) {
    clearedByCommandId = input.userCommandId;
    return originalClear.call(this, input, options);
  };
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
    assert.equal(clearedByCommandId, harness.commands[0].id);
    assert.deepEqual(harness.taskUpdates[0].where.OR, [
      { status: { in: ["queued", "running", "waiting_approval", "failed"] } },
      { pendingManualRecovery: true },
    ]);
  } finally {
    writer.clearPendingManualRecovery = originalClear;
    harness.restore();
  }
});

test("explicit recovery commands clear the manual recovery lock with their persisted command id", async () => {
  const harness = createHarness(createTask({
    status: "running",
    pendingManualRecovery: true,
  }));
  const writer = harness.service.stateWriter;
  const originalClear = writer.clearPendingManualRecovery;
  let clearedByCommandId = null;
  writer.clearPendingManualRecovery = function(input, options) {
    clearedByCommandId = input.userCommandId;
    return originalClear.call(this, input, options);
  };
  try {
    await harness.service.enqueueRecoveryCommand("task-1");

    assert.equal(harness.task.pendingManualRecovery, false);
    assert.equal(clearedByCommandId, harness.commands[0].id);
  } finally {
    writer.clearPendingManualRecovery = originalClear;
    harness.restore();
  }
});

test("explicit recovery reuses a queued command and clears the startup recovery lock", async () => {
  const harness = createHarness(createTask({
    status: "queued",
    pendingManualRecovery: false,
  }));
  try {
    const acceptedBeforeRestart = await harness.service.enqueueContinueCommand("task-1");
    harness.task.pendingManualRecovery = true;
    harness.task.lastError = "服务重启后任务已暂停，等待手动恢复。";

    const acceptedAfterRestart = await harness.service.enqueueRecoveryCommand("task-1");

    assert.equal(acceptedAfterRestart.commandId, acceptedBeforeRestart.commandId);
    assert.equal(harness.commands.length, 1);
    assert.equal(harness.task.pendingManualRecovery, false);
    assert.equal(harness.task.status, "queued");
    assert.equal(harness.task.lastError, null);
    assert.equal(harness.taskUpdates.length, 2);

    const leased = await harness.service.leaseNextCommand({ workerId: "worker-a", leaseMs: 30_000 });
    assert.equal(leased.id, acceptedBeforeRestart.commandId);
  } finally {
    harness.restore();
  }
});

test("explicit recovery queues a durable follow-up when the previous command is still running", async () => {
  const runningCommand = {
    id: "command-running",
    taskId: "task-1",
    novelId: "novel-1",
    commandType: "continue",
    status: "running",
    leaseOwner: "worker-a:slot-1",
    leaseExpiresAt: new Date(Date.now() + 30_000),
    createdAt: new Date("2026-04-29T12:00:00.000Z"),
    payloadJson: JSON.stringify({ forceResume: true }),
  };
  const harness = createHarness(createTask({
    status: "queued",
    pendingManualRecovery: true,
  }), null, { commands: [runningCommand] });
  try {
    const accepted = await harness.service.enqueueRecoveryCommand("task-1");

    assert.notEqual(accepted.commandId, runningCommand.id);
    assert.equal(harness.commands.length, 2);
    assert.equal(harness.commands[0].status, "running");
    assert.equal(harness.commands[1].status, "queued");
    assert.equal(harness.task.pendingManualRecovery, false);
    assert.equal(harness.task.status, "queued");

    // The old worker finishes after recovery acceptance. The accepted recovery
    // must still have a queued command that the worker can claim.
    await harness.service.markCommandSucceeded(runningCommand.id, runningCommand.leaseOwner);
    assert.equal(runningCommand.status, "succeeded");
    const leased = await harness.service.leaseNextCommand({ workerId: "worker-b", leaseMs: 30_000 });
    assert.equal(leased.id, accepted.commandId);
  } finally {
    harness.restore();
  }
});

test("explicit recovery creates a new command if the reused command finishes before task recovery", async () => {
  const harness = createHarness(createTask({
    status: "queued",
    pendingManualRecovery: false,
  }));
  const originalTransaction = prisma.$transaction;
  try {
    const acceptedBeforeRestart = await harness.service.enqueueContinueCommand("task-1");
    harness.task.pendingManualRecovery = true;
    let completeBeforeRecoveryTransaction = true;
    prisma.$transaction = async (callback, options) => {
      if (completeBeforeRecoveryTransaction) {
        completeBeforeRecoveryTransaction = false;
        harness.commands[0].status = "succeeded";
      }
      return originalTransaction(callback, options);
    };

    const acceptedAfterRestart = await harness.service.enqueueRecoveryCommand("task-1");

    assert.notEqual(acceptedAfterRestart.commandId, acceptedBeforeRestart.commandId);
    assert.equal(harness.commands.length, 2);
    assert.equal(harness.commands[0].status, "succeeded");
    assert.equal(harness.commands[1].status, "queued");
    assert.equal(harness.task.pendingManualRecovery, false);
    assert.equal(harness.task.status, "queued");
  } finally {
    prisma.$transaction = originalTransaction;
    harness.restore();
  }
});

test("repeated explicit recovery does not reset an unlocked running task", async () => {
  const harness = createHarness(createTask({ pendingManualRecovery: false }));
  try {
    const acceptedBeforeRetry = await harness.service.enqueueContinueCommand("task-1");
    const leased = await harness.service.leaseNextCommand({ workerId: "worker-a", leaseMs: 30_000 });
    await harness.service.markCommandRunning(leased.id, "worker-a", 30_000);
    Object.assign(harness.task, {
      status: "running",
      progress: 0.65,
      currentStage: "chapter_execution",
      currentItemLabel: "正在写第 8 章",
    });
    const updatesBeforeRetry = harness.taskUpdates.length;

    const acceptedAfterRetry = await harness.service.enqueueRecoveryCommand("task-1");

    assert.equal(acceptedAfterRetry.commandId, acceptedBeforeRetry.commandId);
    assert.equal(harness.commands.length, 1);
    assert.equal(harness.commands[0].status, "running");
    assert.equal(harness.task.status, "running");
    assert.equal(harness.task.progress, 0.65);
    assert.equal(harness.task.currentStage, "chapter_execution");
    assert.equal(harness.task.currentItemLabel, "正在写第 8 章");
    assert.equal(harness.taskUpdates.length, updatesBeforeRetry);
  } finally {
    harness.restore();
  }
});

test("explicit recovery command creation rolls back if the locked task cannot be updated", async () => {
  const harness = createHarness(createTask({
    status: "running",
    pendingManualRecovery: true,
  }));
  prisma.novelWorkflowTask.updateMany = async () => {
    throw new Error("task state write failed");
  };
  try {
    await assert.rejects(
      harness.service.enqueueRecoveryCommand("task-1"),
      /task state write failed/,
    );

    assert.equal(harness.commands.length, 0);
    assert.equal(harness.task.pendingManualRecovery, true);
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
    assert.equal(harness.starts.length, 1);
    assert.equal(harness.starts[0].options.whenActive, "supersede");
  } finally {
    harness.restore();
  }
});

test("director command service reuses identical active restart takeover commands", async () => {
  const request = {
    novelId: "novel-1",
    entryStep: "structured",
    strategy: "restart_current_step",
    startPhase: "structured_outline",
  };
  const harness = createHarness(createTask({ status: "queued" }), null, {
    commands: [{
      id: "command-existing-restart",
      taskId: "task-1",
      novelId: "novel-1",
      commandType: "takeover",
      status: "queued",
      payloadJson: JSON.stringify({
        takeoverRequest: { ...request, runMode: "auto_to_ready" },
      }),
    }],
  });
  try {
    const accepted = await harness.service.enqueueTakeoverCommand(request);

    assert.equal(accepted.commandId, "command-existing-restart");
    assert.equal(accepted.commandType, "takeover");
    assert.equal(harness.commands.length, 1);
    assert.equal(harness.starts.length, 0);
  } finally {
    harness.restore();
  }
});

test("director command service rejects restart when an active continue takeover command exists", async () => {
  const harness = createHarness(createTask(), null, {
    commands: [{
      id: "command-existing-continue",
      taskId: "task-1",
      novelId: "novel-1",
      commandType: "takeover",
      status: "queued",
      payloadJson: JSON.stringify({
        takeoverRequest: { novelId: "novel-1", strategy: "continue_existing" },
      }),
    }],
  });
  try {
    await assert.rejects(
      harness.service.enqueueTakeoverCommand({
        novelId: "novel-1",
        startPhase: "structured_outline",
        strategy: "restart_current_step",
      }),
      /已有进行中的 AI 任务/,
    );

    assert.equal(harness.starts.length, 1);
    assert.equal(harness.starts[0].options.whenActive, "reject");
    assert.equal(harness.commands.length, 1);
  } finally {
    harness.restore();
  }
});

test("director command service ignores an active takeover command linked to a terminal task", async () => {
  const harness = createHarness(createTask({ status: "cancelled" }), null, {
    commands: [{
      id: "command-orphaned-takeover",
      taskId: "task-1",
      novelId: "novel-1",
      commandType: "takeover",
      status: "queued",
      payloadJson: JSON.stringify({
        takeoverRequest: { novelId: "novel-1", strategy: "continue_existing" },
      }),
    }],
  });
  try {
    const accepted = await harness.service.enqueueTakeoverCommand({
      novelId: "novel-1",
      strategy: "continue_existing",
    });

    assert.notEqual(accepted.commandId, "command-orphaned-takeover");
    assert.equal(accepted.taskId, "takeover-task-1");
    assert.equal(harness.starts.length, 1);
    assert.equal(harness.commands.length, 2);
  } finally {
    harness.restore();
  }
});

test("director command service will not enqueue takeover after its task was superseded", async () => {
  const harness = createHarness(createTask(), null, {
    afterStart(task) {
      task.status = "cancelled";
    },
  });
  try {
    await assert.rejects(
      harness.service.enqueueTakeoverCommand({
        novelId: "novel-1",
        strategy: "continue_existing",
      }),
      /任务已被替换或已结束/,
    );

    assert.equal(harness.commands.length, 0);
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

test("chapter title repair rejects a concurrent manual pause without leaving an accepted command", async () => {
  const harness = createHarness(createTask({
    status: "failed",
    pendingManualRecovery: false,
  }), null, {
    preserveConcurrentPause: true,
    afterCommandCreate({ task }) {
      task.pendingManualRecovery = true;
    },
  });
  try {
    await assert.rejects(
      harness.service.enqueueChapterTitleRepairCommand("task-1"),
      (error) => error.details?.code === "DIRECTOR_MANUAL_RECOVERY_REQUIRED",
    );
    assert.equal(harness.commands.length, 0);
    assert.equal(harness.task.pendingManualRecovery, true);
    assert.equal(harness.task.status, "failed");
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
  const harness = createHarness(createTask(),null,{generationJobs:[
    {id:'own-job',payload:JSON.stringify({workflowTaskId:'task-1'})},
    {id:'v2-job',payload:JSON.stringify({directorNext:{runId:'run-2'},note:'task-1'})},
    {id:'other-v1-job',payload:JSON.stringify({workflowTaskId:'other-task',note:'task-1'})},
  ]});
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
    assert.deepEqual(harness.jobUpdates[0].where.id, {in:['own-job']},'cancellation cannot touch V2 or another V1 task');
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

test("director command stale recovery reattaches to a linked pipeline without spending another command retry", async () => {
  const task = createTask({
    status: "running",
    pendingManualRecovery: false,
    lastError: null,
    seedPayloadJson: JSON.stringify({
      issueGovernanceVersion: 1,
      issuePolicy: { maxAutomaticRetries: 1, issueActions: {} },
      issuePolicySource: "global",
      runMode: "full_book_autopilot",
      autoExecution: { pipelineJobId: "job-1" },
    }),
  });
  const harness = createHarness(task, {
    id: "job-1",
    novelId: "novel-1",
    status: "running",
    pendingManualRecovery: false,
    cancelRequestedAt: null,
    error: null,
    payload: JSON.stringify({ workflowTaskId: "task-1" }),
  });
  try {
    await harness.service.enqueueContinueCommand("task-1");
    harness.commands[0].status = "running";
    harness.commands[0].leaseOwner = "worker-a";
    harness.commands[0].attempt = 2;
    harness.commands[0].leaseExpiresAt = new Date("2026-04-29T12:00:00.000Z");

    const count = await harness.service.recoverStaleLeases(new Date("2026-04-29T12:01:00.000Z"));

    assert.equal(count, 1);
    assert.equal(harness.commands[0].status, "queued");
    assert.equal(harness.commands[0].attempt, 2);
    assert.equal(harness.requeued.length, 0);
    assert.equal(harness.task.pendingManualRecovery, false);
  } finally {
    harness.restore();
  }
});

test("director command stale recovery pauses when a declared pipeline job is missing", async () => {
  const task = createTask({
    status: "running",
    pendingManualRecovery: false,
    lastError: null,
    seedPayloadJson: JSON.stringify({
      issueGovernanceVersion: 1,
      issuePolicy: { maxAutomaticRetries: 1, issueActions: {} },
      issuePolicySource: "global",
      runMode: "full_book_autopilot",
      autoExecution: { pipelineJobId: "missing-job" },
    }),
  });
  const harness = createHarness(task);
  try {
    await harness.service.enqueueContinueCommand("task-1");
    harness.commands[0].status = "running";
    harness.commands[0].leaseOwner = "worker-a";
    harness.commands[0].attempt = 1;
    harness.commands[0].leaseExpiresAt = new Date("2026-04-29T12:00:00.000Z");

    await harness.service.recoverStaleLeases(new Date("2026-04-29T12:01:00.000Z"));

    assert.equal(harness.commands[0].status, "stale");
    assert.equal(harness.commands[0].leaseOwner, null);
    assert.equal(harness.task.pendingManualRecovery, true);
    assert.match(harness.task.lastError, /避免重复调用/);
    assert.equal(harness.requeued.length, 1);
  } finally {
    harness.restore();
  }
});

test("director command stale recovery preserves a linked pipeline manual pause", async () => {
  const task = createTask({
    status: "running",
    pendingManualRecovery: false,
    lastError: null,
    seedPayloadJson: JSON.stringify({
      issueGovernanceVersion: 1,
      issuePolicy: { maxAutomaticRetries: 1, issueActions: {} },
      issuePolicySource: "global",
      runMode: "full_book_autopilot",
      autoExecution: { pipelineJobId: "job-1" },
    }),
  });
  const harness = createHarness(task, {
    id: "job-1",
    novelId: "novel-1",
    status: "queued",
    pendingManualRecovery: true,
    cancelRequestedAt: null,
    error: "第 7 章需要人工确认。",
    payload: JSON.stringify({ workflowTaskId: "task-1" }),
  });
  try {
    await harness.service.enqueueContinueCommand("task-1");
    harness.commands[0].status = "running";
    harness.commands[0].leaseOwner = "worker-a";
    harness.commands[0].attempt = 1;
    harness.commands[0].leaseExpiresAt = new Date("2026-04-29T12:00:00.000Z");

    await harness.service.recoverStaleLeases(new Date("2026-04-29T12:01:00.000Z"));

    assert.equal(harness.commands[0].status, "stale");
    assert.equal(harness.commands[0].leaseOwner, null);
    assert.equal(harness.task.pendingManualRecovery, true);
    assert.equal(harness.task.lastError, "第 7 章需要人工确认。");
    assert.deepEqual(harness.requeued, [{ taskId: "task-1", message: "第 7 章需要人工确认。" }]);
  } finally {
    harness.restore();
  }
});

test("director command stale recovery never clears an existing task manual pause", async () => {
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
    harness.task.pendingManualRecovery = true;
    harness.task.lastError = "质量优先策略等待人工恢复。";

    await harness.service.recoverStaleLeases(new Date("2026-04-29T12:01:00.000Z"));

    assert.equal(harness.commands[0].status, "stale");
    assert.equal(harness.task.pendingManualRecovery, true);
    assert.equal(harness.task.lastError, "质量优先策略等待人工恢复。");
    assert.equal(harness.requeued.length, 0);
  } finally {
    harness.restore();
  }
});

test("director command stale recovery pauses when linked pipeline state cannot be verified", async () => {
  const task = createTask({
    status: "running",
    pendingManualRecovery: false,
    seedPayloadJson: JSON.stringify({
      issueGovernanceVersion: 1,
      issuePolicy: { maxAutomaticRetries: 1, issueActions: {} },
      autoExecution: { pipelineJobId: "job-1" },
    }),
  });
  const harness = createHarness(task);
  try {
    await harness.service.enqueueContinueCommand("task-1");
    harness.commands[0].status = "running";
    harness.commands[0].leaseOwner = "worker-a";
    harness.commands[0].attempt = 1;
    harness.commands[0].leaseExpiresAt = new Date("2026-04-29T12:00:00.000Z");
    prisma.generationJob.findUnique = async () => { throw new Error("database unavailable"); };

    await harness.service.recoverStaleLeases(new Date("2026-04-29T12:01:00.000Z"));

    assert.equal(harness.commands[0].status, "stale");
    assert.equal(harness.task.pendingManualRecovery, true);
    assert.match(harness.task.lastError, /避免重复调用/);
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

test("director command stale recovery applies the task policy instead of only recording it", async () => {
  const task = createTask({
    status: "running",
    pendingManualRecovery: false,
    seedPayloadJson: JSON.stringify({
      issueGovernanceVersion: 1,
      issuePolicy: {
        issueActions: { "runtime.worker_stale": "fail_task" },
      },
      issuePolicySource: "novel",
      runMode: "full_book_autopilot",
    }),
  });
  const harness = createHarness(task);
  const originalReportIssue = directorIssueService.reportIssue;
  let reportedPolicy = null;
  directorIssueService.reportIssue = async (input) => {
    reportedPolicy = input.policy;
    await input.applyAction({
      issueCode: input.issueCode,
      action: "fail_task",
      reason: "本书规则要求结束任务",
      locked: false,
      policySource: "novel",
      retryExhaustedAction: "pause_for_manual",
    });
    assert.equal(harness.commands[0].status, "failed");
    assert.equal(harness.task.status, "failed");
  };
  try {
    await harness.service.enqueueContinueCommand("task-1");
    harness.commands[0].status = "running";
    harness.commands[0].leaseOwner = "worker-a";
    harness.commands[0].attempt = 1;
    harness.commands[0].leaseExpiresAt = new Date("2026-04-29T12:00:00.000Z");
    await harness.service.recoverStaleLeases(new Date("2026-04-29T12:01:00.000Z"));
    assert.equal(reportedPolicy.issueActions["runtime.worker_stale"], "fail_task");
    assert.equal(harness.commands[0].status, "failed");
    assert.equal(harness.task.status, "failed");
    assert.equal(harness.task.pendingManualRecovery, false);
    assert.equal(harness.requeued.length, 0);
  } finally {
    directorIssueService.reportIssue = originalReportIssue;
    harness.restore();
  }
});

test("director command service applies the single governance retry budget to full-book stale leases", async () => {
  const harness = createHarness(createTask({
    novelId: null,
    status: "running",
    pendingManualRecovery: false,
    lastError: null,
    seedPayloadJson: JSON.stringify({
      issueGovernanceVersion: 1,
      issuePolicy: { maxAutomaticRetries: 1, issueActions: {} },
      issuePolicySource: "global",
      runMode: "auto_to_execution",
    }),
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
    assert.equal(harness.commands[0].status, "stale");
    assert.equal(harness.requeued.length, 1);
    assert.equal(harness.task.status, "queued");
    assert.equal(harness.task.pendingManualRecovery, true);
  } finally {
    harness.restore();
  }
});

test("director command service applies the single governance retry budget to full-book stale leases from an existing full-book launch", async () => {
  const harness = createHarness(createTask({
    novelId: null,
    status: "running",
    pendingManualRecovery: false,
    lastError: null,
    seedPayloadJson: JSON.stringify({
      issueGovernanceVersion: 1,
      issuePolicy: { maxAutomaticRetries: 1, issueActions: {} },
      issuePolicySource: "global",
      runMode: "full_book_autopilot",
    }),
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
    assert.equal(harness.commands[0].status, "stale");
    assert.equal(harness.requeued.length, 1);
    assert.equal(harness.task.status, "queued");
    assert.equal(harness.task.pendingManualRecovery, true);
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

test("non-recovery director commands cannot clear the manual recovery lock by default", async () => {
  const harness = createHarness(createTask({
    status: "queued",
    pendingManualRecovery: true,
    lastError: "等待用户恢复。",
  }));
  try {
    await assert.rejects(
      harness.service.enqueueChapterTitleRepairCommand("task-1"),
      (error) => error.details?.code === "DIRECTOR_MANUAL_RECOVERY_REQUIRED",
    );

    assert.equal(harness.commands.length, 0);
    assert.equal(harness.task.status, "queued");
    assert.equal(harness.task.pendingManualRecovery, true);
    assert.equal(harness.task.lastError, "等待用户恢复。");
    assert.equal(harness.taskUpdates.length, 0);
  } finally {
    harness.restore();
  }
});

test("repeat confirm command preserves an attached launch and reuses its active command", async () => {
  const harness = createHarness(createTask({ novelId: null }));
  try {
    const request = createConfirmRequest();
    const first = await harness.service.enqueueConfirmCandidateCommand(request);
    harness.task.novelId = "novel-created";
    const frozen = harness.task.seedPayloadJson;
    const second = await harness.service.enqueueConfirmCandidateCommand(request);
    assert.equal(second.commandId, first.commandId);
    assert.equal(harness.commands.length, 1);
    assert.equal(harness.task.novelId, "novel-created");
    assert.equal(harness.task.seedPayloadJson, frozen);
    assert.equal(harness.bootstraps.length, 1);
  } finally {
    harness.restore();
  }
});

test("repeat confirm command preserves the creation claim and resolved unbound contract", async () => {
  const harness = createHarness(createTask({ novelId: null }));
  try {
    const request = createConfirmRequest();
    const first = await harness.service.enqueueConfirmCandidateCommand(request);
    harness.commands[0].status = "running";
    harness.commands[0].leaseExpiresAt = new Date(Date.now() + 60_000);
    harness.task.status = "running";
    harness.task.currentItemKey = "novel_create";
    const resolved = JSON.parse(harness.task.seedPayloadJson);
    resolved.directorInput.genreId = "resolved-genre";
    harness.task.seedPayloadJson = JSON.stringify(resolved);
    const frozen = harness.task.seedPayloadJson;
    const second = await harness.service.enqueueConfirmCandidateCommand(request);
    assert.equal(second.commandId, first.commandId);
    assert.equal(harness.commands.length, 1);
    assert.equal(harness.task.seedPayloadJson, frozen);
    assert.equal(harness.task.currentItemKey, "novel_create");
    assert.equal(harness.task.status, "running");
    assert.equal(harness.bootstraps.length, 1);
  } finally {
    harness.restore();
  }
});
