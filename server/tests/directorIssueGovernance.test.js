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
const { directorIssueService } = require("../dist/services/novel/director/issues/DirectorIssueService.js");
const { directorAutomationLedgerEventService } = require("../dist/services/novel/director/runtime/DirectorAutomationLedgerEventService.js");

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

test("full-book autopilot never lets a preset stop on usable local quality output", () => {
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
  assert.equal(qualityDecision.action, "continue_with_warning");
  assert.equal(qualityDecision.locked, true);
  assert.equal(qualityDecision.policySource, "safety");

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

test("both presets keep the automatic repair budget below two attempts", () => {
  for (const preset of DIRECTOR_ISSUE_POLICY_PRESETS) {
    assert.equal(preset.policy.maxAutomaticRetries, 1, preset.id);
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
