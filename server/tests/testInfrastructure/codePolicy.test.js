const test = require("node:test");
const assert = require("node:assert/strict");
const { inspectSource } = require("../../scripts/quality/check-code-policy.cjs");

test("code policy rejects async Promise executors and executable debug/error shortcuts", () => {
  const errors = inspectSource('new Promise(async (resolve) => resolve(1)); debugger; eval("1"); throw "lost stack";');
  assert.equal(errors.length, 4);
});

test("code policy detects suppressed checking without rejecting quoted examples", () => {
  assert.equal(inspectSource('// @ts-ignore\nconst a = 1;').length, 1);
  assert.equal(inspectSource('const example = "@ts-ignore debugger eval()";').length, 0);
  assert.equal(inspectSource('new Promise(resolve => resolve(1)); throw new Error("detail");').length, 0);
});
