const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  DEFAULT_DIRECTOR_ISSUE_POLICY,
  DIRECTOR_CONFIGURABLE_ISSUE_CATALOG,
  DIRECTOR_ISSUE_ACTIONS,
  DIRECTOR_ISSUE_CATALOG,
  directorIssuePolicyOverrideSchema,
  directorIssuePolicySchema,
  resolveDirectorIssueDecision,
} = require("../../shared/dist/types/directorIssue.js");
const {
  DirectorIssueService,
  DirectorIssueActionInterrupt,
  directorIssueService,
} = require("../dist/services/novel/director/issues/DirectorIssueService.js");
const {
  DirectorIssuePolicyService,
} = require("../dist/services/novel/director/issues/DirectorIssuePolicyService.js");
const {
  loadDirectorIssueTaskContext,
} = require("../dist/services/novel/director/issues/DirectorIssueTaskContext.js");
const {
  applyPipelineIssueInterrupt,
} = require("../dist/services/novel/production/issueGovernance/PipelineIssueGovernance.js");
const {
  applyChapterQualityClosure,
} = require("../dist/services/novel/production/qualityClosure/ChapterQualityClosure.js");
const {
  buildDirectorWorkflowSeedPayload,
} = require("../dist/services/novel/director/runtime/novelDirectorHelpers.js");
const {
  directorAutomationLedgerEventService,
} = require("../dist/services/novel/director/runtime/DirectorAutomationLedgerEventService.js");
const { prisma } = require("../dist/db/prisma.js");

function occurrence(issueCode, patch = {}) {
  return {
    issueCode,
    riskScore: null,
    attempt: 0,
    maxAttempts: 1,
    hasUsableOutput: true,
    runMode: "full_book_autopilot",
    ...patch,
  };
}

test("every stable issue code has one valid default policy", () => {
  assert.equal(DIRECTOR_ISSUE_CATALOG.length, 23);
  for (const entry of DIRECTOR_ISSUE_CATALOG) {
    assert.ok(entry.allowedActions.includes(entry.defaultAction), entry.code);
    assert.deepEqual([...entry.allowedActions].sort(), [...DIRECTOR_ISSUE_ACTIONS].sort(), entry.code);
    assert.notEqual(entry.exhaustedAction, "auto_retry", entry.code);
    for (const action of DIRECTOR_ISSUE_ACTIONS) {
      assert.equal(directorIssuePolicySchema.safeParse({
        noticeThreshold: 5,
        pauseThreshold: 8,
        issueActions: { [entry.code]: action },
      }).success, true, `${entry.code}:${action}:global`);
      assert.equal(directorIssuePolicyOverrideSchema.safeParse({
        issueActions: { [entry.code]: action },
      }).success, true, `${entry.code}:${action}:novel`);
    }
  }
});

test("user overrides are accepted while runtime safety actions remain enforced", () => {
  for (const entry of DIRECTOR_ISSUE_CATALOG.filter((candidate) => candidate.enforcedAction)) {
    for (const requestedAction of DIRECTOR_ISSUE_ACTIONS.filter((action) => action !== entry.enforcedAction)) {
      const decision = resolveDirectorIssueDecision({
        occurrence: occurrence(entry.code, { hasUsableOutput: entry.code !== "generation.output_unusable" }),
        policy: { ...DEFAULT_DIRECTOR_ISSUE_POLICY, issueActions: { [entry.code]: requestedAction } },
        policySource: "novel",
      });
      assert.equal(decision.action, entry.enforcedAction, `${entry.code}:${requestedAction}`);
      assert.equal(decision.locked, true, `${entry.code}:${requestedAction}`);
      assert.equal(decision.policySource, "safety", `${entry.code}:${requestedAction}`);
      assert.ok(decision.reason, `${entry.code}:${requestedAction}`);
    }
  }
});

test("local quality debt cannot pause a full-book run with usable content", () => {
  const policy = {
    ...DEFAULT_DIRECTOR_ISSUE_POLICY,
    issueActions: { "quality.loop_exhausted": "fail_task" },
  };
  const decision = resolveDirectorIssueDecision({
    occurrence: occurrence("quality.loop_exhausted"),
    policy,
    policySource: "novel",
  });
  assert.equal(decision.action, "continue_with_warning");
  assert.equal(decision.locked, true);
});

test("explicit replans and data safety issues remain locked", () => {
  for (const code of ["quality.replan_required", "runtime.token_budget_exceeded", "runtime.data_integrity"]) {
    const decision = resolveDirectorIssueDecision({ occurrence: occurrence(code), policy: DEFAULT_DIRECTOR_ISSUE_POLICY });
    assert.equal(decision.action, "pause_for_manual", code);
    assert.equal(decision.policySource, "safety", code);
  }
});

test("warning cannot continue when no usable output exists", () => {
  const decision = resolveDirectorIssueDecision({
    occurrence: occurrence("generation.empty_content", { hasUsableOutput: false }),
    policy: {
      ...DEFAULT_DIRECTOR_ISSUE_POLICY,
      issueActions: { "generation.empty_content": "continue_with_warning" },
    },
    policySource: "novel",
  });
  assert.equal(decision.action, "fail_task");
  assert.equal(decision.locked, true);
  assert.equal(decision.policySource, "safety");
});

test("retry uses the catalog fallback after its budget is exhausted", () => {
  const decision = resolveDirectorIssueDecision({
    occurrence: occurrence("generation.empty_content", { hasUsableOutput: false, attempt: 1, maxAttempts: 1 }),
    policy: DEFAULT_DIRECTOR_ISSUE_POLICY,
  });
  assert.equal(decision.action, "fail_task");
});

test("risk score reaches the frozen pause threshold", () => {
  const decision = resolveDirectorIssueDecision({
    occurrence: occurrence("runtime.service_unavailable", { riskScore: 8 }),
    policy: DEFAULT_DIRECTOR_ISSUE_POLICY,
  });
  assert.equal(decision.action, "pause_for_manual");
  assert.match(decision.reason, /暂停阈值/);
});

test("explicit task policy remains ahead of score thresholds", () => {
  const decision = resolveDirectorIssueDecision({
    occurrence: occurrence("runtime.service_unavailable", { riskScore: 8 }),
    policy: {
      ...DEFAULT_DIRECTOR_ISSUE_POLICY,
      issueActions: { "runtime.service_unavailable": "auto_retry" },
    },
    policySource: "novel",
  });
  assert.equal(decision.action, "auto_retry");
  assert.equal(decision.policySource, "novel");
});

test("every user-configurable issue is connected to an executing runtime boundary", () => {
  const runtimeSource = [
    "../src/services/novel/production/NovelPipelineExecutor.ts",
    "../src/services/novel/production/qualityClosure/ChapterQualityClosure.ts",
    "../src/services/novel/director/automation/novelDirectorAutoExecutionCircuitBreakerRuntime.ts",
    "../src/services/novel/director/commands/leases/DirectorCommandLeaseService.ts",
  ].map((file) => fs.readFileSync(path.resolve(__dirname, file), "utf8")).join("\n");
  for (const entry of DIRECTOR_CONFIGURABLE_ISSUE_CATALOG) {
    assert.equal(entry.enforcedAction, undefined, `${entry.code}: enforced actions are not user preferences`);
    assert.match(runtimeSource, new RegExp(entry.code.replace(".", "\\.")), entry.code);
  }
});

test("issue governance records a decision without claiming that an unhandled action ran", async () => {
  const originalRecordEvent = directorAutomationLedgerEventService.recordEvent;
  const events = [];
  directorAutomationLedgerEventService.recordEvent = async (event) => {
    events.push(event);
    return event;
  };
  try {
    const service = new DirectorIssueService();
    await service.reportIssue({
      issueGovernanceVersion: 1,
      taskId: "task-decision-only",
      novelId: "novel-1",
      issueCode: "runtime.data_integrity",
      stage: "chapter_state_commit",
      summary: "章节状态无法安全提交。",
      hasUsableOutput: true,
      fingerprint: "data-integrity-1",
      policy: DEFAULT_DIRECTOR_ISSUE_POLICY,
    });
    assert.deepEqual(events.map((event) => event.type), ["issue_detected", "issue_decided"]);
  } finally {
    directorAutomationLedgerEventService.recordEvent = originalRecordEvent;
  }
});

test("issue governance records applied only after the action handler succeeds", async () => {
  const originalRecordEvent = directorAutomationLedgerEventService.recordEvent;
  const events = [];
  let applied = false;
  directorAutomationLedgerEventService.recordEvent = async (event) => {
    events.push(event);
    return event;
  };
  try {
    const service = new DirectorIssueService();
    await service.reportIssue({
      issueGovernanceVersion: 1,
      taskId: "task-action-applied",
      novelId: "novel-1",
      issueCode: "runtime.data_integrity",
      stage: "chapter_state_commit",
      summary: "章节状态无法安全提交。",
      hasUsableOutput: true,
      fingerprint: "data-integrity-2",
      policy: DEFAULT_DIRECTOR_ISSUE_POLICY,
      applyAction: async ({ decision }) => {
        assert.equal(decision.action, "pause_for_manual");
        applied = true;
      },
    });
    assert.equal(applied, true);
    assert.deepEqual(events.map((event) => event.type), [
      "issue_detected",
      "issue_decided",
      "issue_action_applied",
    ]);
  } finally {
    directorAutomationLedgerEventService.recordEvent = originalRecordEvent;
  }
});

test("pipeline governance interruption persists pause and fail actions before recording applied", async () => {
  const originalUpdateMany = prisma.novelWorkflowTask.updateMany;
  const originalRecordActionApplied = directorIssueService.recordActionApplied;
  const writes = [];
  const applied = [];
  prisma.novelWorkflowTask.updateMany = async (input) => {
    writes.push(input.data);
    return { count: 1 };
  };
  directorIssueService.recordActionApplied = async (input) => applied.push(input.result.decision.action);
  const buildInterrupt = (action) => new DirectorIssueActionInterrupt({
    occurrence: {
      schemaVersion: 1,
      issueCode: action === "fail_task" ? "generation.output_unusable" : "runtime.data_integrity",
      stage: "chapter_execution",
      summary: "需要按治理动作停止。",
      attempt: 1,
      maxAttempts: 1,
      hasUsableOutput: false,
      fingerprint: `pipeline-${action}`,
      occurredAt: new Date().toISOString(),
    },
    decision: {
      issueCode: action === "fail_task" ? "generation.output_unusable" : "runtime.data_integrity",
      action,
      reason: "测试治理动作",
      locked: true,
      policySource: "safety",
      retryExhaustedAction: action,
    },
  });
  try {
    assert.equal(await applyPipelineIssueInterrupt({
      error: buildInterrupt("pause_for_manual"),
      workflowTaskId: "task-pause",
      novelId: "novel-1",
    }), true);
    assert.equal(await applyPipelineIssueInterrupt({
      error: buildInterrupt("fail_task"),
      workflowTaskId: "task-fail",
      novelId: "novel-1",
    }), true);
    assert.deepEqual(writes.map((write) => [write.status, write.pendingManualRecovery]), [
      ["queued", true],
      ["failed", false],
    ]);
    assert.deepEqual(applied, ["pause_for_manual", "fail_task"]);
  } finally {
    prisma.novelWorkflowTask.updateMany = originalUpdateMany;
    directorIssueService.recordActionApplied = originalRecordActionApplied;
  }
});

test("explicit replan governance stops the chapter loop while preserving the replan checkpoint payload", async () => {
  const originalReportIssue = directorIssueService.reportIssue;
  const replanAlertDetails = [];
  directorIssueService.reportIssue = async (input) => {
    const result = {
      occurrence: {
        schemaVersion: 1,
        issueCode: input.issueCode,
        stage: input.stage,
        summary: input.summary,
        attempt: 0,
        maxAttempts: 0,
        hasUsableOutput: true,
        fingerprint: input.fingerprint,
        occurredAt: new Date().toISOString(),
      },
      decision: {
        issueCode: input.issueCode,
        action: "pause_for_manual",
        reason: "明确重规划必须暂停",
        locked: true,
        policySource: "safety",
        retryExhaustedAction: "pause_for_manual",
      },
    };
    await input.applyAction(result);
    return result;
  };
  try {
    const result = await applyChapterQualityClosure({
      governance: {
        novelId: "novel-1",
        issueGovernanceVersion: 1,
        policy: DEFAULT_DIRECTOR_ISSUE_POLICY,
        runMode: "full_book_autopilot",
        policySource: "task_snapshot",
      },
      workflowTaskId: "task-replan",
      novelId: "novel-1",
      jobId: "job-replan",
      chapter: { id: "chapter-8", order: 8 },
      chapterResult: {
        retryCountUsed: 0,
        score: { coherence: 80, repetition: 80, pacing: 80, voice: 80, engagement: 80, overall: 80 },
        issues: [],
        pass: true,
        reviewExecuted: false,
        runtimePackage: {
          replanRecommendation: {
            recommended: true,
            action: "stop_for_replan",
            reason: "后续章节路线需要重排",
            triggerReason: "结构化审校要求重规划",
            anchorChapterOrder: 8,
          },
        },
      },
      qualityThreshold: 75,
      runtimePayload: { provider: "deepseek", model: "deepseek-chat", temperature: 0.8, autoReview: false },
      qualityAlertDetails: [],
      replanAlertDetails,
      recoverableRepairDetails: [],
    });
    assert.equal(result.shouldStopAfterCurrentChapter, true);
    assert.equal(replanAlertDetails.length, 1);
    assert.match(replanAlertDetails[0], /需要重规划/);
  } finally {
    directorIssueService.reportIssue = originalReportIssue;
  }
});

test("saved novel issue policy is frozen into the workflow seed and recoverable as task context", async () => {
  const originals = {
    appFindUnique: prisma.appSetting.findUnique,
    appFindMany: prisma.appSetting.findMany,
    appUpsert: prisma.appSetting.upsert,
    transaction: prisma.$transaction,
    novelFindUnique: prisma.novel.findUnique,
    novelUpdateMany: prisma.novel.updateMany,
    taskFindUnique: prisma.novelWorkflowTask.findUnique,
  };
  const settings = new Map();
  const novel = {
    directorIssuePolicyOverridesJson: null,
    directorRiskNoticeThreshold: null,
    directorRiskPauseThreshold: null,
  };
  let taskSeed = null;
  prisma.appSetting.findUnique = async ({ where }) => settings.has(where.key)
    ? { key: where.key, value: settings.get(where.key) }
    : null;
  prisma.appSetting.findMany = async ({ where }) => where.key.in
    .filter((key) => settings.has(key))
    .map((key) => ({ key, value: settings.get(key) }));
  prisma.appSetting.upsert = async ({ where, update }) => {
    settings.set(where.key, update.value);
    return { key: where.key, value: update.value };
  };
  prisma.$transaction = async (operations) => Promise.all(operations);
  prisma.novel.findUnique = async () => novel;
  prisma.novel.updateMany = async ({ data }) => {
    Object.assign(novel, data);
    return { count: 1 };
  };
  prisma.novelWorkflowTask.findUnique = async () => ({ novelId: "novel-1", seedPayloadJson: taskSeed });
  try {
    const service = new DirectorIssuePolicyService();
    await service.saveGlobalPolicy({
      noticeThreshold: 6,
      pauseThreshold: 8,
      issueActions: { "runtime.worker_stale": "fail_task" },
    });
    const saved = await service.saveNovelOverride("novel-1", {
      noticeThreshold: 4,
      issueActions: { "runtime.worker_stale": "pause_for_manual" },
    });
    const request = {
      idea: "一个新人开始完成第一部长篇小说",
      candidate: { id: "candidate-1", workingTitle: "第一本小说", titleOptions: [] },
      runMode: "full_book_autopilot",
      issueGovernanceVersion: 1,
      issuePolicy: saved.effectivePolicy,
      issuePolicySource: saved.source,
    };
    taskSeed = JSON.stringify(buildDirectorWorkflowSeedPayload(request, "novel-1"));
    const context = await loadDirectorIssueTaskContext("task-1");
    assert.equal(context.policy.noticeThreshold, 4);
    assert.equal(context.policy.pauseThreshold, 8);
    assert.equal(context.policy.issueActions["runtime.worker_stale"], "pause_for_manual");
    assert.equal(context.policySource, "novel");
    assert.equal(context.runMode, "full_book_autopilot");
  } finally {
    prisma.appSetting.findUnique = originals.appFindUnique;
    prisma.appSetting.findMany = originals.appFindMany;
    prisma.appSetting.upsert = originals.appUpsert;
    prisma.$transaction = originals.transaction;
    prisma.novel.findUnique = originals.novelFindUnique;
    prisma.novel.updateMany = originals.novelUpdateMany;
    prisma.novelWorkflowTask.findUnique = originals.taskFindUnique;
  }
});
