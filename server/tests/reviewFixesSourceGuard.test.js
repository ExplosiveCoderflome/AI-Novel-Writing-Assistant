const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const taskAdapterPath = path.join(root, "src", "services", "task", "adapters", "NovelWorkflowTaskAdapter.ts");
const diagnosticsPath = path.join(root, "src", "llm", "invocationDiagnostics.ts");

test("auto-director retry no longer forces running tasks to bypass resume guard", () => {
  const source = fs.readFileSync(taskAdapterPath, "utf8");

  assert.match(source, /await this\.novelDirectorService\.continueTask\(id, \{\s*batchAlreadyStartedCount,\s*\}\);/s);
  assert.doesNotMatch(source, /forceResumeRunning\s*:\s*true/);
});

test("LLM diagnostic persistence uses temporary backoff instead of permanent self-disable", () => {
  const source = fs.readFileSync(diagnosticsPath, "utf8");

  assert.match(source, /let diagnosticPersistenceRetryAfterMs = 0;/);
  assert.match(source, /LLM_INVOCATION_DIAGNOSTICS_RETRY_BACKOFF_MS/);
  assert.match(source, /Date\.now\(\) < diagnosticPersistenceRetryAfterMs/);
  assert.doesNotMatch(source, /diagnosticPersistenceUnavailable\s*=\s*true/);
});
