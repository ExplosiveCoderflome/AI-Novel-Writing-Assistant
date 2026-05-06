const test = require("node:test");
const assert = require("node:assert/strict");
const { prisma } = require("../dist/db/prisma.js");
const { directorExecutionLogger } = require("../dist/services/director/executionLogger.js");

function mockPrismaLog() {
  const calls = { create: 0, count: 0, findMany: 0, deleteMany: 0 };
  const original = { ...prisma.directorExecutionLog };

  prisma.directorExecutionLog.create = async () => {
    calls.create++;
    return { id: `log-${calls.create}` };
  };
  prisma.directorExecutionLog.count = async () => {
    calls.count++;
    return 50;
  };
  prisma.directorExecutionLog.findMany = async () => {
    calls.findMany++;
    return [];
  };
  prisma.directorExecutionLog.deleteMany = async () => {
    calls.deleteMany++;
    return { count: 0 };
  };

  const restore = () => {
    Object.assign(prisma.directorExecutionLog, original);
  };

  return { calls, restore };
}

function resetLoggerCounter() {
  // Reset internal counter by accessing the private field
  directorExecutionLogger.logCountSinceLastEnforce = 0;
}

test("enforceLogLimit is NOT called on every log (skipped for first N-1 calls)", async () => {
  const { calls, restore } = mockPrismaLog();
  resetLoggerCounter();

  try {
    for (let i = 0; i < 9; i++) {
      await directorExecutionLogger.log("task-1", "info", "test", `msg-${i}`);
    }
    assert.equal(calls.create, 9, "should have 9 create calls");
    assert.equal(calls.count, 0, "enforceLogLimit should not have been triggered");
  } finally {
    restore();
    resetLoggerCounter();
  }
});

test("enforceLogLimit IS called on the Nth log", async () => {
  const { calls, restore } = mockPrismaLog();
  resetLoggerCounter();

  try {
    for (let i = 0; i < 10; i++) {
      await directorExecutionLogger.log("task-1", "info", "test", `msg-${i}`);
    }
    // Give fire-and-forget a tick to execute
    await new Promise((r) => setTimeout(r, 50));

    assert.equal(calls.create, 10, "should have 10 create calls");
    assert.equal(calls.count, 1, "enforceLogLimit should have been triggered exactly once");
  } finally {
    restore();
    resetLoggerCounter();
  }
});

test("enforceLogLimit deletes excess logs when count exceeds MAX", async () => {
  const original = { ...prisma.directorExecutionLog };
  resetLoggerCounter();

  const deletedIds = [];
  prisma.directorExecutionLog.create = async () => ({ id: "log-new" });
  prisma.directorExecutionLog.count = async () => 210;
  prisma.directorExecutionLog.findMany = async ({ take }) => {
    return Array.from({ length: take }, (_, i) => ({ id: `old-${i}` }));
  };
  prisma.directorExecutionLog.deleteMany = async ({ where }) => {
    deletedIds.push(...where.id.in);
    return { count: where.id.in.length };
  };

  try {
    for (let i = 0; i < 10; i++) {
      await directorExecutionLogger.log("task-1", "info", "test", `msg-${i}`);
    }
    await new Promise((r) => setTimeout(r, 50));

    assert.equal(deletedIds.length, 10, "should delete 10 excess logs (210 - 200)");
  } finally {
    Object.assign(prisma.directorExecutionLog, original);
    resetLoggerCounter();
  }
});

test("enforceLogLimit failure does not break log writing", async () => {
  const original = { ...prisma.directorExecutionLog };
  resetLoggerCounter();

  let createCount = 0;
  prisma.directorExecutionLog.create = async () => {
    createCount++;
    return { id: `log-${createCount}` };
  };
  prisma.directorExecutionLog.count = async () => {
    throw new Error("DB connection lost");
  };

  try {
    for (let i = 0; i < 12; i++) {
      await directorExecutionLogger.log("task-1", "info", "test", `msg-${i}`);
    }
    await new Promise((r) => setTimeout(r, 50));

    assert.equal(createCount, 12, "all 12 logs should still be written despite enforceLogLimit failure");
  } finally {
    Object.assign(prisma.directorExecutionLog, original);
    resetLoggerCounter();
  }
});
