const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  cleanupLogDirectory,
  rotateLogFileIfNeeded,
} = require("../dist/platform/logging/logRetention.js");

function createTempLogsDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ai-novel-log-retention-"));
}

function writeFile(filePath, content = "log") {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function touchDaysAgo(filePath, daysAgo) {
  const timestamp = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  fs.utimesSync(filePath, timestamp, timestamp);
}

test("cleanupLogDirectory deletes expired known log files only", () => {
  const root = createTempLogsDir();
  const oldStandard = path.join(root, "2026-01-01", "old.log");
  const oldLlm = path.join(root, "2026-01-01", "old.llm.jsonl");
  const oldRepair = path.join(root, "2026-01-01", "old.llm-repair.jsonl");
  const unknown = path.join(root, "2026-01-01", "keep.sqlite");
  const recent = path.join(root, "2026-01-01", "recent.log");

  writeFile(oldStandard);
  writeFile(oldLlm);
  writeFile(oldRepair);
  writeFile(unknown);
  writeFile(recent);
  touchDaysAgo(oldStandard, 31);
  touchDaysAgo(oldLlm, 15);
  touchDaysAgo(oldRepair, 31);
  touchDaysAgo(unknown, 31);

  const summary = cleanupLogDirectory(root, {
    enabled: true,
    retentionDays: 30,
    llmRetentionDays: 14,
    maxFileMb: 50,
    minAgeHours: 24,
  });

  assert.equal(summary.deletedFiles, 3);
  assert.equal(fs.existsSync(oldStandard), false);
  assert.equal(fs.existsSync(oldLlm), false);
  assert.equal(fs.existsSync(oldRepair), false);
  assert.equal(fs.existsSync(unknown), true);
  assert.equal(fs.existsSync(recent), true);

  fs.rmSync(root, { recursive: true, force: true });
});

test("cleanupLogDirectory keeps logs inside the minimum age window", () => {
  const root = createTempLogsDir();
  const recentLlm = path.join(root, "recent.llm.jsonl");
  writeFile(recentLlm);
  touchDaysAgo(recentLlm, 2);

  const summary = cleanupLogDirectory(root, {
    enabled: true,
    retentionDays: 30,
    llmRetentionDays: 1,
    maxFileMb: 50,
    minAgeHours: 72,
  });

  assert.equal(summary.deletedFiles, 0);
  assert.equal(summary.preservedFiles, 1);
  assert.equal(fs.existsSync(recentLlm), true);

  fs.rmSync(root, { recursive: true, force: true });
});

test("cleanupLogDirectory ignores missing directories", () => {
  const root = path.join(os.tmpdir(), `ai-novel-missing-${Date.now()}`);
  const summary = cleanupLogDirectory(root, {
    enabled: true,
    retentionDays: 30,
    llmRetentionDays: 14,
    maxFileMb: 50,
    minAgeHours: 24,
  });

  assert.equal(summary.scannedFiles, 0);
  assert.equal(summary.deletedFiles, 0);
});

test("rotateLogFileIfNeeded rotates oversized active logs", () => {
  const root = createTempLogsDir();
  const activeLog = path.join(root, "session.llm.jsonl");
  fs.writeFileSync(activeLog, Buffer.alloc(2048));

  const result = rotateLogFileIfNeeded(activeLog, { maxFileMb: 0.001 });

  assert.equal(result.rotated, true);
  assert.equal(fs.existsSync(activeLog), false);
  assert.match(path.basename(result.rotatedPath), /^session-.+\.llm\.jsonl$/);
  assert.equal(fs.existsSync(result.rotatedPath), true);
  writeFile(activeLog, "next line");
  assert.equal(fs.existsSync(activeLog), true);

  fs.rmSync(root, { recursive: true, force: true });
});
