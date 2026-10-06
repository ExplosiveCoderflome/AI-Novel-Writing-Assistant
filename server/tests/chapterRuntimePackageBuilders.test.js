const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildFailureClassification,
  buildRuntimePackage,
} = require("../dist/services/novel/runtime/chapterRuntimePackageBuilders.js");

function createAcceptance(repairability = "none") {
  return {
    repairability,
    decisionReason: "章节验收结构化判断。",
  };
}

test("buildFailureClassification keeps local quality issues out of replan_required", () => {
  const classification = buildFailureClassification({
    acceptance: createAcceptance(),
    hasBlockingIssues: true,
    replanRecommended: false,
    missingObligations: [],
  });

  assert.equal(classification.code, "draft_repair_exhausted");
});

function runtimeInput() {
  const warning = { id: 'ledger-warning', code: 'payoff_missing_progress', severity: 'medium' };
  const item = { id: 'payoff', ledgerKey: 'later-promise', title: '后续承诺', summary: '仍需关注',
    currentStatus: 'pending_payoff', targetStartChapterOrder: 10, targetEndChapterOrder: 12,
    evidence: [], riskSignals: [], statusReason: '本章没有承诺立刻兑现' };
  return {
    novelId: 'n', chapterId: 'c', request: {}, finalContent: '主角取得本章承诺的线索。',
    contextPackage: { chapter: { id: 'c', order: 11 }, chapterWriteContext: null,
      openAuditIssues: [warning], ledgerPendingItems: [item], ledgerOverdueItems: [], ledgerSummary: null },
    auditResult: { score: { overall: 85 }, auditReports: [] }, activeOpenConflicts: [],
    styleReview: { report: null, autoRewritten: false, originalContent: null },
    acceptance: { status: 'accepted', continuePolicy: 'continue', repairability: 'none',
      missingObligations: [], riskTags: [], repairDirectives: [], assetSyncRecommendation: {}, decisionReason: '可继续' },
    runId: null, plannerService: { shouldTriggerReplanFromAudit: () => false },
  };
}

test('ledger window reminders remain planning context without inventing post-acceptance chapter defects', () => {
  const input = runtimeInput();
  const result = buildRuntimePackage(input);
  assert.deepEqual(result.audit.openIssues, []);
  assert.equal(result.audit.hasBlockingIssues, false);
  assert.equal(result.replanRecommendation.recommended, false);
  assert.deepEqual(result.context.openAuditIssues, input.contextPackage.openAuditIssues);
  assert.deepEqual(result.context.ledgerPendingItems, input.contextPackage.ledgerPendingItems);
});

test('real chapter audit evidence remains repairable even when it concerns the same ledger promise', () => {
  const input = runtimeInput();
  const issue = { id: 'actual-issue', reportId: 'audit', auditType: 'plot', severity: 'high',
    code: 'payoff_missing_progress', description: '本章承诺动作确实缺失', evidence: 'AI 根据本章正文的证据',
    fixSuggestion: '补齐已安排的行动', status: 'open', createdAt: 'now', updatedAt: 'now' };
  input.auditResult.auditReports = [{ id: 'audit', issues: [issue] }];
  const result = buildRuntimePackage(input);
  assert.equal(result.audit.openIssues.length, 1);
  assert.equal(result.audit.openIssues[0].id, issue.id);
  assert.equal(result.audit.openIssues[0].evidence, issue.evidence);
  assert.equal(result.audit.hasBlockingIssues, true);
});

test('overdue ledger reminders do not create blocking keys or override an accepted chapter', () => {
  const input = runtimeInput();
  input.contextPackage.ledgerOverdueItems = [{ ...input.contextPackage.ledgerPendingItems[0], currentStatus: 'overdue', targetEndChapterOrder: 9 }];
  input.contextPackage.ledgerPendingItems = [];
  let decisionInput;
  input.plannerService.buildReplanRecommendation = value => {
    decisionInput = value;
    return { recommended: false, action: 'continue_with_warning', blockingIssueIds: [], blockingLedgerKeys: [], affectedChapterOrders: [] };
  };
  const result = buildRuntimePackage(input);
  assert.deepEqual(result.audit.openIssues, []);
  assert.equal(result.audit.hasBlockingIssues, false);
  assert.deepEqual(decisionInput.blockingLedgerKeys, []);
  assert.equal(decisionInput.forceRecommended, false);
  assert.equal(result.context.ledgerOverdueItems.length, 1);
});

test("buildFailureClassification preserves explicit plan misalignment as replan_required", () => {
  const classification = buildFailureClassification({
    acceptance: createAcceptance("plan_misalignment"),
    hasBlockingIssues: false,
    replanRecommended: false,
    missingObligations: [],
  });

  assert.equal(classification.code, "replan_required");
});
