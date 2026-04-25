const test = require("node:test");
const assert = require("node:assert/strict");

const {
  detectStateDiffConflicts,
} = require("../dist/services/state/stateConflictDetection.js");

function buildSnapshot(foreshadowStates) {
  return {
    characterStates: [],
    relationStates: [],
    informationStates: [],
    foreshadowStates,
  };
}

test("detectStateDiffConflicts does not flag first-time pending_payoff foreshadow as missing setup", () => {
  const result = detectStateDiffConflicts({
    characters: [],
    previousSnapshot: null,
    currentSnapshot: buildSnapshot([
      {
        title: "等待兑现的伏笔",
        status: "pending_payoff",
        setupChapterId: null,
        summary: "伏笔仍在推进中。",
      },
    ]),
  });

  assert.equal(
    result.conflicts.some((item) => item.conflictType === "foreshadow_missing_setup"),
    false,
  );
});

test("detectStateDiffConflicts still flags paid_off foreshadow without setup", () => {
  const result = detectStateDiffConflicts({
    characters: [],
    previousSnapshot: null,
    currentSnapshot: buildSnapshot([
      {
        title: "已经兑现的伏笔",
        status: "paid_off",
        setupChapterId: null,
        summary: "本章明确回收。",
      },
    ]),
  });

  const missingSetupConflict = result.conflicts.find((item) => item.conflictType === "foreshadow_missing_setup");
  assert.ok(missingSetupConflict);
  assert.equal(missingSetupConflict.severity, "high");
});
