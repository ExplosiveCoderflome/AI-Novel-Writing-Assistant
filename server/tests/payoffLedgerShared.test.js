const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildPayoffLedgerResponse,
  buildSyntheticPayoffIssues,
  classifyPayoffLedgerItems,
} = require("../dist/services/payoff/payoffLedgerShared.js");

function createLedgerItem(overrides = {}) {
  return {
    id: overrides.id ?? `ledger-${Math.random().toString(16).slice(2)}`,
    novelId: overrides.novelId ?? "novel-1",
    ledgerKey: overrides.ledgerKey ?? "ledger-key",
    title: overrides.title ?? "女二情报钥匙",
    summary: overrides.summary ?? "女二手里的情报会成为第一次反压的钥匙。",
    scopeType: overrides.scopeType ?? "volume",
    currentStatus: overrides.currentStatus ?? "pending_payoff",
    targetStartChapterOrder: overrides.targetStartChapterOrder ?? 5,
    targetEndChapterOrder: overrides.targetEndChapterOrder ?? 6,
    firstSeenChapterOrder: overrides.firstSeenChapterOrder ?? 3,
    lastTouchedChapterOrder: overrides.lastTouchedChapterOrder ?? 4,
    lastTouchedChapterId: overrides.lastTouchedChapterId ?? "chapter-4",
    setupChapterId: overrides.setupChapterId ?? "chapter-3",
    payoffChapterId: overrides.payoffChapterId ?? null,
    lastSnapshotId: overrides.lastSnapshotId ?? "snapshot-4",
    sourceRefs: overrides.sourceRefs ?? [{
      kind: "volume_open_payoff",
      refId: "volume-1",
      refLabel: "第一卷开放伏笔",
      chapterId: null,
      chapterOrder: 4,
      volumeId: "volume-1",
      volumeSortOrder: 1,
    }],
    evidence: overrides.evidence ?? [{
      summary: "第四章已经明确提到女二掌握关键情报。",
      chapterId: "chapter-4",
      chapterOrder: 4,
    }],
    riskSignals: overrides.riskSignals ?? [],
    statusReason: overrides.statusReason ?? "需要在第5-6章把情报转化为反压动作。",
    confidence: overrides.confidence ?? 0.91,
    createdAt: overrides.createdAt ?? "2026-04-05T10:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-04-05T10:00:00.000Z",
  };
}

test("classifyPayoffLedgerItems separates pending urgent overdue and paid-off items", () => {
  const items = [
    createLedgerItem({
      ledgerKey: "pending",
      title: "女二情报钥匙",
      currentStatus: "pending_payoff",
      targetStartChapterOrder: 5,
      targetEndChapterOrder: 6,
    }),
    createLedgerItem({
      ledgerKey: "setup",
      title: "黑市账户异常",
      currentStatus: "setup",
      targetStartChapterOrder: 6,
      targetEndChapterOrder: 6,
    }),
    createLedgerItem({
      ledgerKey: "overdue",
      title: "旧线索回收",
      currentStatus: "overdue",
      targetStartChapterOrder: 3,
      targetEndChapterOrder: 4,
    }),
    createLedgerItem({
      ledgerKey: "paid",
      title: "第一次反压试探",
      currentStatus: "paid_off",
      targetStartChapterOrder: 4,
      targetEndChapterOrder: 4,
      payoffChapterId: "chapter-4",
      lastTouchedChapterOrder: 4,
    }),
  ];

  const classified = classifyPayoffLedgerItems(items, 5);

  assert.deepEqual(classified.pendingItems.map((item) => item.ledgerKey), ["pending", "setup"]);
  assert.deepEqual(classified.urgentItems.map((item) => item.ledgerKey), ["pending", "setup"]);
  assert.deepEqual(classified.overdueItems.map((item) => item.ledgerKey), ["overdue"]);
  assert.deepEqual(classified.paidOffItems.map((item) => item.ledgerKey), ["paid"]);
});

test("buildSyntheticPayoffIssues surfaces overdue missing progress and payoff risk signals", () => {
  const items = [
    createLedgerItem({
      ledgerKey: "overdue",
      title: "黑市账户异常",
      currentStatus: "overdue",
      targetStartChapterOrder: 3,
      targetEndChapterOrder: 4,
      statusReason: "目标窗口已经过去，但主角还没真正查到账本问题。",
    }),
    createLedgerItem({
      ledgerKey: "missing-progress",
      title: "女二情报钥匙",
      currentStatus: "pending_payoff",
      targetStartChapterOrder: 5,
      targetEndChapterOrder: 5,
    }),
    createLedgerItem({
      ledgerKey: "paid-without-setup",
      title: "仓促兑现",
      currentStatus: "paid_off",
      riskSignals: [{
        code: "payoff_paid_without_setup",
        severity: "critical",
        summary: "没有铺垫就直接兑现了关键收益。",
      }],
    }),
    createLedgerItem({
      ledgerKey: "regressed",
      title: "旧线索回退",
      currentStatus: "hinted",
      riskSignals: [{
        code: "payoff_regressed",
        severity: "high",
        summary: "已兑现线索被错误重置为待观察状态。",
      }],
    }),
  ];

  const issues = buildSyntheticPayoffIssues(items, 5);
  const byKey = new Map(issues.map((issue) => [`${issue.ledgerKey}:${issue.code}`, issue]));

  assert.match(byKey.get("overdue:payoff_overdue").description, /超过目标窗口/);
  assert.match(byKey.get("missing-progress:payoff_missing_progress").description, /进入应触碰窗口/);
  assert.match(byKey.get("paid-without-setup:payoff_paid_without_setup").description, /专项风险/);
  assert.equal(byKey.get("paid-without-setup:payoff_paid_without_setup").severity, "critical");
  assert.match(byKey.get("regressed:payoff_regressed").fixSuggestion, /新的账本项/);
});

test("buildPayoffLedgerResponse orders items by risk and computes summary counts", () => {
  const response = buildPayoffLedgerResponse([
    createLedgerItem({
      ledgerKey: "paid",
      title: "第一次反压试探",
      currentStatus: "paid_off",
      updatedAt: "2026-04-05T10:00:03.000Z",
    }),
    createLedgerItem({
      ledgerKey: "pending",
      title: "女二情报钥匙",
      currentStatus: "pending_payoff",
      updatedAt: "2026-04-05T10:00:02.000Z",
    }),
    createLedgerItem({
      ledgerKey: "overdue",
      title: "黑市账户异常",
      currentStatus: "overdue",
      updatedAt: "2026-04-05T10:00:04.000Z",
    }),
  ], 5);

  assert.deepEqual(response.items.map((item) => item.ledgerKey), ["overdue", "pending", "paid"]);
  assert.equal(response.summary.pendingCount, 1);
  assert.equal(response.summary.overdueCount, 1);
  assert.equal(response.summary.paidOffCount, 1);
  assert.equal(response.updatedAt, "2026-04-05T10:00:04.000Z");
});
