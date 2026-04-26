const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const databaseConfigPath = path.join(__dirname, "../dist/config/database.js");

function loadDatabaseConfig() {
  delete require.cache[databaseConfigPath];
  return require(databaseConfigPath);
}

test("normalizeDatabaseUrl converts psycopg postgres schemes to Prisma-compatible schemes", () => {
  const { normalizeDatabaseUrl } = loadDatabaseConfig();

  assert.equal(
    normalizeDatabaseUrl("postgresql+psycopg://user:pass@db.internal:5432/app"),
    "postgresql://user:pass@db.internal:5432/app",
  );
  assert.equal(
    normalizeDatabaseUrl("postgres+psycopg://user:pass@db.internal:5432/app"),
    "postgres://user:pass@db.internal:5432/app",
  );
});

test("normalizeDatabaseUrl preserves already compatible postgres URLs", () => {
  const { normalizeDatabaseUrl } = loadDatabaseConfig();

  assert.equal(
    normalizeDatabaseUrl("  postgresql://user:pass@db.internal:5432/app  "),
    "postgresql://user:pass@db.internal:5432/app",
  );
});

test("getDatabaseUrl defaults to sqlite when DATABASE_URL is unset outside production", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalRuntime = process.env.AI_NOVEL_RUNTIME;
  const originalMode = process.env.AI_NOVEL_DATABASE_MODE;
  delete process.env.DATABASE_URL;
  delete process.env.NODE_ENV;
  delete process.env.AI_NOVEL_RUNTIME;
  delete process.env.AI_NOVEL_DATABASE_MODE;

  try {
    const {
      DEFAULT_DATABASE_URL,
      DEFAULT_SQLITE_DATABASE_URL,
      getDatabaseUrl,
      resolveDatabaseRuntimeConfig,
    } = loadDatabaseConfig();
    const config = resolveDatabaseRuntimeConfig();

    assert.equal(DEFAULT_DATABASE_URL, DEFAULT_SQLITE_DATABASE_URL);
    assert.equal(getDatabaseUrl(), DEFAULT_SQLITE_DATABASE_URL);
    assert.equal(config.provider, "sqlite");
    assert.equal(config.url, DEFAULT_SQLITE_DATABASE_URL);
    assert.equal(config.prismaSchemaPath, "src/prisma/schema.sqlite.prisma");
    assert.equal(config.prismaMigrationsPath, "src/prisma/migrations.sqlite");
  } finally {
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
    if (originalRuntime === undefined) {
      delete process.env.AI_NOVEL_RUNTIME;
    } else {
      process.env.AI_NOVEL_RUNTIME = originalRuntime;
    }
    if (originalMode === undefined) {
      delete process.env.AI_NOVEL_DATABASE_MODE;
    } else {
      process.env.AI_NOVEL_DATABASE_MODE = originalMode;
    }
  }
});

test("getDatabaseUrl rejects missing DATABASE_URL in production", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalNodeEnv = process.env.NODE_ENV;
  delete process.env.DATABASE_URL;
  process.env.NODE_ENV = "production";

  try {
    const { getDatabaseUrl } = loadDatabaseConfig();
    assert.throws(() => getDatabaseUrl(), /DATABASE_URL is required in production/);
  } finally {
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  }
});

test("getDatabaseUrl can prefer the sqlite default for legacy local runtime", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalNodeEnv = process.env.NODE_ENV;
  delete process.env.DATABASE_URL;
  delete process.env.NODE_ENV;

  try {
    const { getDatabaseUrl, DEFAULT_SQLITE_DATABASE_URL } = loadDatabaseConfig();
    assert.equal(getDatabaseUrl({ preferSqlite: true }), DEFAULT_SQLITE_DATABASE_URL);
  } finally {
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  }
});

test("resolveDatabaseRuntimeConfig selects sqlite schema for desktop legacy mode", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalRuntime = process.env.AI_NOVEL_RUNTIME;
  const originalMode = process.env.AI_NOVEL_DATABASE_MODE;
  delete process.env.DATABASE_URL;
  delete process.env.NODE_ENV;
  process.env.AI_NOVEL_RUNTIME = "desktop";
  delete process.env.AI_NOVEL_DATABASE_MODE;

  try {
    const {
      DEFAULT_SQLITE_DATABASE_URL,
      resolveDatabaseRuntimeConfig,
    } = loadDatabaseConfig();
    const config = resolveDatabaseRuntimeConfig();

    assert.equal(config.provider, "sqlite");
    assert.equal(config.url, DEFAULT_SQLITE_DATABASE_URL);
    assert.equal(config.prismaSchemaPath, "src/prisma/schema.sqlite.prisma");
    assert.equal(config.prismaMigrationsPath, "src/prisma/migrations.sqlite");
  } finally {
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
    if (originalRuntime === undefined) {
      delete process.env.AI_NOVEL_RUNTIME;
    } else {
      process.env.AI_NOVEL_RUNTIME = originalRuntime;
    }
    if (originalMode === undefined) {
      delete process.env.AI_NOVEL_DATABASE_MODE;
    } else {
      process.env.AI_NOVEL_DATABASE_MODE = originalMode;
    }
  }
});

test("resolveDatabaseRuntimeConfig keeps postgres schema when a postgres URL is configured", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalRuntime = process.env.AI_NOVEL_RUNTIME;
  const originalMode = process.env.AI_NOVEL_DATABASE_MODE;
  process.env.DATABASE_URL = "postgresql://writer:pass@db.internal:5432/ai_novel";
  process.env.AI_NOVEL_RUNTIME = "desktop";
  delete process.env.AI_NOVEL_DATABASE_MODE;

  try {
    const { resolveDatabaseRuntimeConfig } = loadDatabaseConfig();
    const config = resolveDatabaseRuntimeConfig();

    assert.equal(config.provider, "postgresql");
    assert.equal(config.url, "postgresql://writer:pass@db.internal:5432/ai_novel");
    assert.equal(config.prismaSchemaPath, "src/prisma/schema.prisma");
    assert.equal(config.prismaMigrationsPath, "src/prisma/migrations");
  } finally {
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
    if (originalRuntime === undefined) {
      delete process.env.AI_NOVEL_RUNTIME;
    } else {
      process.env.AI_NOVEL_RUNTIME = originalRuntime;
    }
    if (originalMode === undefined) {
      delete process.env.AI_NOVEL_DATABASE_MODE;
    } else {
      process.env.AI_NOVEL_DATABASE_MODE = originalMode;
    }
  }
});
