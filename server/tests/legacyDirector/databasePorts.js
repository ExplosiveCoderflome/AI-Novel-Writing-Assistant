const assert = require("node:assert/strict");

// Prisma delegates are proxies, so node:test's descriptor-based mock.method
// cannot replace them. Restore the resolved method after each test instead.
function stubDatabaseMethod(t, delegate, method, implementation) {
  const original = delegate[method];
  assert.equal(typeof original, "function", `Unknown Prisma method: ${method}`);
  delegate[method] = implementation;
  t.after(() => { delegate[method] = original; });
}

// Ownership checks must see the same persisted book/task as the service fixture.
// Unknown identifiers stay missing so a fixture cannot accidentally authorize them.
function stubLegacyNovelIdentity(t, prisma, novelIds) {
  const known = new Set(novelIds);
  stubDatabaseMethod(t, prisma.novel, "findUnique", async ({ where }) => known.has(where.id)
    ? { id: where.id, directorVersion: "v1", directorEpoch: 0, narrativeForm: "long_novel" }
    : null);
}

function stubLegacyTaskOwnership(t, prisma, taskBooks, additionalNovelIds = []) {
  stubLegacyNovelIdentity(t, prisma, [...Object.values(taskBooks).filter(Boolean), ...additionalNovelIds]);
  stubDatabaseMethod(t, prisma.novelWorkflowTask, "findUnique", async ({ where }) =>
    Object.hasOwn(taskBooks, where.id)
      ? { id: where.id, novelId: taskBooks[where.id], directorVersion: "v1", directorEpoch: 0 }
      : null);
}

module.exports = { stubDatabaseMethod, stubLegacyNovelIdentity, stubLegacyTaskOwnership };
