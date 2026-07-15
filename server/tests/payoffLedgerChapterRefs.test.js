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

test("payoffLedgerSyncPrompt requires every book contract payoff source and its deadline", () => {
  const input = {
    bookContractPayoffs: [{
      refId: "book_contract.chapter3Payoff",
      refLabel: "Book Contract 第 3 章阶段回报",
      payoff: "主角获得第一次明确优势",
      targetStartChapterOrder: 1,
      targetEndChapterOrder: 3,
    }],
  };
  const validItem = {
    ledgerKey: "first-visible-reward",
    title: "第一次明确优势",
    summary: "主角在前三章拿到读者可见的第一次优势。",
    scopeType: "book",
    currentStatus: "setup",
    targetStartChapterOrder: 1,
    targetEndChapterOrder: 3,
    sourceRefs: [{
      kind: "major_payoff",
      refId: "book_contract.chapter3Payoff",
      refLabel: "Book Contract 第 3 章阶段回报",
    }],
    evidence: [],
    riskSignals: [],
  };

  assert.doesNotThrow(() => payoffLedgerSyncPrompt.postValidate({ items: [validItem] }, input));
  assert.throws(
    () => payoffLedgerSyncPrompt.postValidate({
      items: [{ ...validItem, sourceRefs: [] }],
    }, input),
    /缺少 Book Contract 承诺来源/,
  );
  assert.throws(
    () => payoffLedgerSyncPrompt.postValidate({
      items: [{ ...validItem, targetEndChapterOrder: 4 }],
    }, input),
    /不晚于第 3 章/,
  );
});
