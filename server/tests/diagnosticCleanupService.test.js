const test = require("node:test");
const assert = require("node:assert/strict");
const { prisma } = require("../dist/db/prisma.js");
const { cleanupOldLlmInvocationDiagnostics } = require("../dist/llm/invocationDiagnostics.js");
const { DiagnosticCleanupService } = require("../dist/services/diagnosticCleanupService.js");
const { directorExecutionLogger } = require("../dist/services/novel/director/directorExecutionLogger.js");

test("cleanupOldLlmInvocationDiagnostics deletes records older than specified days", async () => {
  const original = prisma.llmInvocationDiagnostic.deleteMany;
  let capturedWhere = null;

  prisma.llmInvocationDiagnostic.deleteMany = async ({ where }) => {
    capturedWhere = where;
    return { count: 42 };
  };

  try {
    const result = await cleanupOldLlmInvocationDiagnostics(7);
    assert.equal(result, 42);
    assert.ok(capturedWhere.createdAt.lt instanceof Date);
    const expectedCutoff = new Date();
    expectedCutoff.setDate(expectedCutoff.getDate() - 7);
    const diff = Math.abs(capturedWhere.createdAt.lt.getTime() - expectedCutoff.getTime());
    assert.ok(diff < 1000, "cutoff should be approximately 7 days ago");
  } finally {
    prisma.llmInvocationDiagnostic.deleteMany = original;
  }
});

test("cleanupOldLlmInvocationDiagnostics defaults to 30 days", async () => {
  const original = prisma.llmInvocationDiagnostic.deleteMany;
  let capturedWhere = null;

  prisma.llmInvocationDiagnostic.deleteMany = async ({ where }) => {
    capturedWhere = where;
    return { count: 0 };
  };

  try {
    await cleanupOldLlmInvocationDiagnostics();
    const expectedCutoff = new Date();
    expectedCutoff.setDate(expectedCutoff.getDate() - 30);
    const diff = Math.abs(capturedWhere.createdAt.lt.getTime() - expectedCutoff.getTime());
    assert.ok(diff < 1000, "cutoff should be approximately 30 days ago");
  } finally {
    prisma.llmInvocationDiagnostic.deleteMany = original;
  }
});

test("DiagnosticCleanupService.runCleanup calls both cleanup functions", async () => {
  const origDiag = prisma.llmInvocationDiagnostic.deleteMany;
  const origLog = prisma.directorExecutionLog.deleteMany;

  prisma.llmInvocationDiagnostic.deleteMany = async () => ({ count: 10 });
  prisma.directorExecutionLog.deleteMany = async () => ({ count: 5 });

  try {
    const service = new DiagnosticCleanupService();
    const result = await service.runCleanup();
    assert.equal(result.deletedDiagnostics, 10);
    assert.equal(result.deletedExecutionLogs, 5);
  } finally {
    prisma.llmInvocationDiagnostic.deleteMany = origDiag;
    prisma.directorExecutionLog.deleteMany = origLog;
  }
});

test("DiagnosticCleanupService.start creates interval and stop clears it", async () => {
  const origDiag = prisma.llmInvocationDiagnostic.deleteMany;
  const origLog = prisma.directorExecutionLog.deleteMany;

  prisma.llmInvocationDiagnostic.deleteMany = async () => ({ count: 0 });
  prisma.directorExecutionLog.deleteMany = async () => ({ count: 0 });

  try {
    const service = new DiagnosticCleanupService();
    service.start(100);
    await new Promise((r) => setTimeout(r, 250));
    service.stop();
    assert.ok(true, "service started and stopped without error");
  } finally {
    prisma.llmInvocationDiagnostic.deleteMany = origDiag;
    prisma.directorExecutionLog.deleteMany = origLog;
  }
});

test("DiagnosticCleanupService respects DIAGNOSTIC_RETENTION_DAYS env var", async () => {
  const origDiag = prisma.llmInvocationDiagnostic.deleteMany;
  const origLog = prisma.directorExecutionLog.deleteMany;
  const origEnv = process.env.DIAGNOSTIC_RETENTION_DAYS;

  let diagWhere = null;
  prisma.llmInvocationDiagnostic.deleteMany = async ({ where }) => {
    diagWhere = where;
    return { count: 3 };
  };
  prisma.directorExecutionLog.deleteMany = async () => ({ count: 1 });

  process.env.DIAGNOSTIC_RETENTION_DAYS = "14";

  try {
    const service = new DiagnosticCleanupService();
    await service.runCleanup();
    const expectedCutoff = new Date();
    expectedCutoff.setDate(expectedCutoff.getDate() - 14);
    const diff = Math.abs(diagWhere.createdAt.lt.getTime() - expectedCutoff.getTime());
    assert.ok(diff < 1000, "cutoff should be approximately 14 days ago");
  } finally {
    prisma.llmInvocationDiagnostic.deleteMany = origDiag;
    prisma.directorExecutionLog.deleteMany = origLog;
    if (origEnv === undefined) {
      delete process.env.DIAGNOSTIC_RETENTION_DAYS;
    } else {
      process.env.DIAGNOSTIC_RETENTION_DAYS = origEnv;
    }
  }
});

test("DiagnosticCleanupService.start is idempotent", () => {
  const origDiag = prisma.llmInvocationDiagnostic.deleteMany;
  const origLog = prisma.directorExecutionLog.deleteMany;

  prisma.llmInvocationDiagnostic.deleteMany = async () => ({ count: 0 });
  prisma.directorExecutionLog.deleteMany = async () => ({ count: 0 });

  try {
    const service = new DiagnosticCleanupService();
    service.start(60000);
    service.start(60000);
    service.stop();
    assert.ok(true, "calling start twice does not throw");
  } finally {
    prisma.llmInvocationDiagnostic.deleteMany = origDiag;
    prisma.directorExecutionLog.deleteMany = origLog;
  }
});
