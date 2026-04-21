const test = require("node:test");
const assert = require("node:assert/strict");
const { randomBytes } = require("node:crypto");
const childProcess = require("node:child_process");
const { URL } = require("node:url");

const repoRoot = require("node:path").resolve(__dirname, "..", "..");
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const postgresDatabaseUrl = resolvePostgresDatabaseUrl();
const skipReason = postgresDatabaseUrl
  ? undefined
  : "TEST_POSTGRES_DATABASE_URL or postgres DATABASE_URL is not set";

function resolvePostgresDatabaseUrl() {
  const candidates = [process.env.TEST_POSTGRES_DATABASE_URL, process.env.DATABASE_URL];
  for (const candidate of candidates) {
    if (candidate && /^postgres(?:ql)?:\/\//i.test(candidate)) {
      return candidate;
    }
  }
  return null;
}

function buildAdminDatabaseUrl(databaseUrl) {
  const url = new URL(databaseUrl);
  url.searchParams.delete("schema");
  return url.toString();
}

function buildSchemaDatabaseUrl(databaseUrl, schemaName) {
  const url = new URL(databaseUrl);
  url.searchParams.set("schema", schemaName);
  return url.toString();
}

function execPrisma(args, envOverrides, input) {
  return childProcess.execFileSync(
    pnpmCommand,
    ["--filter", "@ai-novel/server", "exec", "prisma", ...args],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        ...envOverrides,
      },
      input,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
}

async function withIsolatedSchema(run) {
  if (!postgresDatabaseUrl) {
    throw new Error("postgres database URL is not configured");
  }

  const schemaName = `canonical_state_${randomBytes(8).toString("hex")}`;
  const adminDatabaseUrl = buildAdminDatabaseUrl(postgresDatabaseUrl);
  const databaseUrl = buildSchemaDatabaseUrl(postgresDatabaseUrl, schemaName);
  let schemaCreated = false;

  try {
    execPrisma(["db", "execute", "--stdin"], { DATABASE_URL: adminDatabaseUrl }, `CREATE SCHEMA IF NOT EXISTS "${schemaName}";`);
    schemaCreated = true;
    execPrisma(["migrate", "deploy", "--schema", "src/prisma/schema.prisma"], { DATABASE_URL: databaseUrl });
    return await run({ databaseUrl, schemaName });
  } finally {
    if (schemaCreated) {
      execPrisma(["db", "execute", "--stdin"], { DATABASE_URL: adminDatabaseUrl }, `DROP SCHEMA IF EXISTS "${schemaName}" CASCADE;`);
    }
  }
}

async function queryColumns(databaseUrl, schemaName) {
  const { PrismaPg } = require("@prisma/adapter-pg");
  const { PrismaClient } = require("@prisma/client");
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });

  try {
    return await prisma.$queryRawUnsafe(`
      SELECT table_name AS "tableName", column_name AS "columnName", data_type AS "dataType", datetime_precision AS "datetimePrecision", is_nullable AS "isNullable", COALESCE(column_default, '') AS "columnDefault"
      FROM information_schema.columns
      WHERE table_schema = '${schemaName}'
        AND table_name IN ('CanonicalStateVersion', 'StateChangeProposal')
        AND column_name IN ('createdAt', 'updatedAt')
      ORDER BY table_name, column_name
    `);
  } finally {
    await prisma.$disconnect();
  }
}

test("canonical state migration deploys with postgres timestamp columns", { skip: skipReason }, async () => {
  const columns = await withIsolatedSchema(({ databaseUrl, schemaName }) => queryColumns(databaseUrl, schemaName));

  assert.deepEqual(
    columns.map(({ tableName, columnName }) => [tableName, columnName]),
    [
      ["CanonicalStateVersion", "createdAt"],
      ["StateChangeProposal", "createdAt"],
      ["StateChangeProposal", "updatedAt"],
    ],
  );

  for (const column of columns) {
    assert.equal(column.dataType, "timestamp without time zone");
    assert.equal(column.datetimePrecision, 3);
    assert.equal(column.isNullable, "NO");
  }

  const canonicalCreatedAt = columns.find((column) => column.tableName === "CanonicalStateVersion" && column.columnName === "createdAt");
  const proposalCreatedAt = columns.find((column) => column.tableName === "StateChangeProposal" && column.columnName === "createdAt");
  const proposalUpdatedAt = columns.find((column) => column.tableName === "StateChangeProposal" && column.columnName === "updatedAt");

  assert.match(canonicalCreatedAt.columnDefault, /CURRENT_TIMESTAMP/i);
  assert.match(proposalCreatedAt.columnDefault, /CURRENT_TIMESTAMP/i);
  assert.equal(proposalUpdatedAt.columnDefault, "");
});
