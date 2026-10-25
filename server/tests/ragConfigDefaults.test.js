const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const numericKeys = [
  "EMBEDDING_VERSION", "EMBEDDING_BATCH_SIZE", "RAG_EMBEDDING_TIMEOUT_MS", "RAG_EMBEDDING_MAX_RETRIES",
  "RAG_EMBEDDING_RETRY_BASE_MS", "QDRANT_TIMEOUT_MS", "QDRANT_UPSERT_MAX_BYTES", "RAG_CHUNK_SIZE",
  "RAG_CHUNK_OVERLAP", "RAG_VECTOR_CANDIDATES", "RAG_KEYWORD_CANDIDATES", "RAG_FINAL_TOP_K",
  "RAG_WORKER_POLL_MS", "RAG_WORKER_MAX_ATTEMPTS", "RAG_WORKER_RETRY_BASE_MS", "RAG_HTTP_TIMEOUT_MS",
  "RAG_RETRIEVAL_TRACE_SAMPLE_RATE", "RAG_RETRIEVAL_TRACE_RETENTION_DAYS",
];

function loadConfig(overrides = {}) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  for (const key of numericKeys) delete env[key];
  const result = spawnSync(process.execPath, ["-e", "process.stdout.write(JSON.stringify(require('./dist/config/rag.js').ragConfig))"], {
    cwd: path.resolve(__dirname, ".."), env: { ...env, ...overrides }, encoding: "utf8", timeout: 10_000,
  });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  return JSON.parse(result.stdout);
}

test("missing numeric environment values preserve the documented RAG defaults", () => {
  const config = loadConfig();
  const expected = {
    embeddingBatchSize: 64, embeddingTimeoutMs: 30000, embeddingMaxRetries: 2, embeddingRetryBaseMs: 500,
    qdrantTimeoutMs: 30000, qdrantUpsertMaxBytes: 24 * 1024 * 1024,
    chunkSize: 800, chunkOverlap: 120, vectorCandidates: 40, keywordCandidates: 40, finalTopK: 8,
    workerPollMs: 2500, workerMaxAttempts: 5, workerRetryBaseMs: 5000, httpTimeoutMs: 30000,
    retrievalTraceSampleRate: 1, retrievalTraceRetentionDays: 14,
  };
  for (const [key, value] of Object.entries(expected)) assert.equal(config[key], value, key);
});

test("blank and invalid numeric values fall back while explicit zero remains meaningful", () => {
  const config = loadConfig({ EMBEDDING_BATCH_SIZE: " ", RAG_EMBEDDING_TIMEOUT_MS: "bad", RAG_EMBEDDING_MAX_RETRIES: "0",
    RAG_CHUNK_OVERLAP: "0", RAG_RETRIEVAL_TRACE_SAMPLE_RATE: "0" });
  assert.equal(config.embeddingBatchSize, 64);
  assert.equal(config.embeddingTimeoutMs, 30000);
  assert.equal(config.embeddingMaxRetries, 0);
  assert.equal(config.chunkOverlap, 0);
  assert.equal(config.retrievalTraceSampleRate, 0);
});

test("explicit numeric limits are clamped and legacy HTTP timeout is honored", () => {
  const config = loadConfig({ EMBEDDING_BATCH_SIZE: "999", RAG_HTTP_TIMEOUT_MS: "42000", RAG_WORKER_MAX_ATTEMPTS: "-1" });
  assert.equal(config.embeddingBatchSize, 256);
  assert.equal(config.embeddingTimeoutMs, 42000);
  assert.equal(config.qdrantTimeoutMs, 42000);
  assert.equal(config.workerMaxAttempts, 1);
});
