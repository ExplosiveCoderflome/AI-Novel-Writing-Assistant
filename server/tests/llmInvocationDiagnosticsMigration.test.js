const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Database = require("better-sqlite3");
const {
  buildLlmDiagnosticFailureAppendix,
  createLlmInvocationDiagnostic,
  extractUpstreamRequestId,
  findLatestLlmInvocationDiagnosticForTask,
  resolveBaseUrlHost,
} = require("../dist/llm/invocationDiagnostics.js");
const { prisma } = require("../dist/db/prisma.js");

const migrationSqlPath = path.join(
  __dirname,
  "..",
  "src",
  "prisma",
  "migrations.sqlite",
  "20260505110000_llm_invocation_diagnostics",
  "migration.sql",
);
const postgresMigrationSqlPath = path.join(
  __dirname,
  "..",
  "src",
  "prisma",
  "migrations",
  "20260505110000_llm_invocation_diagnostics",
  "migration.sql",
);

test("SQLite migration creates LlmInvocationDiagnostic and supports latest task lookup", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-novel-llm-diagnostic-"));
  const databasePath = path.join(tempDir, "diagnostic.db");
  const database = new Database(databasePath);

  try {
    database.exec(fs.readFileSync(migrationSqlPath, "utf8"));
    database.prepare(`
      INSERT INTO "LlmInvocationDiagnostic" (
        "id",
        "taskId",
        "novelId",
        "promptId",
        "promptVersion",
        "stage",
        "itemKey",
        "provider",
        "model",
        "requestProtocol",
        "strategy",
        "status",
        "errorCategory",
        "errorMessage",
        "upstreamRequestId",
        "estimatedInputTokens",
        "renderedPromptChars",
        "messageChars",
        "latencyMs",
        "createdAt"
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "llmdiag_test_1",
      "task-1",
      "novel-1",
      "novel.story_macro.decomposition",
      "h1234567890ab",
      "story_macro",
      "book_contract",
      "deepseek",
      "deepseek-v4-pro",
      "openai_compatible",
      "json_object",
      "failed",
      "transport_error",
      "500 upstream error",
      "request-1",
      492,
      8600,
      9100,
      226129,
      "2026-05-05T11:00:00.000Z",
    );

    const row = database.prepare(`
      SELECT "id", "taskId", "errorCategory", "estimatedInputTokens"
      FROM "LlmInvocationDiagnostic"
      WHERE "taskId" = ?
      ORDER BY "createdAt" DESC
      LIMIT 1
    `).get("task-1");

    assert.deepEqual(row, {
      id: "llmdiag_test_1",
      taskId: "task-1",
      errorCategory: "transport_error",
      estimatedInputTokens: 492,
    });
  } finally {
    database.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("PostgreSQL migration defines LlmInvocationDiagnostic table and lookup indexes", () => {
  const migrationSql = fs.readFileSync(postgresMigrationSqlPath, "utf8");

  assert.match(migrationSql, /CREATE TABLE IF NOT EXISTS "LlmInvocationDiagnostic"/);
  assert.match(migrationSql, /"taskId" TEXT/);
  assert.match(migrationSql, /"estimatedInputTokens" INTEGER/);
  assert.match(migrationSql, /"renderedPromptChars" INTEGER/);
  assert.match(migrationSql, /"messageChars" INTEGER/);
  assert.match(migrationSql, /"upstreamRequestId" TEXT/);
  assert.match(migrationSql, /"LlmInvocationDiagnostic_taskId_createdAt_idx"/);
  assert.match(migrationSql, /"LlmInvocationDiagnostic_status_createdAt_idx"/);
});

test("LLM diagnostic appendix exposes diagnosticId without leaking full base URL", () => {
  const upstreamRequestId = extractUpstreamRequestId("500 upstream error: do request failed (request id: req-123_abc)");
  const appendix = buildLlmDiagnosticFailureAppendix({
    id: "llmdiag_test",
    taskId: "task-1",
    novelId: "novel-1",
    promptId: "novel.story_macro.decomposition",
    promptVersion: "h1234567890ab",
    stage: "story_macro",
    itemKey: "book_contract",
    provider: "deepseek",
    model: "deepseek-v4-pro",
    baseUrlHost: resolveBaseUrlHost("https://api.example.com/v1?api_key=secret"),
    requestProtocol: "openai_compatible",
    strategy: "json_object",
    status: "failed",
    errorCategory: "transport_error",
    errorMessage: "500 upstream error",
    upstreamRequestId,
    estimatedInputTokens: 492,
    renderedPromptChars: 8600,
    messageChars: 9100,
    rawChars: null,
    latencyMs: 226129,
    warningCode: null,
    createdAt: "2026-05-05T11:00:00.000Z",
  });

  assert.equal(upstreamRequestId, "req-123_abc");
  assert.match(appendix, /diagnosticId=llmdiag_test/);
  assert.match(appendix, /upstreamRequestId=req-123_abc/);
  assert.equal(resolveBaseUrlHost("https://api.example.com/v1?api_key=secret"), "api.example.com");
  assert.doesNotMatch(appendix, /secret/);
});

test("LLM diagnostics retry persistence after a missing-table miss instead of disabling forever", async () => {
  const originals = {
    disable: process.env.LLM_INVOCATION_DIAGNOSTICS_DISABLE_PERSISTENCE,
    backoff: process.env.LLM_INVOCATION_DIAGNOSTICS_RETRY_BACKOFF_MS,
    create: prisma.llmInvocationDiagnostic.create,
    findFirst: prisma.llmInvocationDiagnostic.findFirst,
  };
  const createCalls = [];
  let failFirstCreate = true;

  process.env.LLM_INVOCATION_DIAGNOSTICS_DISABLE_PERSISTENCE = "0";
  process.env.LLM_INVOCATION_DIAGNOSTICS_RETRY_BACKOFF_MS = "0";
  prisma.llmInvocationDiagnostic.create = async ({ data }) => {
    createCalls.push(data.id);
    if (failFirstCreate) {
      failFirstCreate = false;
      const error = new Error("no such table: LlmInvocationDiagnostic");
      error.code = "P2021";
      throw error;
    }
    return { id: data.id };
  };
  prisma.llmInvocationDiagnostic.findFirst = async () => ({
    id: "llmdiag_recovered",
    taskId: "task-recovered",
    novelId: null,
    promptId: null,
    promptVersion: null,
    stage: null,
    itemKey: null,
    provider: "deepseek",
    model: "deepseek-chat",
    baseUrlHost: null,
    requestProtocol: "openai_compatible",
    strategy: "json_object",
    status: "started",
    errorCategory: null,
    errorMessage: null,
    upstreamRequestId: null,
    estimatedInputTokens: null,
    renderedPromptChars: null,
    messageChars: null,
    rawChars: null,
    latencyMs: null,
    warningCode: null,
    createdAt: new Date("2026-05-05T11:00:00.000Z"),
  });

  try {
    await createLlmInvocationDiagnostic({
      provider: "deepseek",
      model: "deepseek-chat",
      promptMeta: { taskId: "task-recovered" },
    });
    await createLlmInvocationDiagnostic({
      provider: "deepseek",
      model: "deepseek-chat",
      promptMeta: { taskId: "task-recovered" },
    });
    const latest = await findLatestLlmInvocationDiagnosticForTask("task-recovered");

    assert.equal(createCalls.length, 2);
    assert.equal(latest?.id, "llmdiag_recovered");
  } finally {
    if (originals.disable === undefined) {
      delete process.env.LLM_INVOCATION_DIAGNOSTICS_DISABLE_PERSISTENCE;
    } else {
      process.env.LLM_INVOCATION_DIAGNOSTICS_DISABLE_PERSISTENCE = originals.disable;
    }
    if (originals.backoff === undefined) {
      delete process.env.LLM_INVOCATION_DIAGNOSTICS_RETRY_BACKOFF_MS;
    } else {
      process.env.LLM_INVOCATION_DIAGNOSTICS_RETRY_BACKOFF_MS = originals.backoff;
    }
    prisma.llmInvocationDiagnostic.create = originals.create;
    prisma.llmInvocationDiagnostic.findFirst = originals.findFirst;
  }
});
