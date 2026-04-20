const test = require("node:test");
const assert = require("node:assert/strict");

const {
  payoffLedgerSyncOutputSchema,
} = require("../dist/prompting/prompts/payoff/payoffLedgerSync.promptSchemas.js");
const {
  fullAuditOutputSchema,
} = require("../dist/services/audit/auditSchemas.js");
const {
  volumeDynamicsProjectionSchema,
} = require("../dist/services/novel/dynamics/characterDynamicsSchemas.js");

test("payoff ledger schema normalizes legacy source kind aliases and numeric confidence strings", () => {
  const parsed = payoffLedgerSyncOutputSchema.parse({
    items: [{
      ledgerKey: "hero-secret",
      title: "主角秘密身份",
      summary: "第 33 章正式揭露主角的真实身份。",
      scopeType: "chapter",
      currentStatus: "paid_off",
      payoffChapterOrder: 33,
      sourceRefs: [{
        kind: "chapter_payoff",
        refLabel: "第33章兑现",
        chapterOrder: 33,
      }, {
        kind: "volume_open",
        refLabel: "第一卷开放伏笔",
        volumeSortOrder: 1,
      }],
      evidence: [],
      riskSignals: [],
      confidence: "0.8",
    }],
  });

  assert.equal(parsed.items[0].sourceRefs[0].kind, "chapter_payoff_ref");
  assert.equal(parsed.items[0].sourceRefs[1].kind, "volume_open_payoff");
  assert.equal(parsed.items[0].confidence, 0.8);
});

test("payoff ledger schema still rejects unknown scope types", () => {
  assert.throws(() => payoffLedgerSyncOutputSchema.parse({
    items: [{
      ledgerKey: "hero-secret",
      title: "主角秘密身份",
      summary: "第 33 章正式揭露主角的真实身份。",
      scopeType: "global",
      currentStatus: "paid_off",
      payoffChapterOrder: 33,
      sourceRefs: [],
      evidence: [],
      riskSignals: [],
    }],
  }), /scopeType/);
});

test("audit schema maps top-level plot category to logic and still rejects unknown categories", () => {
  const parsed = fullAuditOutputSchema.parse({
    issues: [{
      severity: "medium",
      category: "plot",
      evidence: "主线冲突已经出现，但关键代价没有继续抬高。",
      fixSuggestion: "补一个无法立刻摆脱的后果。",
    }],
    auditReports: [],
  });

  assert.equal(parsed.issues[0].category, "logic");

  assert.throws(() => fullAuditOutputSchema.parse({
    issues: [{
      severity: "medium",
      category: "character",
      evidence: "分类不合法。",
      fixSuggestion: "应当失败。",
    }],
  }), /category/);
});

test("volume dynamics projection schema clamps oversized thresholds and parses numeric strings", () => {
  const parsed = volumeDynamicsProjectionSchema.parse({
    assignments: [{
      characterName: "林青",
      volumeSortOrder: 1,
      responsibility: "承担本卷核心追查与压力升级。",
      plannedChapterOrders: [1, 4, 8],
      isCore: true,
      absenceWarningThreshold: "8",
      absenceHighRiskThreshold: 40,
    }],
    factionTracks: [],
    relationStages: [],
  });

  assert.equal(parsed.assignments[0].absenceWarningThreshold, 8);
  assert.equal(parsed.assignments[0].absenceHighRiskThreshold, 12);
});

test("volume dynamics projection schema rejects invalid threshold floor and reversed ordering", () => {
  assert.throws(() => volumeDynamicsProjectionSchema.parse({
    assignments: [{
      characterName: "林青",
      volumeSortOrder: 1,
      responsibility: "承担本卷核心追查与压力升级。",
      plannedChapterOrders: [1, 4, 8],
      isCore: true,
      absenceWarningThreshold: 0,
      absenceHighRiskThreshold: 5,
    }],
    factionTracks: [],
    relationStages: [],
  }), /absenceWarningThreshold/);

  assert.throws(() => volumeDynamicsProjectionSchema.parse({
    assignments: [{
      characterName: "林青",
      volumeSortOrder: 1,
      responsibility: "承担本卷核心追查与压力升级。",
      plannedChapterOrders: [1, 4, 8],
      isCore: true,
      absenceWarningThreshold: 6,
      absenceHighRiskThreshold: 5,
    }],
    factionTracks: [],
    relationStages: [],
  }), /absenceHighRiskThreshold/);
});
