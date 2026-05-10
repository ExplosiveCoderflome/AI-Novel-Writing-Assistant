import { defineConfig } from "prisma/config";

const DEFAULT_POSTGRES_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:5432/ai_novel";
const DEFAULT_SQLITE_DATABASE_URL = "file:./dev.db";
const SQLITE_PRISMA_SCHEMA_PATH = "src/prisma/schema.sqlite.prisma";
const POSTGRES_PRISMA_SCHEMA_PATH = "src/prisma/schema.prisma";
const SQLITE_PRISMA_MIGRATIONS_PATH = "src/prisma/migrations.sqlite";
const POSTGRES_PRISMA_MIGRATIONS_PATH = "src/prisma/migrations";

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

function normalizePsycopgScheme(rawValue) {
  return rawValue
    .replace(/^postgresql\+psycopg:\/\//i, "postgresql://")
    .replace(/^postgres\+psycopg:\/\//i, "postgres://");
}

function normalizeDatabaseUrl(rawValue) {
  const normalized = rawValue?.trim();
  if (!normalized) {
    return DEFAULT_SQLITE_DATABASE_URL;
  }
  if (normalized.startsWith("file:")) {
    return normalized;
  }
  return normalizePsycopgScheme(normalized);
}

function resolveDefaultDatabaseProvider() {
  const explicitMode = normalizeDatabaseMode(process.env.AI_NOVEL_DATABASE_MODE);
  return explicitMode ?? "sqlite";
}

function getDatabaseUrl() {
  const normalized = process.env.DATABASE_URL?.trim();
  if (normalized) {
    return normalizeDatabaseUrl(normalized);
  }
  return resolveDefaultDatabaseProvider() === "sqlite"
    ? DEFAULT_SQLITE_DATABASE_URL
    : DEFAULT_POSTGRES_DATABASE_URL;
}

function resolveDatabaseProvider(url) {
  return url.startsWith("file:") ? "sqlite" : "postgresql";
}

function resolveDatabaseRuntimeConfig() {
  const url = getDatabaseUrl();
  const provider = process.env.DATABASE_URL?.trim()
    ? resolveDatabaseProvider(url)
    : resolveDefaultDatabaseProvider();

  return {
    provider,
    url,
    prismaSchemaPath: provider === "sqlite" ? SQLITE_PRISMA_SCHEMA_PATH : POSTGRES_PRISMA_SCHEMA_PATH,
    prismaMigrationsPath: provider === "sqlite" ? SQLITE_PRISMA_MIGRATIONS_PATH : POSTGRES_PRISMA_MIGRATIONS_PATH,
  };
}

const runtimeConfig = resolveDatabaseRuntimeConfig();

export default defineConfig({
  schema: runtimeConfig.prismaSchemaPath,
  migrations: {
    path: runtimeConfig.prismaMigrationsPath,
    seed: "ts-node-dev --transpile-only src/db/seed.ts",
  },
  datasource: {
    url: runtimeConfig.url,
  },
});
