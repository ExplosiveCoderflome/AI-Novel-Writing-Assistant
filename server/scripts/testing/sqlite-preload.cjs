const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { initializeTemporarySqliteDatabase } = require("../../tests/testInfrastructure/tempSqliteDatabase.cjs");

// Never migrate an inherited DATABASE_URL. Each execution process owns a new
// directory, including the coordinator and reviewed isolation=none batches.
// Test modules can subsequently select their own (even deliberately empty) DB.
if (process.env.ANW_TEST_SKIP_SQLITE_PRELOAD === "1") {
  process.env.NODE_ENV = "test";
  console.log(`[test-sqlite] skipped preload for fixture pid=${process.pid}`);
} else {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "anw-suite-sqlite-"));
  const databaseUrl = initializeTemporarySqliteDatabase(root, "tests.sqlite");
  process.env.NODE_ENV = "test";
  process.env.AI_NOVEL_DATABASE_MODE = "sqlite";
  process.env.AI_NOVEL_APP_DATA_DIR = root;
  process.env.DATABASE_URL = databaseUrl;
  console.log(`[test-sqlite] ${JSON.stringify({ pid: process.pid, databaseUrl })}`);
}
