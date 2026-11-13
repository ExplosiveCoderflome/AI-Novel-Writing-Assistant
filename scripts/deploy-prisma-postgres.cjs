#!/usr/bin/env node
/**
 * Official PostgreSQL deploy path that does not rewrite historical migration SQL.
 *
 * Why this exists:
 *   `prisma migrate deploy` on a completely empty PostgreSQL database is historically
 *   broken on origin/main already: the first recorded migration
 *   `20260328120000_schema_gap_backfill` is SQLite-dialect (`DATETIME`), and later
 *   recordings include more SQLite SQL plus a non-idempotent column backfill that
 *   conflicts with `20260413120000_postgresql_baseline`. This is a baseline-process
 *   design issue, not a regression introduced by the 0.8.2 candidate migrations.
 *
 * This script never:
 *   - edits or replaces historical migration.sql files (checksums stay intact)
 *   - runs `prisma migrate reset`, `db push`, DROP DATABASE, or truncate
 *   - auto-stamps `_prisma_migrations` on a database that already has user tables
 *     but no migration history (legacy db-push / unknown baseline)
 *
 * Modes (see classifyPostgresState):
 *   empty    → apply current schema via `prisma migrate diff --from-empty --to-schema`
 *              then `migrate resolve --applied` for every existing folder, then
 *              `migrate deploy` (should be a no-op except for future new folders)
 *   managed  → only `prisma migrate deploy` (incremental, including 0.8.2 folders
 *              if they are not yet applied)
 *   legacy   → refuse and print a manual reconcile checklist
 *
 * Usage:
 *   AI_NOVEL_DATABASE_MODE=postgresql DATABASE_URL=postgresql://... \
 *     node scripts/deploy-prisma-postgres.cjs --dry-run
 *   AI_NOVEL_DATABASE_MODE=postgresql DATABASE_URL=postgresql://... \
 *     node scripts/deploy-prisma-postgres.cjs --fresh-empty-ok
 */
"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");

const root = path.resolve(__dirname, "..");
const serverDir = path.join(root, "server");
const postgresSchemaPath = path.join(serverDir, "src/prisma/schema.prisma");
const postgresMigrationsDir = path.join(serverDir, "src/prisma/migrations");

const SQLITE_DIALECT_FINGERPRINT = /\b(DATETIME|AUTOINCREMENT|PRAGMA\b|WITHOUT ROWID)\b/i;

function redactDatabaseUrl(urlString) {
  try {
    const url = new URL(urlString);
    if (url.password) url.password = "****";
    return url.toString();
  } catch {
    return "<unparseable-database-url>";
  }
}

function listMigrationNames(migrationsDir = postgresMigrationsDir) {
  return fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

function classifyPostgresState({ migrationsTableExists, appliedMigrationCount, userTables }) {
  const tables = [...new Set(userTables || [])].sort();
  if (migrationsTableExists && appliedMigrationCount > 0) {
    return { kind: "managed", userTables: tables, appliedMigrationCount };
  }
  if (tables.length > 0) {
    return { kind: "legacy", userTables: tables, appliedMigrationCount: appliedMigrationCount || 0 };
  }
  return { kind: "empty", userTables: [], appliedMigrationCount: 0 };
}

function planDeploy(state, flags = {}) {
  if (state.kind === "managed") {
    return {
      action: "migrate-deploy",
      reason: "database already has _prisma_migrations history; apply only pending incremental migrations",
    };
  }
  if (state.kind === "legacy") {
    return {
      action: "refuse-legacy",
      reason:
        "tables exist without a usable Prisma migration history; refuse to auto-stamp or replay historical SQL",
    };
  }
  if (!flags.freshEmptyOk) {
    return {
      action: "refuse-empty-without-flag",
      reason: "empty database requires explicit --fresh-empty-ok before applying a current-schema baseline",
    };
  }
  if (flags.dryRun) {
    return {
      action: "baseline-stamp-deploy",
      dryRun: true,
      reason: "empty database would receive current schema.prisma baseline, then historical folders would be stamped as applied",
    };
  }
  return {
    action: "baseline-stamp-deploy",
    reason: "empty database: apply current schema.prisma SQL, stamp existing migration folders, then migrate deploy",
  };
}

function prismaEnv(databaseUrl) {
  return {
    ...process.env,
    DATABASE_URL: databaseUrl,
    AI_NOVEL_DATABASE_MODE: "postgresql",
  };
}

function runPrisma(databaseUrl, args, options = {}) {
  const result = spawnSync("pnpm", ["exec", "prisma", ...args], {
    cwd: serverDir,
    encoding: "utf8",
    env: prismaEnv(databaseUrl),
    ...options,
  });
  return result;
}

function parseArgs(argv) {
  const flags = { dryRun: false, freshEmptyOk: false, help: false };
  for (const arg of argv) {
    if (arg === "--dry-run") flags.dryRun = true;
    else if (arg === "--fresh-empty-ok") flags.freshEmptyOk = true;
    else if (arg === "--help" || arg === "-h") flags.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return flags;
}

function helpText() {
  return `Official PostgreSQL deploy path (does not rewrite historical migration checksums)

Usage:
  node scripts/deploy-prisma-postgres.cjs --dry-run
  node scripts/deploy-prisma-postgres.cjs --fresh-empty-ok

Required env:
  DATABASE_URL                 postgresql://... (never a user DB unless you intend to migrate it)
  AI_NOVEL_DATABASE_MODE       postgresql (set automatically by this script)

Flags:
  --dry-run                    classify and print the plan; no writes
  --fresh-empty-ok             required to baseline a completely empty database
  --help                       show this help

This command is the official empty-PG path. Raw \`pnpm prisma:deploy\` on an empty
cluster remains historically broken and must not be treated as a pass.
`;
}

function requirePostgresUrl(urlString) {
  if (!urlString) {
    throw new Error("DATABASE_URL is required");
  }
  const lower = urlString.toLowerCase();
  if (lower.startsWith("file:") || lower.includes("mode=memory") || lower.startsWith("sqlite:")) {
    throw new Error("DATABASE_URL must be a PostgreSQL URL, not SQLite");
  }
  if (!lower.startsWith("postgres://") && !lower.startsWith("postgresql://")) {
    throw new Error("DATABASE_URL must start with postgresql:// or postgres://");
  }
  return urlString;
}

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function inspectWithPsql(databaseUrl) {
  const url = new URL(databaseUrl);
  const env = { ...process.env, PGPASSWORD: decodeURIComponent(url.password || "") };
  const baseArgs = [
    "-h",
    url.hostname,
    "-p",
    url.port || "5432",
    "-U",
    decodeURIComponent(url.username || ""),
    "-d",
    decodeURIComponent(url.pathname.replace(/^\//, "")),
    "-v",
    "ON_ERROR_STOP=1",
    "-At",
    "-F",
    ",",
  ];
  const run = (sql) => {
    const result = spawnSync("psql", [...baseArgs, "-c", sql], { encoding: "utf8", env });
    if (result.status !== 0) {
      const err = (result.stderr || result.stdout || "psql failed").trim();
      throw new Error(`psql inspect failed: ${err}`);
    }
    return (result.stdout || "").trim();
  };

  const migrationsTableExists =
    run(
      "SELECT CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '_prisma_migrations') THEN '1' ELSE '0' END",
    ) === "1";
  let appliedMigrationCount = 0;
  if (migrationsTableExists) {
    appliedMigrationCount = Number(run(`SELECT COUNT(*) FROM ${quoteIdent("public")}.${quoteIdent("_prisma_migrations")}`));
  }
  const userOut = run(
    "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' ORDER BY tablename",
  );
  const userTables = userOut ? userOut.split(/\n/).filter(Boolean) : [];
  return { migrationsTableExists, appliedMigrationCount, userTables };
}

function generateCurrentSchemaScript(databaseUrl) {
  const result = runPrisma(databaseUrl, [
    "migrate",
    "diff",
    "--config",
    "prisma.config.ts",
    "--from-empty",
    "--to-schema=src/prisma/schema.prisma",
    "--script",
  ]);
  if (result.status !== 0) {
    throw new Error(`prisma migrate diff failed:\n${result.stderr || result.stdout}`);
  }
  const sql = result.stdout || "";
  if (SQLITE_DIALECT_FINGERPRINT.test(sql)) {
    throw new Error("generated baseline SQL unexpectedly contains SQLite dialect tokens");
  }
  return sql;
}

function applySqlFile(databaseUrl, filePath) {
  const result = runPrisma(databaseUrl, [
    "db",
    "execute",
    "--config",
    "prisma.config.ts",
    "--file",
    filePath,
  ]);
  if (result.status !== 0) {
    throw new Error(`prisma db execute failed:\n${result.stderr || result.stdout}`);
  }
}

function stampAllMigrations(databaseUrl, names) {
  for (const name of names) {
    const result = runPrisma(databaseUrl, [
      "migrate",
      "resolve",
      "--config",
      "prisma.config.ts",
      "--applied",
      name,
    ]);
    if (result.status !== 0) {
      throw new Error(`prisma migrate resolve --applied ${name} failed:\n${result.stderr || result.stdout}`);
    }
  }
}

function migrateDeploy(databaseUrl) {
  const result = runPrisma(databaseUrl, ["migrate", "deploy", "--config", "prisma.config.ts"]);
  if (result.status !== 0) {
    throw new Error(`prisma migrate deploy failed:\n${result.stderr || result.stdout}`);
  }
  return result;
}

function printLegacyInstructions() {
  console.error(`Refusing to auto-stamp or replay history on a non-empty PostgreSQL database without _prisma_migrations.

Manual reconcile (operator-owned, never automatic):
  1. Take a backup. Do not use migrate reset / db push / DROP.
  2. Compare the live database to the current Prisma schema (no writes):
       AI_NOVEL_DATABASE_MODE=postgresql DATABASE_URL=... \\
         pnpm --dir server exec prisma migrate diff --config prisma.config.ts \\
         --from-config-datasource --to-schema=src/prisma/schema.prisma --script
  3. If the diff is not empty, bring the live schema forward with a reviewed incremental
     migration or manual SQL. Do not mark history applied on a drifted database.
  4. Only when the diff is empty, stamp historical folders in timestamp order:
       pnpm --dir server exec prisma migrate resolve --config prisma.config.ts --applied <migration_name>
  5. Then run: pnpm --dir server exec prisma migrate deploy --config prisma.config.ts
`);
}

function main() {
  const flags = parseArgs(process.argv.slice(2));
  if (flags.help) {
    process.stdout.write(helpText());
    return;
  }
  const databaseUrl = requirePostgresUrl(process.env.DATABASE_URL);
  console.log(`[deploy-prisma-postgres] target ${redactDatabaseUrl(databaseUrl)}`);

  const inspected = inspectWithPsql(databaseUrl);
  const state = classifyPostgresState(inspected);
  const plan = planDeploy(state, flags);
  console.log(`[deploy-prisma-postgres] state=${state.kind} applied=${state.appliedMigrationCount} userTables=${state.userTables.length}`);
  console.log(`[deploy-prisma-postgres] plan=${plan.action} (${plan.reason})`);

  if (plan.action === "refuse-empty-without-flag" || plan.action === "refuse-legacy") {
    if (plan.action === "refuse-legacy") printLegacyInstructions();
    else console.error("Pass --fresh-empty-ok to baseline a completely empty database (after confirming it is disposable / intended).");
    process.exit(2);
  }

  if (flags.dryRun) {
    if (plan.action === "baseline-stamp-deploy") {
      const names = listMigrationNames();
      console.log(`[deploy-prisma-postgres] dry-run would apply current schema.prisma SQL and stamp ${names.length} folders, then migrate deploy`);
    } else {
      console.log("[deploy-prisma-postgres] dry-run would run prisma migrate deploy only");
    }
    return;
  }

  if (plan.action === "migrate-deploy") {
    migrateDeploy(databaseUrl);
    console.log("[deploy-prisma-postgres] migrate deploy finished");
    return;
  }

  const sql = generateCurrentSchemaScript(databaseUrl);
  const tmpDir = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "pg-baseline-"));
  const sqlPath = path.join(tmpDir, "current-schema.prisma.sql");
  fs.writeFileSync(sqlPath, sql);
  try {
    applySqlFile(databaseUrl, sqlPath);
    const names = listMigrationNames();
    stampAllMigrations(databaseUrl, names);
    migrateDeploy(databaseUrl);
    console.log(`[deploy-prisma-postgres] empty baseline applied and ${names.length} historical folders stamped; migrate deploy finished`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

module.exports = {
  SQLITE_DIALECT_FINGERPRINT,
  classifyPostgresState,
  planDeploy,
  listMigrationNames,
  redactDatabaseUrl,
  requirePostgresUrl,
  generateCurrentSchemaScript,
  postgresSchemaPath,
  postgresMigrationsDir,
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[deploy-prisma-postgres] ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}
