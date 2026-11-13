const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const serverRoot = path.resolve(__dirname, "..");
const testsRoot = path.join(serverRoot, "tests");

const integrationTests = new Set([
  "directorLegacyPauseSqlite.test.js",
  "directorVolumeStrategyFreshBookSqlite.test.js",
  "shortStoryReviewSqlite.test.js",
  "manualKernelSqlite.test.js",
  "productionKernelProgressSqlite.test.js",
  "productionKernelConsumersSqlite.test.js",
  "productionKernelBatchBindingSqlite.test.js",
  "productionKernelFinalizationSqlite.test.js",
  "productionKernelClosureSqlite.test.js",
  "productionKernelBudgetSqlite.test.js",
  "productionKernelRecoverySqlite.test.js",
  "productionKernelModelPolicySqlite.test.js",
  "productionKernelReadinessSqlite.test.js",
  "productionKernelRagSqlite.test.js",
  "productionKernelEntrySqlite.test.js",
  "productionKernelNativeRuntimeSqlite.test.js",
  "productionKernelCompositionSqlite.test.js",
  "productionKernelCandidatesSqlite.test.js",
  "productionKernelReviewBudgetSqlite.test.js",
  "productionKernelPreparationSqlite.test.js",
  "productionKernelPreparationCheckpointSqlite.test.js",
  "productionKernelPreparationRecoverySqlite.test.js",
  "productionKernelPreparationNativeSqlite.test.js",
  "productionKernelBatchExecutionSqlite.test.js",
  "shortStoryRevisionRecovery.test.js",
  "shortStoryStructuredDiagnostics.test.js",
  "manualChapterSaveSqlite.test.js",
  "directorTaskFactInspection.test.js",
  "directorCurrentTask.test.js",
  "directorReadPathsArePure.test.js",
  "directorManualRecoveryLock.test.js",
  "directorResourceConfirmation.test.js",
  "directorVersionIsolationSqlite.test.js",
  "directorWorkflowStepModules.test.js",
  "persistence.test.js",
  "directorNextReadOnlySqlite.test.js",
  "runtimeDiagnosticsSqlite.test.js",
  "commandRepositorySqlite.test.js",
  "batchProcessRecoverySqlite.test.js",
  "confirmationRoutesSqlite.test.js",
  "directorChapterCountFallbackSqlite.test.js",
  "gateProcessRecoverySqlite.test.js",
  "gateService.test.js",
  "openRunSwitchSqlite.test.js",
  "planningInventorySqlite.test.js",
  "missingVolumeStrategySqlite.test.js",
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

function testKey(file) {
  return path.relative(testsRoot, file).split(path.sep).join("/");
}

function selectFastGroups(files) {
  const remaining = new Set(files);
  const groups = [];
  const manifestPath = path.join(__dirname, "test-batches.json");
  const manifest = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
    : { batches: [] };

  for (const batch of manifest.batches) {
    const explicitFiles = new Set(batch.files);
    const batchFiles = files.filter((file) => {
      if (!remaining.has(file)) return false;
      const key = testKey(file);
      return explicitFiles.has(key) || batch.directories.some(directory => key.startsWith(`${directory}/`));
    });
    if (batchFiles.length === 0) continue;
    for (const file of batchFiles) remaining.delete(file);
    groups.push({ files: batchFiles, isolation: "none", concurrency: 1 });
  }

  const serialFiles = new Set(manifest.serialFiles ?? []);
  const serial = files.filter((file) => remaining.has(file) && serialFiles.has(testKey(file)));
  if (serial.length > 0) {
    for (const file of serial) remaining.delete(file);
    groups.push({ files: serial, isolation: "process", concurrency: 1 });
  }

  const isolatedFiles = files.filter(file => remaining.has(file));
  if (isolatedFiles.length > 0) {
    groups.push({
      files: isolatedFiles,
      isolation: "process",
      concurrency: Math.max(1, Math.min(4, os.availableParallelism())),
    });
  }
  return groups;
}

function main() {
  const requestedMode = process.argv[2] ?? "fast";
  if (!new Set(["fast", "integration", "all"]).has(requestedMode)) {
    throw new Error(`Unknown test mode: ${requestedMode}`);
  }

  const modes = requestedMode === "all" ? ["fast", "integration"] : [requestedMode];
  const groups = modes.flatMap((mode) => {
    const files = selectTestFiles(mode);
    if (mode === "fast") return selectFastGroups(files);
    return files.length > 0 ? [{ files, isolation: "process", concurrency: Math.max(1, Math.min(2, os.availableParallelism())) }] : [];
  });
  if (groups.length === 0) {
    console.error(`No tests selected for mode ${requestedMode}.`);
    return 1;
  }

  let exitCode = 0;
  for (const group of groups) {
    // Only reviewed side-effect-free batches share a process. Every other file,
    // including all SQLite scenarios, keeps its own process; integration is capped at two.
    const result = spawnSync(process.execPath, [
      "--test",
      `--test-isolation=${group.isolation}`,
      `--test-concurrency=${group.concurrency}`,
      ...group.files.map((file) => path.relative(serverRoot, file)),
    ], {
      cwd: serverRoot,
      stdio: "inherit",
    });

    if (result.error) {
      console.error(`Unable to start tests: ${result.error.message}`);
    }
    if (result.status !== 0 && exitCode === 0) exitCode = result.status ?? 1;
  }
  return exitCode;
}

process.exit(main());
