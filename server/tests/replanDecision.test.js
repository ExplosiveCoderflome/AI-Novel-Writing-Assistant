const test = require("node:test");
const assert = require("node:assert/strict");
const { buildReplanDecision } = require("../dist/services/planner/replanDecision.js");

function createSnapshot(overrides = {}) {
  return {
    novelId: "novel-1",
    sourceSnapshotId: "snapshot-1",
    scopeLabel: "test",
    bookContract: {
      title: "测试小说",
      toneGuardrails: [],
      hardConstraints: [],
    },
    worldState: null,
    characters: [],
    narrative: {
      currentVolumeId: "volume-1",
      currentVolumeTitle: "第一卷",
      currentChapterId: "chapter-5",
      currentChapterOrder: 5,
      currentChapterGoal: "推进第一次反压",
      currentPhase: "pressure",
      openConflicts: [],
      pendingPayoffs: [],
      urgentPayoffs: [],
      overduePayoffs: [],
      publicKnowledge: [],
      hiddenKnowledge: [],
      suspenseThreads: [],
      ...(overrides.narrative ?? {}),
    },
    timeline: [],
    createdAt: "2026-04-16T00:00:00.000Z",
    ...overrides,
  };
}

test("buildReplanDecision anchors overdue payoff windows around the canonical payoff deadline", () => {
  const decision = buildReplanDecision({
    availableChapterOrders: [3, 4, 5, 6, 7],
    requestedWindowSize: 3,
    targetChapterOrder: 5,
    snapshot: createSnapshot({
      narrative: {
        overduePayoffs: [{
          id: "payoff-1",
          ledgerKey: "ledger:black-market",
          title: "黑市账户异常",
          summary: "逾期未兑现",
          currentStatus: "overdue",
          targetStartChapterOrder: 4,
          targetEndChapterOrder: 5,
          firstSeenChapterOrder: 2,
          lastTouchedChapterOrder: 4,
        }],
        hiddenKnowledge: ["幕后黑手身份"],
      },
    }),
    ledgerSummary: {
      totalCount: 2,
      pendingCount: 1,
      urgentCount: 0,
      overdueCount: 1,
      paidOffCount: 0,
      failedCount: 0,
      updatedAt: null,
    },
    chapterStateGoal: {
      chapterId: "chapter-5",
      chapterOrder: 5,
      summary: "把第一次反压推进到可见收益",
      targetConflicts: [],
      targetRelationships: [],
      targetPayoffs: ["黑市账户异常"],
      protectedSecrets: ["幕后黑手身份"],
    },
    protectedSecrets: ["幕后黑手身份"],
  });

  assert.equal(decision.recommended, true);
  assert.equal(decision.signal, "overdue_payoff");
  assert.equal(decision.anchorChapterOrder, 5);
  assert.deepEqual(decision.affectedChapterOrders, [4, 5, 6]);
  assert.match(decision.triggerReason, /payoff 已逾期/);
  assert.match(decision.windowReason, /第5章为锚点/);
  assert.match(decision.whyTheseChapters, /第4章、第5章、第6章/);
  assert.deepEqual(decision.blockingLedgerKeys, ["ledger:black-market"]);
});

test("buildReplanDecision pushes blocking audit issues into a forward repair window", () => {
  const decision = buildReplanDecision({
    availableChapterOrders: [6, 7, 8, 9, 10],
    requestedWindowSize: 3,
    targetChapterOrder: 8,
    auditReports: [{
      id: "report-1",
      novelId: "novel-1",
      chapterId: "chapter-8",
      auditType: "plot",
      issues: [{
        id: "issue-1",
        reportId: "report-1",
        auditType: "plot",
        severity: "high",
        code: "missing_payoff",
        description: "第一次反压没有真正兑现。",
        evidence: "整章停在铺垫，没有结果。",
        fixSuggestion: "让主角拿到明确收益。",
        status: "open",
        createdAt: "2026-04-16T00:00:00.000Z",
        updatedAt: "2026-04-16T00:00:00.000Z",
      }],
      createdAt: "2026-04-16T00:00:00.000Z",
      updatedAt: "2026-04-16T00:00:00.000Z",
    }],
    chapterStateGoal: {
      chapterId: "chapter-8",
      chapterOrder: 8,
      summary: "兑现第一次反压",
      targetConflicts: ["第一次反压"],
      targetRelationships: [],
      targetPayoffs: [],
      protectedSecrets: [],
    },
  });

  assert.equal(decision.recommended, true);
  assert.equal(decision.signal, "blocking_audit");
  assert.equal(decision.anchorChapterOrder, 8);
  assert.deepEqual(decision.affectedChapterOrders, [8, 9, 10]);
  assert.deepEqual(decision.blockingIssueIds, ["issue-1"]);
  assert.match(decision.triggerReason, /高优先级审计问题/);
  assert.match(decision.windowReason, /向后展开/);
});

test("buildReplanDecision can recommend a manual window even when state signals are still quiet", () => {
  const decision = buildReplanDecision({
    availableChapterOrders: [5, 6, 7],
    requestedWindowSize: 2,
    targetChapterOrder: 6,
    triggerType: "manual",
    reason: "用户要求重排当前窗口。",
    forceRecommended: true,
  });

  assert.equal(decision.recommended, true);
  assert.equal(decision.signal, "manual_request");
  assert.deepEqual(decision.affectedChapterOrders, [6, 7]);
  assert.equal(decision.reason, "用户要求重排当前窗口。");
});

test("buildReplanDecision stays idle when there are no blocking state signals", () => {
  const decision = buildReplanDecision({
    availableChapterOrders: [4, 5, 6],
    targetChapterOrder: 5,
    snapshot: createSnapshot(),
    ledgerSummary: {
      totalCount: 0,
      pendingCount: 0,
      urgentCount: 0,
      overdueCount: 0,
      paidOffCount: 0,
      failedCount: 0,
      updatedAt: null,
    },
  });

  assert.equal(decision.recommended, false);
  assert.equal(decision.signal, "stable");
  assert.deepEqual(decision.affectedChapterOrders, []);
  assert.match(decision.reason, /无需重规划/);
});
