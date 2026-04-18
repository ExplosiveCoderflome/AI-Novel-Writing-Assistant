const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");
const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");
const { PrismaClient } = require("@prisma/client");

const repoRoot = path.resolve(__dirname, "..", "..");
const serverRoot = path.resolve(repoRoot, "server");
const seedDatabasePath = path.resolve(serverRoot, "dev.db");

const RAG_SETTING_KEYS = [
  "rag.embeddingProvider",
  "rag.embeddingModel",
  "rag.embeddingCollectionMode",
  "rag.embeddingCollectionName",
  "rag.embeddingCollectionTag",
  "rag.embeddingAutoReindexOnChange",
  "rag.embeddingBatchSize",
  "rag.embeddingTimeoutMs",
  "rag.embeddingMaxRetries",
  "rag.embeddingRetryBaseMs",
  "rag.enabled",
  "rag.qdrantUrl",
  "rag.qdrantApiKey",
  "rag.qdrantTimeoutMs",
  "rag.qdrantUpsertMaxBytes",
  "rag.chunkSize",
  "rag.chunkOverlap",
  "rag.vectorCandidates",
  "rag.keywordCandidates",
  "rag.finalTopK",
  "rag.workerPollMs",
  "rag.workerMaxAttempts",
  "rag.workerRetryBaseMs",
  "rag.httpTimeoutMs",
];

const LEGACY_ENV_KEYS = [
  "DATABASE_URL",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "OPENAI_MODEL",
  "OPENAI_EMBEDDING_MODEL",
  "SILICONFLOW_API_KEY",
  "SILICONFLOW_BASE_URL",
  "SILICONFLOW_MODEL",
  "SILICONFLOW_EMBEDDING_MODEL",
  "EMBEDDING_PROVIDER",
  "EMBEDDING_MODEL",
  "QDRANT_URL",
  "QDRANT_API_KEY",
  "QDRANT_COLLECTION",
  "RAG_ENABLED",
  "EMBEDDING_BATCH_SIZE",
  "RAG_EMBEDDING_TIMEOUT_MS",
  "RAG_EMBEDDING_MAX_RETRIES",
  "RAG_EMBEDDING_RETRY_BASE_MS",
  "QDRANT_TIMEOUT_MS",
  "QDRANT_UPSERT_MAX_BYTES",
  "RAG_CHUNK_SIZE",
  "RAG_CHUNK_OVERLAP",
  "RAG_VECTOR_CANDIDATES",
  "RAG_KEYWORD_CANDIDATES",
  "RAG_FINAL_TOP_K",
  "RAG_WORKER_POLL_MS",
  "RAG_WORKER_MAX_ATTEMPTS",
  "RAG_WORKER_RETRY_BASE_MS",
  "RAG_HTTP_TIMEOUT_MS",
];

function createPrisma(databasePath) {
  const adapter = new PrismaBetterSqlite3({
    url: `file:${databasePath.replace(/\\/g, "/")}`,
  });
  return new PrismaClient({
    adapter,
    log: ["error"],
  });
}

function createTempDatabase(prefix) {
  if (!fs.existsSync(seedDatabasePath)) {
    throw new Error(`seed database not found: ${seedDatabasePath}`);
  }

  const tempRoot = path.join(serverRoot, ".tmp");
  fs.mkdirSync(tempRoot, { recursive: true });
  const tempDir = fs.mkdtempSync(path.join(tempRoot, `${prefix}-`));
  const databasePath = path.join(tempDir, `${prefix}.db`);
  fs.copyFileSync(seedDatabasePath, databasePath);

  return {
    tempDir,
    databasePath,
    databaseUrl: `file:${databasePath.replace(/\\/g, "/")}`,
  };
}

async function prepareLegacyDatabase(databasePath, { addLegacyKnowledgeMarker = false } = {}) {
  const prisma = createPrisma(databasePath);
  try {
    await prisma.appSetting.deleteMany({
      where: {
        key: {
          in: RAG_SETTING_KEYS,
        },
      },
    });
    await prisma.aPIKey.deleteMany({
      where: {
        provider: {
          in: ["openai", "siliconflow"],
        },
      },
    });

    if (addLegacyKnowledgeMarker) {
      await prisma.ragIndexJob.create({
        data: {
          tenantId: "default",
          jobType: "upsert",
          ownerType: "knowledge_document",
          ownerId: `legacy-doc-${Date.now()}`,
          status: "queued",
        },
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}

function buildScenarioEnv(databaseUrl, overrides) {
  const env = {
    ...process.env,
  };

  for (const key of LEGACY_ENV_KEYS) {
    delete env[key];
  }

  return {
    ...env,
    DATABASE_URL: databaseUrl,
    ...overrides,
  };
}

function writeChildScript(tempDir) {
  const scriptPath = path.join(tempDir, "run-rag-compatibility.cjs");
  const script = `
const path = require("node:path");

async function main() {
  global.prisma = undefined;
  const repoRoot = process.cwd();
  const { initializeRagSettingsCompatibility } = require(path.join(repoRoot, "server", "dist", "services", "settings", "RagCompatibilityBootstrapService.js"));
  const { getRagEmbeddingSettings, getRagEmbeddingProviders } = require(path.join(repoRoot, "server", "dist", "services", "settings", "RagSettingsService.js"));
  const { getRagRuntimeSettings } = require(path.join(repoRoot, "server", "dist", "services", "settings", "RagRuntimeSettingsService.js"));
  const { prisma } = require(path.join(repoRoot, "server", "dist", "db", "prisma.js"));

  try {
    const report = await initializeRagSettingsCompatibility();
    const embedding = await getRagEmbeddingSettings();
    const runtime = await getRagRuntimeSettings();
    const providers = await getRagEmbeddingProviders();
    const settings = await prisma.appSetting.findMany({
      where: {
        key: {
          startsWith: "rag.",
        },
      },
      orderBy: {
        key: "asc",
      },
      select: {
        key: true,
        value: true,
      },
    });
    const apiKeys = await prisma.aPIKey.findMany({
      where: {
        provider: {
          in: ["openai", "siliconflow"],
        },
      },
      orderBy: {
        provider: "asc",
      },
      select: {
        provider: true,
        key: true,
        baseURL: true,
        model: true,
        isActive: true,
      },
    });

    console.log(JSON.stringify({
      report,
      embedding,
      runtime,
      providers,
      settings,
      apiKeys,
    }));
  } finally {
    await prisma.$disconnect();
    global.prisma = undefined;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
`;

  fs.writeFileSync(scriptPath, script, "utf8");
  return scriptPath;
}

async function withScenario(prefix, envOverrides, options, callback) {
  const tempDatabase = createTempDatabase(prefix);

  try {
    await prepareLegacyDatabase(tempDatabase.databasePath, options);
    const scriptPath = writeChildScript(tempDatabase.tempDir);
    const stdout = childProcess.execFileSync(process.execPath, [scriptPath], {
      cwd: repoRoot,
      env: buildScenarioEnv(tempDatabase.databaseUrl, envOverrides),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    await callback(JSON.parse(stdout.trim()));
  } finally {
    fs.rmSync(tempDatabase.tempDir, { recursive: true, force: true });
  }
}

test("legacy RAG env bootstrap preserves the historical default collection when legacy knowledge exists", async () => {
  await withScenario(
    "rag-legacy-default-collection",
    {
      RAG_ENABLED: "true",
      EMBEDDING_PROVIDER: "openai",
      OPENAI_EMBEDDING_MODEL: "text-embedding-3-small",
      QDRANT_URL: "http://legacy-qdrant:6333",
      QDRANT_API_KEY: "legacy-qdrant-key",
      QDRANT_COLLECTION: "ai_novel_chunks_v1",
      RAG_CHUNK_SIZE: "777",
    },
    { addLegacyKnowledgeMarker: true },
    async (result) => {
      assert.ok(result.report.importedSettingKeys.includes("rag.embeddingCollectionMode"));
      assert.ok(result.report.importedSettingKeys.includes("rag.embeddingCollectionName"));
      assert.equal(result.embedding.embeddingProvider, "openai");
      assert.equal(result.embedding.embeddingModel, "text-embedding-3-small");
      assert.equal(result.embedding.collectionMode, "manual");
      assert.equal(result.embedding.collectionName, "ai_novel_chunks_v1");
      assert.equal(result.runtime.qdrantUrl, "http://legacy-qdrant:6333");
      assert.equal(result.runtime.chunkSize, 777);

      const collectionNameSetting = result.settings.find((item) => item.key === "rag.embeddingCollectionName");
      assert.deepEqual(collectionNameSetting, {
        key: "rag.embeddingCollectionName",
        value: "ai_novel_chunks_v1",
      });
    },
  );
});

test("legacy provider-specific embedding env is imported when generic embedding env is absent", async () => {
  await withScenario(
    "rag-legacy-siliconflow",
    {
      RAG_ENABLED: "true",
      SILICONFLOW_API_KEY: "legacy-siliconflow-key",
      SILICONFLOW_BASE_URL: "https://api.siliconflow.cn/v1",
      SILICONFLOW_MODEL: "Qwen/Qwen2.5-7B-Instruct",
      SILICONFLOW_EMBEDDING_MODEL: "BAAI/bge-m3",
      QDRANT_URL: "http://legacy-qdrant:6333",
    },
    {},
    async (result) => {
      assert.ok(result.report.importedSettingKeys.includes("rag.embeddingProvider"));
      assert.ok(result.report.importedSettingKeys.includes("rag.embeddingModel"));
      assert.ok(result.report.importedProviderRecords.includes("siliconflow"));
      assert.equal(result.embedding.embeddingProvider, "siliconflow");
      assert.equal(result.embedding.embeddingModel, "BAAI/bge-m3");

      const siliconflowProvider = result.providers.find((item) => item.provider === "siliconflow");
      assert.ok(siliconflowProvider);
      assert.equal(siliconflowProvider.isConfigured, true);
      assert.equal(siliconflowProvider.isActive, true);

      const siliconflowApiKey = result.apiKeys.find((item) => item.provider === "siliconflow");
      assert.ok(siliconflowApiKey);
      assert.equal(siliconflowApiKey.key, "legacy-siliconflow-key");
      assert.equal(siliconflowApiKey.baseURL, "https://api.siliconflow.cn/v1");
      assert.equal(siliconflowApiKey.isActive, true);
    },
  );
});
