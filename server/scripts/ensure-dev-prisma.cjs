const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const rootDir = path.resolve(__dirname, "..");
const generatedClientPath = path.join(rootDir, "node_modules", "@prisma", "client", "index.js");
const stampPath = path.join(rootDir, ".tmp", "prisma-dev-prepare.json");
const prismaCliPath = path.join(rootDir, "node_modules", "prisma", "build", "index.js");

function normalizeDatabaseMode(rawValue) {
  const normalized = rawValue?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (normalized === "sqlite" || normalized === "file") {
    return "sqlite";
  }
  if (normalized === "postgres" || normalized === "postgresql" || normalized === "pg") {
    return "postgresql";
  }
  return null;
}

function resolveDatabaseRuntimeConfig() {
  const normalizedDatabaseUrl = process.env.DATABASE_URL?.trim();
  const explicitMode = normalizeDatabaseMode(process.env.AI_NOVEL_DATABASE_MODE);
  const runtimeMode = process.env.AI_NOVEL_RUNTIME?.trim().toLowerCase();
  const provider = normalizedDatabaseUrl
    ? (normalizedDatabaseUrl.startsWith("file:") ? "sqlite" : "postgresql")
    : (explicitMode ?? (runtimeMode === "desktop" ? "sqlite" : "postgresql"));

  return {
    provider,
    url: normalizedDatabaseUrl
      ?? (provider === "sqlite" ? "file:./dev.db" : "postgresql://postgres:postgres@127.0.0.1:5432/ai_novel"),
    prismaSchemaPath: provider === "sqlite" ? "src/prisma/schema.sqlite.prisma" : "src/prisma/schema.prisma",
  };
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function runPrisma(args) {
  const result = spawnSync(process.execPath, [prismaCliPath, ...args], {
    cwd: rootDir,
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function main() {
  const runtimeConfig = resolveDatabaseRuntimeConfig();
  const schemaPath = path.join(rootDir, runtimeConfig.prismaSchemaPath);
  const dbPath = runtimeConfig.provider === "sqlite"
    ? path.join(rootDir, runtimeConfig.url.replace(/^file:/, "") || "dev.db")
    : null;
  const schemaStat = fs.statSync(schemaPath);
  const stamp = readJson(stampPath);
  const schemaMtimeMs = schemaStat.mtimeMs;
  const schemaChanged = !stamp
    || stamp.schemaMtimeMs !== schemaMtimeMs
    || stamp.prismaSchemaPath !== runtimeConfig.prismaSchemaPath
    || stamp.databaseProvider !== runtimeConfig.provider;
  const missingGeneratedClient = !fs.existsSync(generatedClientPath);
  const missingDb = dbPath ? !fs.existsSync(dbPath) : false;

  if (!schemaChanged && !missingGeneratedClient && !missingDb) {
    console.log("[dev-prisma] schema unchanged, skipping prisma generate/push.");
    return;
  }

  if (schemaChanged || missingGeneratedClient) {
    console.log("[dev-prisma] running prisma generate...");
    runPrisma(["generate", "--schema", runtimeConfig.prismaSchemaPath]);
  }

  if (schemaChanged || missingDb) {
    console.log("[dev-prisma] running prisma push...");
    runPrisma(["db", "push", "--schema", runtimeConfig.prismaSchemaPath]);
  }

  fs.mkdirSync(path.dirname(stampPath), { recursive: true });
  fs.writeFileSync(
    stampPath,
    `${JSON.stringify(
      {
        schemaMtimeMs,
        prismaSchemaPath: runtimeConfig.prismaSchemaPath,
        databaseProvider: runtimeConfig.provider,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

main();
