const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const serverRoot = path.resolve(__dirname, "../..");
const databaseScenarios = [
  "batchProcessRecoverySqlite.test.js",
  "confirmationRoutesSqlite.test.js",
  "gateProcessRecoverySqlite.test.js",
  "gateService.test.js",
  "openRunSwitchSqlite.test.js",
  "planningInventorySqlite.test.js",
  "processRecoverySqlite.test.js",
  "productionProgressSqlite.test.js",
  "recoveryBudgetSqlite.test.js",
];

function runSelectionFixture(mode) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "director-test-selection-"));
  fs.mkdirSync(path.join(root, "scripts"));
  fs.mkdirSync(path.join(root, "tests/directorNext/application"), { recursive: true });
  fs.copyFileSync(path.join(serverRoot, "scripts/run-tests.cjs"), path.join(root, "scripts/run-tests.cjs"));
  const output = path.join(root, "selected.jsonl");
  for (const name of [...databaseScenarios, "unit.test.js"]) {
    fs.writeFileSync(path.join(root, "tests/directorNext/application", name),
      `require("node:fs").appendFileSync(${JSON.stringify(output)}, ${JSON.stringify(name + "\n")});\n`);
  }
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["scripts/run-tests.cjs", mode], {
    cwd: root, encoding: "utf8", timeout: 30_000, env,
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return fs.readFileSync(output, "utf8").trim().split(/\r?\n/).sort();
}

test("fast mode does not execute director database scenarios", () => {
  assert.deepEqual(runSelectionFixture("fast"), ["unit.test.js"]);
});

test("integration mode executes every director database scenario", () => {
  assert.deepEqual(runSelectionFixture("integration"), [...databaseScenarios].sort());
});

test("fast mode isolates module state between test files", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "director-test-file-isolation-"));
  fs.mkdirSync(path.join(root, "scripts"));
  fs.mkdirSync(path.join(root, "tests"));
  fs.copyFileSync(path.join(serverRoot, "scripts/run-tests.cjs"), path.join(root, "scripts/run-tests.cjs"));
  fs.writeFileSync(path.join(root, "tests/a.test.js"),
    'global.directorTestFixture = "leaked"; require("node:test")("first file", () => {});\n');
  fs.writeFileSync(path.join(root, "tests/b.test.js"),
    'require("node:test")("second file", () => require("node:assert/strict").equal(global.directorTestFixture, undefined));\n');
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["scripts/run-tests.cjs", "fast"], {
    cwd: root, encoding: "utf8", timeout: 30_000, env,
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test("loading character persistence tests preserves the shared Prisma module", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "director-test-import-"));
  const script = `
    const assert = require("node:assert/strict");
    const before = require(${JSON.stringify(path.join(serverRoot, "dist/db/prisma.js"))}).prisma;
    require(${JSON.stringify(path.join(serverRoot, "tests/directorNext/steps/characterPersistence.test.js"))});
    const after = require(${JSON.stringify(path.join(serverRoot, "dist/db/prisma.js"))}).prisma;
    assert.equal(after === before, true, "test imports must not replace the shared database client");
    assert.equal(typeof after.taskCenterArchive.findUnique, "function");
    process.exit(0);
  `;
  const result = spawnSync(process.execPath, ["-e", script], {
    cwd: serverRoot, encoding: "utf8", timeout: 30_000,
    env: { ...process.env, NODE_ENV: "test", DATABASE_URL: `file:${path.join(root, "empty.db").replace(/\\/g, "/")}`,
      AI_NOVEL_RUNTIME: "desktop", AI_NOVEL_APP_DATA_DIR: root },
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
