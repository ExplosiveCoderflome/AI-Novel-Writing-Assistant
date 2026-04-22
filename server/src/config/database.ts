export type DatabaseProvider = "postgresql" | "sqlite";

const DEFAULT_POSTGRES_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:5432/ai_novel";
const DEFAULT_SQLITE_DATABASE_URL = "file:./dev.db";
const SQLITE_PRISMA_SCHEMA_PATH = "src/prisma/schema.sqlite.prisma";
const POSTGRES_PRISMA_SCHEMA_PATH = "src/prisma/schema.prisma";
const SQLITE_PRISMA_MIGRATIONS_PATH = "src/prisma/migrations.sqlite";
const POSTGRES_PRISMA_MIGRATIONS_PATH = "src/prisma/migrations";

function normalizeDatabaseMode(rawValue: string | undefined): DatabaseProvider | null {
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

function normalizePsycopgScheme(rawValue: string): string {
  return rawValue
    .replace(/^postgresql\+psycopg:\/\//i, "postgresql://")
    .replace(/^postgres\+psycopg:\/\//i, "postgres://");
}

export function normalizeDatabaseUrl(rawValue: string | undefined): string {
  const normalized = rawValue?.trim();
  if (!normalized) {
    return DEFAULT_POSTGRES_DATABASE_URL;
  }
  if (normalized.startsWith("file:")) {
    return normalized;
  }
  return normalizePsycopgScheme(normalized);
}

function resolveDefaultDatabaseProvider(options?: { preferSqlite?: boolean }): DatabaseProvider {
  if (options?.preferSqlite) {
    return "sqlite";
  }

  const explicitMode = normalizeDatabaseMode(process.env.AI_NOVEL_DATABASE_MODE);
  if (explicitMode) {
    return explicitMode;
  }

  if (process.env.AI_NOVEL_RUNTIME?.trim().toLowerCase() === "desktop") {
    return "sqlite";
  }

  return "postgresql";
}

function getDefaultDatabaseUrl(options?: { preferSqlite?: boolean }): string {
  return resolveDefaultDatabaseProvider(options) === "sqlite"
    ? DEFAULT_SQLITE_DATABASE_URL
    : DEFAULT_POSTGRES_DATABASE_URL;
}

export function getDatabaseUrl(options?: { allowDefault?: boolean; preferSqlite?: boolean }): string {
  const normalized = process.env.DATABASE_URL?.trim();
  if (normalized) {
    return normalizeDatabaseUrl(normalized);
  }
  if (options?.allowDefault ?? process.env.NODE_ENV !== "production") {
    return getDefaultDatabaseUrl(options);
  }
  throw new Error("DATABASE_URL is required in production.");
}

function resolveDatabaseProvider(url: string): DatabaseProvider {
  return url.startsWith("file:") ? "sqlite" : "postgresql";
}

export interface DatabaseRuntimeConfig {
  provider: DatabaseProvider;
  url: string;
  prismaSchemaPath: string;
  prismaMigrationsPath: string;
}

export function resolveDatabaseRuntimeConfig(options?: {
  allowDefault?: boolean;
  preferSqlite?: boolean;
}): DatabaseRuntimeConfig {
  const url = getDatabaseUrl(options);
  const provider = process.env.DATABASE_URL?.trim()
    ? resolveDatabaseProvider(url)
    : resolveDefaultDatabaseProvider(options);

  return {
    provider,
    url,
    prismaSchemaPath: provider === "sqlite" ? SQLITE_PRISMA_SCHEMA_PATH : POSTGRES_PRISMA_SCHEMA_PATH,
    prismaMigrationsPath:
      provider === "sqlite" ? SQLITE_PRISMA_MIGRATIONS_PATH : POSTGRES_PRISMA_MIGRATIONS_PATH,
  };
}

const DEFAULT_DATABASE_URL = DEFAULT_POSTGRES_DATABASE_URL;

export {
  DEFAULT_DATABASE_URL,
  DEFAULT_POSTGRES_DATABASE_URL,
  DEFAULT_SQLITE_DATABASE_URL,
  POSTGRES_PRISMA_SCHEMA_PATH,
  POSTGRES_PRISMA_MIGRATIONS_PATH,
  SQLITE_PRISMA_SCHEMA_PATH,
  SQLITE_PRISMA_MIGRATIONS_PATH,
};
