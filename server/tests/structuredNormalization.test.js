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
  chapterDynamicExtractionSchema,
} = require("../dist/services/novel/dynamics/characterDynamicsSchemas.js");
const {
  chapterEditorWorkspaceDiagnosisSchema,
} = require("../dist/prompting/prompts/novel/chapterEditor/workspaceDiagnosis.promptSchemas.js");

test("workspace diagnosis schema normalizes supported Chinese recommended actions to enum values", () => {
  const parsed = chapterEditorWorkspaceDiagnosisSchema.parse({
    cards: [{
      title: "节奏偏慢",
      problemSummary: "中段静态描写过多。",
      whyItMatters: "会拖慢进入主冲突。",
      recommendedAction: "精简",
      recommendedScope: "selection",
      paragraphStart: 12,
      paragraphEnd: 18,
      severity: "medium",
      sourceTags: ["节奏"],
    }, {
      title: "反派太扁平",
      problemSummary: "反派只有脸谱化压迫，没有层次。",
      whyItMatters: "会削弱冲突质感。",
      recommendedAction: "优化表达",
      recommendedScope: "selection",
      paragraphStart: 30,
      paragraphEnd: 36,
      severity: "medium",
      sourceTags: ["角色"],
    }, {
      title: "情绪抬升不足",
      problemSummary: "临界点前的情绪积压不够。",
      whyItMatters: "会影响结尾爆发。",
      recommendedAction: "强化情绪",
      recommendedScope: "selection",
      paragraphStart: 80,
      paragraphEnd: 84,
      severity: "high",
      sourceTags: ["情绪"],
    }, {
      title: "冲突不够硬",
      problemSummary: "主角和压迫方没有正面碰撞。",
      whyItMatters: "会让场景显得平。",
      recommendedAction: "强化冲突",
      recommendedScope: "selection",
      paragraphStart: 38,
      paragraphEnd: 45,
      severity: "medium",
      sourceTags: ["冲突"],
    }],
    recommendedTask: {
      title: "先补系统伏笔",
      summary: "让主角更明确想到可行出路。",
      recommendedAction: "扩写",
      recommendedScope: "selection",
      paragraphStart: 90,
      paragraphEnd: 96,
    },
  });

  assert.deepEqual(
    parsed.cards.map((item) => item.recommendedAction),
    ["compress", "polish", "emotion", "conflict"],
  );
  assert.equal(parsed.recommendedTask.recommendedAction, "expand");
});

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

test("volume dynamics projection schema filters invalid planned chapter orders safely", () => {
  const parsed = volumeDynamicsProjectionSchema.parse({
    assignments: [{
      characterName: "林青",
      volumeSortOrder: 1,
      responsibility: "承担本卷核心追查与压力升级。",
      plannedChapterOrders: ["4", null, "", 6, "第7章"],
      isCore: true,
      absenceWarningThreshold: 3,
      absenceHighRiskThreshold: 5,
    }, {
      characterName: "苏雨",
      volumeSortOrder: 1,
      responsibility: "承担本卷线索补充。",
      plannedChapterOrders: [null, ""],
      isCore: false,
      absenceWarningThreshold: 6,
      absenceHighRiskThreshold: 8,
    }],
    factionTracks: [],
    relationStages: [],
  });

  assert.deepEqual(parsed.assignments[0].plannedChapterOrders, [4, 6]);
  assert.deepEqual(parsed.assignments[1].plannedChapterOrders, []);
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

test("chapter dynamics extraction schema normalizes supported confidence formats safely", () => {
  const parsed = chapterDynamicExtractionSchema.parse({
    candidates: [{
      proposedName: "老吴",
      proposedRole: "杂役头目",
      summary: "负责监工后院杂役。",
      evidence: ["老吴负责监工。"],
      matchedCharacterName: "",
      confidence: 5,
    }, {
      proposedName: "赵管事",
      proposedRole: "管事",
      summary: "直接施压主角。",
      evidence: ["赵管事当面敲打主角。"],
      matchedCharacterName: "赵管事",
      confidence: "0.8",
    }, {
      proposedName: "李校尉",
      proposedRole: "校尉",
      summary: "间接施加压力。",
      evidence: ["李校尉被多次提及。"],
      matchedCharacterName: "李校尉",
      confidence: "80",
    }, {
      proposedName: "王五",
      proposedRole: "杂役",
      summary: "证据不足。",
      evidence: ["只出现一次。"],
      matchedCharacterName: "",
      confidence: 150,
    }, {
      proposedName: "张三",
      proposedRole: "杂役",
      summary: "证据不足。",
      evidence: ["只出现一次。"],
      matchedCharacterName: "",
      confidence: "高",
    }],
    factionUpdates: [],
    relationStages: [{
      sourceCharacterName: "赵管事",
      targetCharacterName: "程秩",
      stageLabel: "监视升级",
      stageSummary: "赵管事开始持续盯防程秩。",
      nextTurnPoint: "程秩准备换策略。",
      confidence: 80,
    }],
  });

  assert.equal(parsed.candidates[0].confidence, 0.05);
  assert.equal(parsed.candidates[1].confidence, 0.8);
  assert.equal(parsed.candidates[2].confidence, 0.8);
  assert.equal(parsed.candidates[3].confidence, undefined);
  assert.equal(parsed.candidates[4].confidence, undefined);
  assert.equal(parsed.relationStages[0].confidence, 0.8);
});
