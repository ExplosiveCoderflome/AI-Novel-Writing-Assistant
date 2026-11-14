const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const serverRoot = path.resolve(__dirname, "..", "..");
const preload = path.join(serverRoot, "scripts", "testing", "sqlite-preload.cjs");
const knowledgeStatusSuite = path.join(serverRoot, "tests", "knowledgeServiceStatus.test.js");
const bookAnalysisSuite = path.join(serverRoot, "tests", "bookAnalysis.test.js");

function runUnderRagDisabled(args) {
  const env = {
    ...process.env,
    RAG_ENABLED: "false",
    NODE_ENV: "test",
  };
  // Avoid inheriting parent suite NODE_OPTIONS / DB overrides into the child boot.
  // NODE_TEST_CONTEXT must be cleared or nested `node --test` skips files.
  delete env.NODE_OPTIONS;
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_TEST_WORKER_ID;
  delete env.DATABASE_URL;
  delete env.AI_NOVEL_DATABASE_MODE;
  delete env.AI_NOVEL_APP_DATA_DIR;
  delete env.AI_NOVEL_RUNTIME;
  delete env.ANW_TEST_SKIP_SQLITE_PRELOAD;

  const result = spawnSync(
    process.execPath,
    ["--test", "--require", preload, "--test-isolation=process", "--test-concurrency=1", ...args],
    {
      cwd: serverRoot,
      env,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  return {
    ...result,
    output: `${result.stdout || ""}\n${result.stderr || ""}`,
  };
}

/**
 * Attempt3-style release failures matched RAG_ENABLED=false: retrieveByFacet returned []
 * and knowledge status updates skipped queueing. These suites must stay hermetic even when
 * the process boots with RAG disabled (do not rely on ambient ragConfig.enabled).
 */
test("knowledge status suite stays green when booted with RAG_ENABLED=false", () => {
  const result = runUnderRagDisabled([knowledgeStatusSuite]);
  assert.equal(result.status, 0, result.output.slice(-4000));
  assert.match(result.output, /restoring archived knowledge document queues a rebuild/);
  assert.match(result.output, /archiving knowledge document queues index cleanup/);
  assert.match(result.output, /ℹ fail 0/);
});

test("facet retrieval stays green when booted with RAG_ENABLED=false", () => {
  const result = runUnderRagDisabled([
    "--test-name-pattern=retrieveByFacet applies facet filters",
    bookAnalysisSuite,
  ]);
  assert.equal(result.status, 0, result.output.slice(-4000));
  assert.match(result.output, /HybridRetrievalService retrieveByFacet applies facet filters/);
  assert.match(result.output, /ℹ fail 0/);
});
