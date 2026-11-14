const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const {
  SQLITE_DIALECT_FINGERPRINT,
  classifyPostgresState,
  planDeploy,
  parseTargetSchema,
  listMigrationNames,
  requirePostgresUrl,
  generateCurrentSchemaScript,
  childProcessFailure,
  postgresSchemaPath,
  postgresMigrationsDir,
} = require("../../scripts/deploy-prisma-postgres.cjs");

const prismaRoot = path.join(__dirname, "..", "src", "prisma");
const sqliteSchemaPath = path.join(prismaRoot, "schema.sqlite.prisma");
const sqliteMigrationsDir = path.join(prismaRoot, "migrations.sqlite");
const serverDir = path.join(__dirname, "..");

/** Historical files that already existed on origin/main (ae11c01c). Do not edit in place. */
const HISTORICAL_CHECKSUMS = {
  "20260328120000_schema_gap_backfill": "5bf4956aa923295d6f409a85c41bf35f14a41b609024c8828fae154a5c1d4c09",
  "20260413120000_postgresql_baseline": "2ec2f98f9231b1b14f8184d49a60b06673641cfb864958e20295df5fea1c25e9",
  "20260419123000_schema_column_backfill": "b69cd389df2a095a23a85e73184c78bf92b2c22d0af3fc5f69637ffc09de01d1",
  "20260421183000_style_extraction_task": "a897b1043c309326c8056a4ab6cd7001daf243b5e8d63335f20ebbfce6607896",
  "20260421202000_style_extraction_task_usage": "0e4bc1f0ddad87ac1b9c07270da53f3ffb9bf5917d395a439d8ef39a0005db72",
};

const HISTORICAL_SQLITE_DIALECT_MIGRATIONS = [
  "20260328120000_schema_gap_backfill",
  "20260421183000_style_extraction_task",
  "20260421202000_style_extraction_task_usage",
];

const CANDIDATE_082_MIGRATIONS = [
  "20261111140000_manuscript_short_story",
  "20261111150000_outline_feedback",
  "20261112090000_novel_pen_name",
];

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function readMigrationSql(migrationsDir, name) {
  return fs.readFileSync(path.join(migrationsDir, name, "migration.sql"), "utf8");
}

test("historical PG migration checksums are unchanged (no in-place history rewrite)", () => {
  for (const [name, expected] of Object.entries(HISTORICAL_CHECKSUMS)) {
    const actual = sha256File(path.join(postgresMigrationsDir, name, "migration.sql"));
    assert.equal(
      actual,
      expected,
      `${name} SQL changed; do not rewrite already-recorded historical checksums without an explicit baseline plan`,
    );
  }
});

test("only the known historical allowlist of PG migration files contains SQLite dialect tokens", () => {
  const offenders = listMigrationNames(postgresMigrationsDir).filter((name) => {
    const sql = readMigrationSql(postgresMigrationsDir, name);
    return SQLITE_DIALECT_FINGERPRINT.test(sql);
  });
  assert.deepEqual(offenders, HISTORICAL_SQLITE_DIALECT_MIGRATIONS);
});

test("0.8.2 candidate PG and SQLite migrations stay dual-schema and PG-dialect safe", () => {
  for (const name of CANDIDATE_082_MIGRATIONS) {
    const pgSql = readMigrationSql(postgresMigrationsDir, name);
    const sqliteSql = readMigrationSql(sqliteMigrationsDir, name);
    assert.equal(SQLITE_DIALECT_FINGERPRINT.test(pgSql), false, `${name} PG SQL must not use DATETIME/AUTOINCREMENT/PRAGMA`);
    assert.ok(sqliteSql.length > 0, `${name} must also exist for SQLite`);
  }
  const shortStory = readMigrationSql(postgresMigrationsDir, "20261111140000_manuscript_short_story");
  assert.match(shortStory, /ALTER TABLE "ShortStoryPlan"[\s\S]*intentVersionId[\s\S]*DROP NOT NULL/);
  const feedback = readMigrationSql(postgresMigrationsDir, "20261111150000_outline_feedback");
  assert.match(feedback, /CREATE TABLE "OutlineFeedbackRun"/);
  assert.match(feedback, /TIMESTAMP\(3\)/);
  assert.match(feedback, /feedbackSettingsJson/);
  const penName = readMigrationSql(postgresMigrationsDir, "20261112090000_novel_pen_name");
  assert.match(penName, /ALTER TABLE "Novel"/);
  assert.match(penName, /"penName"/);
});

test("both Prisma schemas declare the 0.8.2 structures", () => {
  const pgSchema = fs.readFileSync(postgresSchemaPath, "utf8");
  const sqliteSchema = fs.readFileSync(sqliteSchemaPath, "utf8");
  for (const source of [pgSchema, sqliteSchema]) {
    assert.match(source, /model OutlineFeedbackRun/);
    assert.match(source, /feedbackSettingsJson/);
    assert.match(source, /penName\s+String\?/);
    assert.match(source, /model ShortStoryPlan[\s\S]*intentVersionId\s+String\?/);
  }
});

test("raw migrate deploy on empty PG is a historical first-folder defect, not a new 0.8.2 SQL fault", () => {
  const names = listMigrationNames(postgresMigrationsDir);
  assert.equal(names[0], "20260328120000_schema_gap_backfill");
  assert.equal(names[1], "20260413120000_postgresql_baseline");
  const first = readMigrationSql(postgresMigrationsDir, names[0]);
  assert.match(first, /DATETIME/);
  const baseline = readMigrationSql(postgresMigrationsDir, "20260413120000_postgresql_baseline");
  assert.equal(SQLITE_DIALECT_FINGERPRINT.test(baseline), false);
  assert.match(baseline, /CREATE TYPE "ChapterGenerationState" AS ENUM/);
  assert.match(baseline, /"arcClimax"/);
  const columnBackfill = readMigrationSql(postgresMigrationsDir, "20260419123000_schema_column_backfill");
  assert.match(columnBackfill, /ALTER TABLE "Character" ADD COLUMN "arcClimax"/);
  assert.equal(
    /IF NOT EXISTS/i.test(columnBackfill),
    false,
    "column backfill stays non-idempotent versus postgresql_baseline; do not silently rewrite it",
  );
  for (const name of CANDIDATE_082_MIGRATIONS) {
    assert.ok(names.includes(name));
  }
});

test("classifyPostgresState and planDeploy refuse unsafe paths and require an explicit empty flag", () => {
  assert.equal(
    classifyPostgresState({ migrationsTableExists: false, appliedMigrationCount: 0, userTables: [] }).kind,
    "empty",
  );
  assert.equal(
    classifyPostgresState({
      migrationsTableExists: true,
      appliedMigrationCount: 10,
      userTables: ["Novel"],
    }).kind,
    "managed",
  );
  assert.equal(
    classifyPostgresState({
      migrationsTableExists: false,
      appliedMigrationCount: 0,
      userTables: ["Novel"],
    }).kind,
    "legacy",
  );
  assert.equal(planDeploy({ kind: "managed", userTables: ["Novel"], appliedMigrationCount: 3 }, {}).action, "migrate-deploy");
  assert.equal(planDeploy({ kind: "legacy", userTables: ["Novel"], appliedMigrationCount: 0 }, { freshEmptyOk: true }).action, "refuse-legacy");
  assert.equal(planDeploy({ kind: "empty", userTables: [], appliedMigrationCount: 0 }, {}).action, "refuse-empty-without-flag");
  assert.equal(
    planDeploy({ kind: "empty", userTables: [], appliedMigrationCount: 0 }, { freshEmptyOk: true }).action,
    "baseline-stamp-deploy",
  );
  assert.equal(
    planDeploy({ kind: "empty", userTables: [], appliedMigrationCount: 0 }, { freshEmptyOk: true, dryRun: true }).dryRun,
    true,
  );
});

test("deploy script rejects SQLite URLs and requires DATABASE_URL", () => {
  assert.throws(() => requirePostgresUrl(""), /required/);
  assert.throws(() => requirePostgresUrl("file:./dev.db"), /not SQLite/);
  assert.throws(() => requirePostgresUrl("sqlite:foo"), /not SQLite/);
  assert.equal(requirePostgresUrl("postgresql://app@127.0.0.1:5432/tmp"), "postgresql://app@127.0.0.1:5432/tmp");
});

test("child process failures retain Windows status, signal, and captured output", () => {
  assert.match(
    childProcessFailure({ status: null, signal: "SIGTERM", stderr: "prisma\nerror", stdout: "out" }, "prisma migrate diff"),
    /status=null, signal=SIGTERM[\s\S]*prisma[\s\S]*error/,
  );
  assert.match(
    childProcessFailure({ status: null, signal: null, error: { code: "ENOENT", message: "spawn pnpm.cmd ENOENT" } }, "prisma migrate diff"),
    /ENOENT: spawn pnpm\.cmd ENOENT/,
  );
});

test("prisma migrate diff from empty to current PG schema is dialect-safe and includes 0.8.2 objects", () => {
  const dummyUrl = "postgresql://prisma_diff:prisma_diff@127.0.0.1:5432/prisma_diff_dummy";
  const sql = generateCurrentSchemaScript(dummyUrl);
  assert.equal(SQLITE_DIALECT_FINGERPRINT.test(sql), false);
  assert.match(sql, /CREATE TABLE "Novel"/);
  assert.match(sql, /"penName" TEXT/);
  assert.match(sql, /CREATE TABLE "OutlineFeedbackRun"/);
  assert.match(sql, /"feedbackSettingsJson" TEXT NOT NULL DEFAULT '\{\}'/);
  assert.match(sql, /CREATE TABLE "ShortStoryPlan"[\s\S]*"intentVersionId" TEXT,/);
  assert.match(sql, /TIMESTAMP\(3\)/);
  assert.doesNotMatch(sql, /\bDATETIME\b/);
});

test("deploy script CLI help and missing-flag dry-run path do not write", () => {
  const help = spawnSync(process.execPath, [path.join(serverDir, "../scripts/deploy-prisma-postgres.cjs"), "--help"], {
    encoding: "utf8",
  });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /fresh-empty-ok/);
  assert.match(help.stdout, /does not rewrite historical/);

  const missingUrl = spawnSync(process.execPath, [path.join(serverDir, "../scripts/deploy-prisma-postgres.cjs"), "--dry-run"], {
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: "" },
  });
  assert.notEqual(missingUrl.status, 0);
});

test("parseTargetSchema honors Prisma schema and search_path query params", () => {
  assert.equal(parseTargetSchema("postgresql://app@127.0.0.1:5432/tmp"), "public");
  assert.equal(parseTargetSchema("postgresql://app@127.0.0.1:5432/tmp?schema=app"), "app");
  assert.equal(
    parseTargetSchema("postgresql://app@127.0.0.1:5432/tmp?schema=writing&sslmode=disable"),
    "writing",
  );
  assert.equal(parseTargetSchema("postgresql://app@127.0.0.1:5432/tmp?search_path=studio,public"), "studio");
});

test("views, sequences, and non-public objects are not classified as empty", () => {
  assert.equal(
    classifyPostgresState({
      targetSchema: "app",
      migrationsTableExists: false,
      appliedSuccessfulCount: 0,
      userObjects: [{ schema: "app", kind: "view", name: "chapter_overview" }],
    }).kind,
    "legacy",
  );
  assert.equal(
    classifyPostgresState({
      targetSchema: "public",
      migrationsTableExists: false,
      appliedSuccessfulCount: 0,
      userObjects: [{ schema: "public", kind: "sequence", name: "Novel_id_seq" }],
    }).kind,
    "legacy",
  );
  assert.equal(
    classifyPostgresState({
      targetSchema: "app",
      migrationsTableExists: false,
      appliedSuccessfulCount: 0,
      userObjects: [{ schema: "public", kind: "table", name: "Novel" }],
    }).kind,
    "legacy",
  );
  assert.equal(
    classifyPostgresState({
      targetSchema: "app",
      migrationsTableExists: false,
      appliedSuccessfulCount: 0,
      userObjects: [],
      userTables: [],
    }).kind,
    "empty",
  );
});

test("PostgreSQL object inspection casts relkind before concatenation", () => {
  const deployScript = fs.readFileSync(path.join(serverDir, "../scripts/deploy-prisma-postgres.cjs"), "utf8");
  assert.match(deployScript, /n\.nspname::text \|\| ',' \|\| c\.relkind::text \|\| ',' \|\| c\.relname::text/);
  assert.match(deployScript, /n\.nspname::text \|\| ',' \|\| t\.typtype::text \|\| ',' \|\| t\.typname::text/);
  assert.doesNotMatch(deployScript, /n\.nspname \|\| ',' \|\| c\.relkind \|\| ',' \|\| c\.relname/);
  assert.doesNotMatch(deployScript, /n\.nspname \|\| ',' \|\| t\.typtype \|\| ',' \|\| t\.typname/);
  assert.match(deployScript, /const state = inspectWithPsql\(databaseUrl\);/);
  assert.doesNotMatch(deployScript, /const state = classifyPostgresState\(inspected\);/);
});

test("failed or rolled-back _prisma_migrations rows refuse deploy and are never managed", () => {
  const failed = classifyPostgresState({
    targetSchema: "public",
    migrationsTableExists: true,
    appliedMigrationCount: 1,
    appliedSuccessfulCount: 0,
    failedMigrations: [{ name: "20260328120000_schema_gap_backfill", schema: "public" }],
    userObjects: [],
  });
  assert.equal(failed.kind, "failed-history");
  assert.equal(planDeploy(failed, { freshEmptyOk: true }).action, "refuse-failed-history");

  const mixed = classifyPostgresState({
    targetSchema: "app",
    migrationsTableExists: true,
    appliedSuccessfulCount: 10,
    appliedMigrationCount: 11,
    failedMigrations: [{ name: "20261111140000_manuscript_short_story", schema: "app" }],
    userObjects: [{ schema: "app", kind: "table", name: "Novel" }],
  });
  assert.equal(mixed.kind, "failed-history");
  assert.notEqual(planDeploy(mixed, {}).action, "migrate-deploy");
});

test("pg-cloud-harness uses two disposable databases and never official-deploys on raw failure evidence", () => {
  const src = fs.readFileSync(path.join(serverDir, "../scripts/acceptance/pg-cloud-harness.cjs"), "utf8");
  assert.match(src, /rawDbName/);
  assert.match(src, /officialDbName/);
  assert.match(src, /ai_novel_cloud_raw_/);
  assert.match(src, /ai_novel_cloud_official_/);
  assert.match(src, /BUG-6/);
  assert.match(src, /DATABASE_URL: officialUrl/);
  assert.match(src, /DATABASE_URL: rawUrl/);
  assert.match(src, /env: officialEnv/);
});
