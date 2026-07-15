const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveSupersededBookContractLedgerKeys,
} = require("../dist/services/payoff/domain/payoffLedgerSourceLifecycle.js");

function bookContractSource(refId) {
  return {
    kind: "major_payoff",
    refId,
    refLabel: refId,
  };
}

function existingItem(overrides = {}) {
  return {
    ledgerKey: overrides.ledgerKey ?? "old-payoff",
    currentStatus: overrides.currentStatus ?? "pending_payoff",
    sourceRefs: overrides.sourceRefs ?? [bookContractSource("book_contract.chapter3Payoff")],
  };
}

function resolvedItem(overrides = {}) {
  return {
    ledgerKey: overrides.ledgerKey ?? "new-payoff",
    sourceRefs: overrides.sourceRefs ?? [bookContractSource("book_contract.chapter3Payoff")],
  };
}

test("retires an unfinished book contract item when its source moves to a new ledger key", () => {
  const superseded = resolveSupersededBookContractLedgerKeys({
    existingItems: [existingItem()],
    resolvedItems: [resolvedItem()],
    activeBookContractRefIds: ["book_contract.chapter3Payoff"],
  });

  assert.deepEqual([...superseded], ["old-payoff"]);
});

test("retires an unfinished book contract item when its fixed source is removed", () => {
  const superseded = resolveSupersededBookContractLedgerKeys({
    existingItems: [existingItem()],
    resolvedItems: [],
    activeBookContractRefIds: [],
  });

  assert.deepEqual([...superseded], ["old-payoff"]);
});

test("keeps the existing item when the AI reuses the same ledger key", () => {
  const superseded = resolveSupersededBookContractLedgerKeys({
    existingItems: [existingItem()],
    resolvedItems: [resolvedItem({ ledgerKey: "old-payoff" })],
    activeBookContractRefIds: ["book_contract.chapter3Payoff"],
  });

  assert.equal(superseded.size, 0);
});

test("never retires paid-off or already failed history", () => {
  const superseded = resolveSupersededBookContractLedgerKeys({
    existingItems: [
      existingItem({ ledgerKey: "paid", currentStatus: "paid_off" }),
      existingItem({ ledgerKey: "failed", currentStatus: "failed" }),
    ],
    resolvedItems: [resolvedItem()],
    activeBookContractRefIds: ["book_contract.chapter3Payoff"],
  });

  assert.equal(superseded.size, 0);
});

test("keeps mixed-source items conservative when a book contract source changes", () => {
  const superseded = resolveSupersededBookContractLedgerKeys({
    existingItems: [existingItem({
      sourceRefs: [
        bookContractSource("book_contract.chapter3Payoff"),
        {
          kind: "volume_open_payoff",
          refId: "volume-1",
          refLabel: "第一卷开放回报",
        },
      ],
    })],
    resolvedItems: [resolvedItem()],
    activeBookContractRefIds: ["book_contract.chapter3Payoff"],
  });

  assert.equal(superseded.size, 0);
});

test("source retirement resolution is idempotent for terminal rows", () => {
  const first = resolveSupersededBookContractLedgerKeys({
    existingItems: [existingItem()],
    resolvedItems: [resolvedItem()],
    activeBookContractRefIds: ["book_contract.chapter3Payoff"],
  });
  const second = resolveSupersededBookContractLedgerKeys({
    existingItems: [existingItem({ currentStatus: "failed" })],
    resolvedItems: [resolvedItem()],
    activeBookContractRefIds: ["book_contract.chapter3Payoff"],
  });

  assert.deepEqual([...first], ["old-payoff"]);
  assert.equal(second.size, 0);
});
