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

test("getDatabaseUrl falls back to the local default when DATABASE_URL is unset outside production", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalNodeEnv = process.env.NODE_ENV;
  delete process.env.DATABASE_URL;
  delete process.env.NODE_ENV;

  try {
    const { getDatabaseUrl, DEFAULT_DATABASE_URL } = loadDatabaseConfig();
    assert.equal(getDatabaseUrl(), DEFAULT_DATABASE_URL);
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
