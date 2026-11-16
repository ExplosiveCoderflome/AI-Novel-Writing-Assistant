const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveDirectorCandidatesOutputTokenBudget,
} = require("../dist/prompting/prompts/novel/promptBudgetProfiles.js");

// #251: the book-level candidate call must never run on a budget smaller than
// the work it is asked to produce. The floor scales with the candidate count.
test("candidate output budget floors at 8192 for one or two candidates", () => {
  assert.equal(resolveDirectorCandidatesOutputTokenBudget(0), 8192);
  assert.equal(resolveDirectorCandidatesOutputTokenBudget(1), 8192);
  assert.equal(resolveDirectorCandidatesOutputTokenBudget(2), 8192);
});

test("candidate output budget scales with the candidate count", () => {
  assert.equal(resolveDirectorCandidatesOutputTokenBudget(3), 12288);
  assert.equal(resolveDirectorCandidatesOutputTokenBudget(4), 16384);
  assert.equal(resolveDirectorCandidatesOutputTokenBudget(5), 20480);
});

test("candidate output budget caps at 32768 and tolerates bad counts", () => {
  assert.equal(resolveDirectorCandidatesOutputTokenBudget(8), 32768);
  assert.equal(resolveDirectorCandidatesOutputTokenBudget(100), 32768);
  assert.equal(resolveDirectorCandidatesOutputTokenBudget(Number.NaN), 8192);
});
