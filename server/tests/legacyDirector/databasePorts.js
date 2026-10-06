const assert = require("node:assert/strict");

// Prisma delegates are proxies, so node:test's descriptor-based mock.method
// cannot replace them. Restore the resolved method after each test instead.
function stubDatabaseMethod(t, delegate, method, implementation) {
  const original = delegate[method];
  assert.equal(typeof original, "function", `Unknown Prisma method: ${method}`);
  delegate[method] = implementation;
  t.after(() => { delegate[method] = original; });
}

module.exports = { stubDatabaseMethod };
