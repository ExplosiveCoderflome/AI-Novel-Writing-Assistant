const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const serverRoot = path.resolve(__dirname, "..");
const testsRoot = path.join(serverRoot, "tests");

const integrationTests = new Set([
  "directorTaskFactInspection.test.js",
  "directorCurrentTask.test.js",
  "directorReadPathsArePure.test.js",
  "directorManualRecoveryLock.test.js",
  "directorWorkflowStepModules.test.js",
  "persistence.test.js",
  "directorNextReadOnlySqlite.test.js",
  "commandRepositorySqlite.test.js",
  "batchProcessRecoverySqlite.test.js",
  "confirmationRoutesSqlite.test.js",
  "gateProcessRecoverySqlite.test.js",
  "gateService.test.js",
  "openRunSwitchSqlite.test.js",
  "planningInventorySqlite.test.js",
  "processRecoverySqlite.test.js",
  "productionProgressSqlite.test.js",
  "recoveryBudgetSqlite.test.js",
  "readProjection.test.js",
  "commandService.test.js",
  "runExecutor.test.js",
  "worker.test.js",
  "runtime.test.js",
  "directorNextHttp.test.js",
  "novelDirectorPipelineRuntime.test.js",
  "novelDirectorRetry.test.js",
  "novelWorkflowRuntime.test.js",
  "p0bRealPrismaChain.test.js",
  "marketRadarRepeatAnalysis.test.js",
  "prompting-governance.test.js",
  "prompting.test.js",
  "promptWorkbench.test.js",
  "ragCompatibilityBootstrap.test.js",
  "runtimeMigrations.test.js",
]);

function listTestFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return listTestFiles(fullPath);
      }
      return entry.isFile() && entry.name.endsWith(".test.js") ? [fullPath] : [];
    })
    .sort((left, right) => left.localeCompare(right));
}

function selectTestFiles(mode) {
  const allFiles = listTestFiles(testsRoot);
  if (mode === "integration") {
    return allFiles.filter((file) => integrationTests.has(path.basename(file)));
  }
  if (mode === "fast") {
    return allFiles.filter((file) => !integrationTests.has(path.basename(file)));
  }
  if (mode === "all") {
    return allFiles;
  }
  throw new Error(`Unknown test mode: ${mode}`);
}

const mode = process.argv[2] ?? "fast";
const files = selectTestFiles(mode);

if (files.length === 0) {
  console.error(`No tests selected for mode ${mode}.`);
  process.exit(1);
}

// File isolation prevents cache replacements and root hooks from leaking across tests.
const result = spawnSync(process.execPath, ["--test", "--test-concurrency=4", ...files], {
  cwd: serverRoot,
  stdio: "inherit",
});

process.exit(result.status ?? 1);
