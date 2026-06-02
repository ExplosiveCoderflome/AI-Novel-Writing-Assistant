const test = require("node:test");
const assert = require("node:assert/strict");

const { buildWindowOrders } = require("../dist/services/planner/replanDecision.js");

// When there are no available chapter orders, the surrounding-mode fallback used to count
// duplicate clamped chapter numbers (e.g. repeated 1s) against the window size before
// deduplicating, so anchors near chapter 1 returned fewer chapters than requested.
test("buildWindowOrders surrounding fallback returns a full window for an anchor near chapter 1", () => {
  const result = buildWindowOrders(1, [], 5, "surrounding");

  assert.equal(result.length, 5, "should still return the requested window size");
  assert.equal(new Set(result).size, result.length, "no duplicates");
  assert.deepEqual(result, [1, 2, 3, 4, 5]);
});

test("buildWindowOrders surrounding fallback centers around a mid anchor", () => {
  const result = buildWindowOrders(5, null, 5, "surrounding");

  assert.equal(result.length, 5);
  assert.deepEqual(result, [3, 4, 5, 6, 7]);
});

test("buildWindowOrders surrounding fallback never drops below chapter 1", () => {
  const result = buildWindowOrders(2, [], 5, "surrounding");

  assert.equal(result.length, 5);
  assert.ok(result.every((order) => order >= 1));
  assert.equal(new Set(result).size, result.length);
});
