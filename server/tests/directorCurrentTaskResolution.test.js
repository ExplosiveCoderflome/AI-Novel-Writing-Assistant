const { afterEach, test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const prismaModulePath = require.resolve("../dist/db/prisma.js");
const archiveModulePath = require.resolve("../dist/services/task/taskArchive.js");
const currentTaskModulePath = path.resolve(
  __dirname,
  "../dist/services/novel/director/state/currentDirectorTask.js",
);
const originalModuleCacheEntries = new Map([
  [prismaModulePath, require.cache[prismaModulePath]],
  [archiveModulePath, require.cache[archiveModulePath]],
]);

afterEach(() => {
  delete require.cache[currentTaskModulePath];
  for (const [modulePath, originalEntry] of originalModuleCacheEntries) {
    if (originalEntry) {
      require.cache[modulePath] = originalEntry;
    } else {
      delete require.cache[modulePath];
    }
  }
});

function loadCurrentTaskModule(rows, archivedIds = []) {
  const calls = [];
  require.cache[prismaModulePath] = {
    id: prismaModulePath,
    filename: prismaModulePath,
    loaded: true,
    exports: {
      prisma: {
        novelWorkflowTask: {
          findMany: async (args) => {
            calls.push(args);
            return [...rows].sort((left, right) => {
              const createdAtOrder = right.createdAt.getTime() - left.createdAt.getTime();
              return createdAtOrder || right.id.localeCompare(left.id);
            });
          },
        },
      },
    },
  };
  require.cache[archiveModulePath] = {
    id: archiveModulePath,
    filename: archiveModulePath,
    loaded: true,
    exports: {
      getArchivedTaskIdSet: async (_taskKind, taskIds) => new Set(taskIds.filter((id) => archivedIds.includes(id))),
    },
  };
  delete require.cache[currentTaskModulePath];
  return { module: require(currentTaskModulePath), calls };
}

test("current director task uses creation order, excludes archived rows, and does not filter by status", async () => {
  const sameCreationTime = new Date("2026-01-01T00:00:00.000Z");
  const { module, calls } = loadCurrentTaskModule([
    { id: "old-active", status: "running", createdAt: new Date("2025-01-01T00:00:00.000Z") },
    { id: "newer-terminal-a", status: "succeeded", createdAt: sameCreationTime },
    { id: "newer-terminal-z", status: "failed", createdAt: sameCreationTime },
    { id: "archived-latest", status: "queued", createdAt: new Date("2027-01-01T00:00:00.000Z") },
  ], ["archived-latest"]);

  const result = await module.resolveCurrentDirectorTask("novel-1");

  assert.equal(result.id, "newer-terminal-z");
  assert.deepEqual(calls[0], {
    where: { novelId: "novel-1", lane: "auto_director" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
});

test("active lookup only reports the canonical current task when it is nonterminal", async () => {
  const { module } = loadCurrentTaskModule([
    { id: "older-active", status: "running", createdAt: new Date("2025-01-01T00:00:00.000Z") },
    { id: "current-failed", status: "failed", createdAt: new Date("2026-01-01T00:00:00.000Z") },
  ]);

  assert.equal(await module.findActiveDirectorTask("novel-2"), null);
});
