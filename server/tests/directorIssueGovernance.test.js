const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_DIRECTOR_ISSUE_POLICY,
  DIRECTOR_ISSUE_ACTIONS,
  DIRECTOR_ISSUE_CATALOG,
  DIRECTOR_ISSUE_POLICY_PRESETS,
  directorIssuePolicyOverrideSchema,
  directorIssuePolicySchema,
  resolveDirectorIssueDecision,
} = require("../../shared/dist/types/directorIssue.js");
const promptRunner = require("../dist/prompting/core/promptRunner.js");
const { prisma } = require("../dist/db/prisma.js");
const { directorIssueService } = require("../dist/services/novel/director/issues/DirectorIssueService.js");
const { directorIssuePolicyService } = require("../dist/services/novel/director/issues/DirectorIssuePolicyService.js");
const { loadDirectorIssueTaskContext } = require("../dist/services/novel/director/issues/DirectorIssueTaskContext.js");
const { directorAutomationLedgerEventService } = require("../dist/services/novel/director/runtime/DirectorAutomationLedgerEventService.js");
const {
  applyChapterQualityClosure,
} = require("../dist/services/novel/production/qualityClosure/ChapterQualityClosure.js");
const {
  reportPipelineIssue,
  resolvePipelineRuntimeIssueCode,
} = require("../dist/services/novel/production/issueGovernance/PipelineIssueGovernance.js");

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

test("provider payment-required errors are classified without another LLM call", () => {
  assert.equal(resolvePipelineRuntimeIssueCode({ status: 402 }), "runtime.model_unavailable");
  assert.equal(resolvePipelineRuntimeIssueCode(new Error("402 Insufficient Balance")), "runtime.unclassified");
});

test("every stable issue code has one valid default policy", () => {
  assert.ok(DIRECTOR_ISSUE_CATALOG.length > 0);
  for (const entry of DIRECTOR_ISSUE_CATALOG) {
    assert.ok(entry.allowedActions.includes(entry.defaultAction), entry.code);
    assert.deepEqual([...entry.allowedActions].sort(), [...DIRECTOR_ISSUE_ACTIONS].sort(), entry.code);
    assert.notEqual(entry.exhaustedAction, "auto_retry", entry.code);
    for (const action of DIRECTOR_ISSUE_ACTIONS) {
      assert.equal(directorIssuePolicySchema.safeParse({
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

test("issue policy presets remain authoritative in full-book autopilot", () => {
  const finishFullBook = DIRECTOR_ISSUE_POLICY_PRESETS.find((preset) => preset.id === "finish_full_book");
  const qualityFirst = DIRECTOR_ISSUE_POLICY_PRESETS.find((preset) => preset.id === "quality_first");
  assert.ok(finishFullBook);
  assert.ok(qualityFirst);

  const fullBookDecision = resolveDirectorIssueDecision({
    occurrence: occurrence("quality.loop_exhausted"),
    policy: finishFullBook.policy,
    policySource: "novel",
  });
  const qualityDecision = resolveDirectorIssueDecision({
    occurrence: occurrence("quality.loop_exhausted"),
    policy: qualityFirst.policy,
    policySource: "novel",
  });
  assert.equal(fullBookDecision.action, "continue_with_warning");
  assert.equal(qualityDecision.action, "pause_for_manual");
  assert.equal(qualityDecision.locked, false);
  assert.equal(qualityDecision.policySource, "novel");

  const manualQualityDecision = resolveDirectorIssueDecision({
    occurrence: occurrence("quality.loop_exhausted", { runMode: "stage_review" }),
    policy: qualityFirst.policy,
    policySource: "novel",
  });
  assert.equal(manualQualityDecision.action, "pause_for_manual");
  assert.equal(manualQualityDecision.locked, false);
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

test("the policy owns the single automatic retry budget", () => {
  const decision = resolveDirectorIssueDecision({
    occurrence: occurrence("runtime.service_unavailable", { attempt: 1, maxAttempts: 9 }),
    policy: { ...DEFAULT_DIRECTOR_ISSUE_POLICY, maxAutomaticRetries: 1 },
  });
  assert.equal(decision.action, "pause_for_manual");
});

test("legacy director tasks reconcile to the current policy while valid snapshots stay immutable", async () => {
  const originalTaskFindUnique = prisma.novelWorkflowTask.findUnique;
  const originalGetNovelPolicy = directorIssuePolicyService.getNovelPolicy;
  const originalGetGlobalPolicy = directorIssuePolicyService.getGlobalPolicy;
  const calls = [];
  const snapshotPolicy = {
    ...DEFAULT_DIRECTOR_ISSUE_POLICY,
    issueActions: { "runtime.worker_stale": "pause_for_manual" },
  };
  const currentNovelPolicy = {
    ...DEFAULT_DIRECTOR_ISSUE_POLICY,
    issueActions: { "runtime.worker_stale": "auto_retry" },
  };
  prisma.novelWorkflowTask.findUnique = async ({ where }) => where.id === "missing"
    ? null
    : ({
      novelId: where.id === "legacy-orphan" ? null : "novel-1",
      seedPayloadJson: where.id === "snapshotted"
        ? JSON.stringify({
          issueGovernanceVersion: 1,
          issuePolicy: snapshotPolicy,
          issuePolicySource: "novel",
          runMode: "full_book_autopilot",
        })
        : where.id === "legacy-malformed"
          ? "{"
          : JSON.stringify({ runMode: "stage_review" }),
    });
  directorIssuePolicyService.getNovelPolicy = async (novelId) => {
    calls.push(["novel", novelId]);
    return { effectivePolicy: currentNovelPolicy, override: null, source: "novel" };
  };
  directorIssuePolicyService.getGlobalPolicy = async () => {
    calls.push(["global"]);
    return DEFAULT_DIRECTOR_ISSUE_POLICY;
  };

  try {
    const snapshotted = await loadDirectorIssueTaskContext("snapshotted");
    assert.deepEqual(snapshotted.policy, snapshotPolicy);
    assert.equal(snapshotted.policySource, "novel");
    assert.equal(snapshotted.runMode, "full_book_autopilot");
    assert.deepEqual(calls, []);

    const legacy = await loadDirectorIssueTaskContext("legacy");
    assert.deepEqual(legacy.policy, currentNovelPolicy);
    assert.equal(legacy.policySource, "novel");
    assert.equal(legacy.runMode, "stage_review");

    const orphan = await loadDirectorIssueTaskContext("legacy-orphan");
    assert.deepEqual(orphan.policy, DEFAULT_DIRECTOR_ISSUE_POLICY);
    assert.equal(orphan.policySource, "global");

    const malformed = await loadDirectorIssueTaskContext("legacy-malformed");
    assert.deepEqual(malformed.policy, currentNovelPolicy);
    assert.equal(malformed.runMode, undefined);
    assert.equal(await loadDirectorIssueTaskContext("missing"), null);
    assert.deepEqual(calls, [["novel", "novel-1"], ["global"], ["novel", "novel-1"]]);
  } finally {
    prisma.novelWorkflowTask.findUnique = originalTaskFindUnique;
    directorIssuePolicyService.getNovelPolicy = originalGetNovelPolicy;
    directorIssuePolicyService.getGlobalPolicy = originalGetGlobalPolicy;
  }
});

test("both presets keep the automatic repair budget below two attempts", () => {
  for (const preset of DIRECTOR_ISSUE_POLICY_PRESETS) {
    assert.equal(preset.policy.maxAutomaticRetries, 1, preset.id);
    assert.deepEqual(
      Object.keys(preset.policy.issueActions).sort(),
      DIRECTOR_ISSUE_CATALOG.map((entry) => entry.code).sort(),
      `${preset.id} should explicitly configure every issue`,
    );
  }
});

test("recovery matrix keeps transient failures recoverable and locks safety boundaries", () => {
  const cases = [
    ["runtime.worker_stale", 0, "auto_retry", false],
    ["runtime.worker_stale", 1, "pause_for_manual", false],
    ["runtime.model_unavailable", 0, "auto_retry", false],
    ["runtime.model_unavailable", 1, "pause_for_manual", false],
    ["runtime.persistence_failed", 0, "fail_task", true],
    ["quality.replan_required", 0, "pause_for_manual", true],
  ];

  for (const [issueCode, attempt, expectedAction, expectedLocked] of cases) {
    const decision = resolveDirectorIssueDecision({
      occurrence: occurrence(issueCode, { attempt }),
      policy: DEFAULT_DIRECTOR_ISSUE_POLICY,
    });
    assert.equal(decision.action, expectedAction, issueCode);
    assert.equal(decision.locked, expectedLocked, issueCode);
  }
});

test("quality closure follows the selected preset after one failed repair", async () => {
  const originalRecordEvent = directorAutomationLedgerEventService.recordEvent;
  directorAutomationLedgerEventService.recordEvent = async () => undefined;
  const finishFullBook = DIRECTOR_ISSUE_POLICY_PRESETS.find((preset) => preset.id === "finish_full_book");
  const qualityFirst = DIRECTOR_ISSUE_POLICY_PRESETS.find((preset) => preset.id === "quality_first");
  assert.ok(finishFullBook);
  assert.ok(qualityFirst);

  const runClosure = (preset, runMode) => applyChapterQualityClosure({
    governance: {
      novelId: "novel-preset",
      issueGovernanceVersion: 1,
      policy: preset.policy,
      runMode,
      policySource: "novel",
    },
    workflowTaskId: `task-${preset.id}-${runMode}`,
    novelId: "novel-preset",
    jobId: `job-${preset.id}-${runMode}`,
    chapter: { id: "chapter-1", order: 1 },
    chapterResult: {
      retryCountUsed: 1,
      score: {
        coherence: 70,
        repetition: 80,
        pacing: 75,
        voice: 78,
        engagement: 72,
        overall: 74,
      },
      issues: [],
      pass: false,
      reviewExecuted: false,
      runtimePackage: null,
      recoverableRepairFailure: {
        message: "一次自动修复后仍有局部问题。",
        failureTypes: ["local_patch_failed"],
      },
    },
    qualityThreshold: 75,
    runtimePayload: {
      provider: "deepseek",
      model: "deepseek-chat",
      temperature: 0.7,
      runMode: "fast",
      autoReview: true,
      autoRepair: true,
      skipCompleted: true,
      qualityThreshold: 75,
      repairMode: "light_repair",
    },
    qualityAlertDetails: [],
    replanAlertDetails: [],
    recoverableRepairDetails: [],
    runLocalReplan: async () => {
      throw new Error("local replan must not run for a repair failure");
    },
  });

  try {
    const completionFirst = await runClosure(finishFullBook, "full_book_autopilot");
    assert.equal(completionFirst.shouldStopAfterCurrentChapter, false);
    assert.equal(completionFirst.stopAction, null);

    const qualityFirstAutopilot = await runClosure(qualityFirst, "full_book_autopilot");
    assert.equal(qualityFirstAutopilot.shouldStopAfterCurrentChapter, true);
    assert.equal(qualityFirstAutopilot.stopAction, "pause_for_manual");

    const qualityFirstStaged = await runClosure(qualityFirst, "stage_review");
    assert.equal(qualityFirstStaged.shouldStopAfterCurrentChapter, true);

    const retryConfiguredAtExhaustedBoundary = await runClosure({
      ...finishFullBook,
      id: "retry_exhausted",
      policy: {
        ...finishFullBook.policy,
        issueActions: {
          ...finishFullBook.policy.issueActions,
          "quality.acceptance_unavailable": "auto_retry",
          "quality.local_repair_failed": "auto_retry",
        },
      },
    }, "full_book_autopilot");
    assert.equal(retryConfiguredAtExhaustedBoundary.shouldStopAfterCurrentChapter, false);

    const failConfigured = await runClosure({
      ...finishFullBook,
      id: "fail_after_repair",
      policy: {
        ...finishFullBook.policy,
        issueActions: {
          ...finishFullBook.policy.issueActions,
          "quality.acceptance_unavailable": "fail_task",
          "quality.local_repair_failed": "fail_task",
        },
      },
    }, "stage_review");
    assert.equal(failConfigured.shouldStopAfterCurrentChapter, true);
    assert.equal(failConfigured.stopAction, "fail_task");
  } finally {
    directorAutomationLedgerEventService.recordEvent = originalRecordEvent;
  }
});

test("explicit task policy is not overridden by a risk score", () => {
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

test("AI classification runs only for unclassified runtime issues", async () => {
  const originalRunStructuredPrompt = promptRunner.runStructuredPrompt;
  const originalRecordEvent = directorAutomationLedgerEventService.recordEvent;
  const promptCalls = [];
  promptRunner.runStructuredPrompt = async (input) => {
    promptCalls.push(input);
    return {
      output: {
        issueCode: "runtime.service_unavailable",
        riskScore: 4,
        summary: "创作服务暂时不可用。",
        evidence: "连接请求失败。",
        suggestedAction: "auto_retry",
        canPause: false,
      },
    };
  };
  directorAutomationLedgerEventService.recordEvent = async () => undefined;
  const base = {
    issueGovernanceVersion: 1,
    taskId: "task-ai-classification-boundary",
    novelId: "novel-ai-classification-boundary",
    stage: "chapter_execution",
    summary: "章节运行出现问题。",
    policy: DEFAULT_DIRECTOR_ISSUE_POLICY,
    hasUsableOutput: false,
  };
  try {
    await directorIssueService.reportIssue({
      ...base,
      issueCode: "generation.runtime_failed",
      fingerprint: "known-runtime-failure",
    });
    assert.equal(promptCalls.length, 0);

    const result = await directorIssueService.reportIssue({
      ...base,
      issueCode: "runtime.unclassified",
      fingerprint: "unclassified-runtime-failure",
    });
    assert.equal(promptCalls.length, 1);
    assert.equal(result.occurrence.issueCode, "runtime.service_unavailable");
  } finally {
    promptRunner.runStructuredPrompt = originalRunStructuredPrompt;
    directorAutomationLedgerEventService.recordEvent = originalRecordEvent;
  }
});

test("issue action is recorded only after a real action handler completes", async () => {
  const originalRecordEvent = directorAutomationLedgerEventService.recordEvent;
  const events = [];
  directorAutomationLedgerEventService.recordEvent = async (event) => events.push(event);
  const base = {
    issueGovernanceVersion: 1,
    taskId: "task-action-boundary",
    novelId: "novel-action-boundary",
    issueCode: "quality.replan_required",
    stage: "quality_repair",
    summary: "后续章节必须重规划。",
    fingerprint: "replan:chapter-2",
    policy: DEFAULT_DIRECTOR_ISSUE_POLICY,
  };
  try {
    await directorIssueService.reportIssue(base);
    assert.deepEqual(events.map((event) => event.type), ["issue_detected"]);

    await directorIssueService.reportIssue({
      ...base,
      fingerprint: "replan:chapter-3",
      applyAction: async () => undefined,
    });
    assert.deepEqual(events.slice(-2).map((event) => event.type), ["issue_detected", "issue_action_applied"]);
  } finally {
    directorAutomationLedgerEventService.recordEvent = originalRecordEvent;
  }
});

test("manual chapter pipelines apply the snapshotted issue policy without a director task", async () => {
  const originalRecordEvent = directorAutomationLedgerEventService.recordEvent;
  const ledgerEvents = [];
  let appliedDecision = null;
  directorAutomationLedgerEventService.recordEvent = async (event) => ledgerEvents.push(event);

  try {
    const result = await reportPipelineIssue({
      governance: {
        novelId: "novel-manual",
        issueGovernanceVersion: 1,
        policy: {
          ...DEFAULT_DIRECTOR_ISSUE_POLICY,
          issueActions: {
            "quality.local_repair_failed": "pause_for_manual",
          },
        },
        runMode: "fast",
        policySource: "task_snapshot",
      },
      novelId: "novel-manual",
      jobId: "job-manual",
      issueCode: "quality.local_repair_failed",
      stage: "chapter_repair",
      summary: "局部补丁无法安全应用。",
      chapterId: "chapter-1",
      chapterOrder: 1,
      attempt: 0,
      hasUsableOutput: true,
      applyAction: async (decision) => {
        appliedDecision = decision;
      },
    });

    assert.equal(result.decision.action, "pause_for_manual");
    assert.equal(appliedDecision.action, "pause_for_manual");
    assert.equal(ledgerEvents.length, 0);
  } finally {
    directorAutomationLedgerEventService.recordEvent = originalRecordEvent;
  }
});

test("a failed issue action stays unhandled and propagates to the runtime", async () => {
  const originalRecordEvent = directorAutomationLedgerEventService.recordEvent;
  const events = [];
  directorAutomationLedgerEventService.recordEvent = async (event) => events.push(event);
  try {
    await assert.rejects(
      directorIssueService.reportIssue({
        issueGovernanceVersion: 1,
        taskId: "task-action-failed",
        novelId: "novel-action-failed",
        issueCode: "runtime.persistence_failed",
        stage: "chapter_persistence",
        summary: "正文保存状态无法确认。",
        fingerprint: "persistence:chapter-1",
        policy: DEFAULT_DIRECTOR_ISSUE_POLICY,
        applyAction: async () => {
          throw new Error("task state write failed");
        },
      }),
      /task state write failed/,
    );
    assert.deepEqual(events.map((event) => event.type), ["issue_detected"]);
  } finally {
    directorAutomationLedgerEventService.recordEvent = originalRecordEvent;
  }
});
