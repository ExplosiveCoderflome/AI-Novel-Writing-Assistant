const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_DIRECTOR_ISSUE_POLICY,
  DIRECTOR_ISSUE_ACTIONS,
  DIRECTOR_ISSUE_CATALOG,
  directorIssuePolicyOverrideSchema,
  directorIssuePolicySchema,
  resolveDirectorIssueDecision,
} = require("../../shared/dist/types/directorIssue.js");

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
