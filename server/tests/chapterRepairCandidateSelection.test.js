const test = require("node:test");
const assert = require("node:assert/strict");

const {
  selectChapterRepairCandidate,
} = require("../dist/services/novel/runtime/selection/ChapterRepairCandidateSelection.js");

function runtimePackage(score, options = {}) {
  const issues = options.issues ?? [];
  return {
    audit: {
      score: {
        coherence: score,
        pacing: score,
        repetition: score,
        engagement: score,
        voice: score,
        overall: score,
      },
      openIssues: issues,
      reports: [],
      hasBlockingIssues: options.hasBlockingIssues ?? issues.some((issue) => (
        issue.severity === "high" || issue.severity === "critical"
      )),
    },
    obligationCoverage: {
      status: options.missing?.length ? "unmet" : "satisfied",
      missing: options.missing ?? [],
      summary: "test",
    },
  };
}

function evaluation(content, score, options = {}) {
  return {
    content,
    pass: options.pass ?? false,
    runtimePackage: runtimePackage(score, options),
  };
}

test("selects a repair candidate that passes after the original failed", () => {
  const result = selectChapterRepairCandidate({
    original: evaluation("original", 70),
    candidate: evaluation("candidate", 85, { pass: true }),
  });

  assert.equal(result.selected, "candidate");
  assert.equal(result.reasonCode, "candidate_passed");
  assert.notEqual(result.originalContentHash, result.candidateContentHash);
});

test("retains the original when a higher-scoring candidate adds a severe issue", () => {
  const result = selectChapterRepairCandidate({
    original: evaluation("original", 70),
    candidate: evaluation("candidate", 78, {
      issues: [{ severity: "high", code: "NEW_RISK", evidence: "new risk" }],
    }),
  });

  assert.equal(result.selected, "original");
  assert.equal(result.reasonCode, "original_retained_new_severe_issue");
});

test("does not treat rewritten evidence as a new severe issue", () => {
  const original = evaluation("original", 70, {
    missing: [{ kind: "must_hit_now", summary: "兑现承诺" }],
    issues: [{ id: "issue-1", code: "CHARACTER_CONTINUITY", severity: "high", evidence: "角色伤势与前文冲突" }],
  });
  const candidate = evaluation("candidate", 78, {
    issues: [{ id: "issue-2", code: "CHARACTER_CONTINUITY", severity: "high", evidence: "角色负伤状态与上章矛盾" }],
  });
  candidate.issues = [{
    severity: "critical",
    category: "voice",
    evidence: "修复稿泄漏了参考作品专名。",
    fixSuggestion: "移除参考作品专名。",
  }];

  const result = selectChapterRepairCandidate({ original, candidate });

  assert.equal(result.selected, "candidate");
  assert.equal(result.reasonCode, "candidate_improved");
});

test("selects a candidate that reduces missing obligations", () => {
  const result = selectChapterRepairCandidate({
    original: evaluation("original", 70, {
      missing: [{ kind: "must_hit_now", summary: "兑现承诺" }],
    }),
    candidate: evaluation("candidate", 70),
  });

  assert.equal(result.selected, "candidate");
  assert.equal(result.reasonCode, "candidate_improved");
});

test("retains the original when only the overall score improves", () => {
  const result = selectChapterRepairCandidate({
    original: evaluation("original", 70),
    candidate: evaluation("candidate", 79),
  });

  assert.equal(result.selected, "original");
  assert.equal(result.reasonCode, "original_retained_no_clear_improvement");
});
