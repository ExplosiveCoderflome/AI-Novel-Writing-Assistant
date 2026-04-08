const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createNovelChapterReferenceLookup,
  resolveNovelChapterId,
  normalizePayoffLedgerPromptChapterRefs,
} = require("../dist/services/payoff/payoffLedgerChapterRefs.js");
const {
  payoffLedgerSyncPrompt,
} = require("../dist/prompting/prompts/payoff/payoffLedgerSync.prompts.js");

function createLookup() {
  return createNovelChapterReferenceLookup([
    { id: "chapter-32", order: 32 },
    { id: "chapter-33", order: 33 },
  ]);
}

test("resolveNovelChapterId accepts exact ids and chapter-order style fallbacks", () => {
  const lookup = createLookup();

  assert.equal(resolveNovelChapterId({ rawChapterId: "chapter-33" }, lookup), "chapter-33");
  assert.equal(resolveNovelChapterId({ rawChapterId: "33" }, lookup), "chapter-33");
  assert.equal(resolveNovelChapterId({ rawChapterId: "第32章" }, lookup), "chapter-32");
  assert.equal(resolveNovelChapterId({ rawChapterId: "foreign-chapter", chapterOrder: 33 }, lookup), "chapter-33");
  assert.equal(resolveNovelChapterId({ rawChapterId: "foreign-chapter" }, lookup), null);
});

test("normalizePayoffLedgerPromptChapterRefs resolves legal chapter ids and strips invalid ones", () => {
  const normalized = normalizePayoffLedgerPromptChapterRefs({
    item: {
      currentStatus: "paid_off",
      lastTouchedChapterOrder: 33,
      setupChapterId: "missing-id",
      setupChapterOrder: 32,
      payoffChapterId: "33",
      sourceRefs: [
        {
          kind: "chapter_payoff_ref",
          refId: null,
          refLabel: "第33章兑现",
          chapterId: "33",
          chapterOrder: 33,
          volumeId: null,
          volumeSortOrder: null,
        },
      ],
      evidence: [
        {
          summary: "第33章完成兑现",
          chapterId: "missing-id",
          chapterOrder: 33,
        },
      ],
    },
    previous: {
      lastTouchedChapterId: "chapter-32",
      setupChapterId: null,
      payoffChapterId: null,
    },
    lookup: createLookup(),
    currentChapterOrder: 33,
    sourceChapterId: "chapter-33",
  });

  assert.equal(normalized.lastTouchedChapterId, "chapter-33");
  assert.equal(normalized.setupChapterId, "chapter-32");
  assert.equal(normalized.payoffChapterId, "chapter-33");
  assert.equal(normalized.sourceRefs[0].chapterId, "chapter-33");
  assert.equal(normalized.evidence[0].chapterId, "chapter-33");
});

test("payoffLedgerSyncPrompt postValidate accepts paid_off items with payoffChapterOrder", () => {
  assert.doesNotThrow(() => payoffLedgerSyncPrompt.postValidate({
    items: [{
      ledgerKey: "hero-secret",
      title: "主角秘密身份",
      summary: "第33章正式揭露主角的真实身份。",
      scopeType: "chapter",
      currentStatus: "paid_off",
      payoffChapterOrder: 33,
      sourceRefs: [],
      evidence: [],
      riskSignals: [],
    }],
  }));
});

test("payoffLedgerSyncPrompt postValidate still rejects paid_off items without chapter locator", () => {
  assert.throws(() => payoffLedgerSyncPrompt.postValidate({
    items: [{
      ledgerKey: "hero-secret",
      title: "主角秘密身份",
      summary: "第33章正式揭露主角的真实身份。",
      scopeType: "chapter",
      currentStatus: "paid_off",
      sourceRefs: [],
      evidence: [],
      riskSignals: [],
    }],
  }), /payoffChapterOrder/);
});
