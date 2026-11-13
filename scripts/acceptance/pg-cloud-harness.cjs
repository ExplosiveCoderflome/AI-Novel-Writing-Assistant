#!/usr/bin/env node
/**
 * Cloud/CI disposable PostgreSQL acceptance driver for the 0.8.2 candidate.
 *
 * - Creates a unique empty database (never touches default ai_novel / user DBs)
 * - Records raw `prisma migrate deploy` on a fresh empty PG (historically expected
 *   to fail; a success is accepted if the historical chain is ever repaired)
 * - Applies schema via official `scripts/deploy-prisma-postgres.cjs --fresh-empty-ok`
 *   when raw deploy did not already succeed. Does not fall back to `db push`.
 * - Runs server/tests/pgCloudAcceptance.harness.test.js
 * - Drops the disposable database afterward
 *
 * Does not bump versions, tag, or trigger releases.
 */
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { randomBytes } = require("node:crypto");

const root = path.resolve(__dirname, "../..");
const serverDir = path.join(root, "server");
const adminUrl =
  process.env.PG_ADMIN_URL ||
  "postgresql://ai_novel_cloud:cloud_accept_only@127.0.0.1:5432/postgres";
const suffix = randomBytes(4).toString("hex");
const dbName = `ai_novel_cloud_accept_${suffix}`;
const harnessUrl = adminUrl.replace(/\/[^/?]+(\?.*)?$/, `/${dbName}$1`);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
  return result;
}

function psql(sql, database = "postgres") {
  const url = new URL(adminUrl);
  const env = { ...process.env, PGPASSWORD: decodeURIComponent(url.password || "") };
  return run(
    "psql",
    ["-h", url.hostname, "-p", url.port || "5432", "-U", url.username, "-d", database, "-v", "ON_ERROR_STOP=1", "-c", sql],
    { env },
  );
}

function main() {
  console.log(`[pg-cloud-harness] creating disposable database ${dbName}`);
  const owner = new URL(adminUrl).username || "ai_novel_cloud";
  let created = psql(`CREATE DATABASE ${dbName} OWNER ${owner};`);
  if (created.status !== 0) {
    console.error(created.stderr || created.stdout);
    process.exit(created.status || 1);
  }

  const report = {
    dbName,
    migrateDeployFresh: null,
    officialEmptyDeploy: null,
    harness: null,
  };

  try {
    const migrateEnv = {
      ...process.env,
      DATABASE_URL: harnessUrl,
      AI_NOVEL_DATABASE_MODE: "postgresql",
      NODE_OPTIONS: process.env.NODE_OPTIONS || "--max-old-space-size=8192",
    };
    const migrate = run("pnpm", ["exec", "prisma", "migrate", "deploy", "--config", "prisma.config.ts"], {
      cwd: serverDir,
      env: migrateEnv,
    });
    report.migrateDeployFresh = {
      status: migrate.status,
      stderrTail: (migrate.stderr || migrate.stdout || "").split("\n").slice(-12).join("\n"),
    };
    if (migrate.status === 0) {
      console.log("[pg-cloud-harness] raw prisma migrate deploy succeeded on fresh empty PG");
    } else {
      console.log("[pg-cloud-harness] raw prisma migrate deploy failed on fresh empty PG (historical chain; not claimed as official pass)");
    }

    if (migrate.status !== 0) {
      const official = run(
        process.execPath,
        [path.join(root, "scripts/deploy-prisma-postgres.cjs"), "--fresh-empty-ok"],
        { cwd: root, env: migrateEnv },
      );
      process.stdout.write(official.stdout || "");
      process.stderr.write(official.stderr || "");
      report.officialEmptyDeploy = {
        status: official.status,
        stderrTail: (official.stderr || official.stdout || "").split("\n").slice(-12).join("\n"),
      };
      if (official.status !== 0) {
        console.error("[pg-cloud-harness] official empty-PG deploy script failed; not falling back to db push");
        process.exit(official.status || 1);
      }
    } else {
      report.officialEmptyDeploy = { status: 0, skipped: "raw-migrate-deploy-already-succeeded" };
    }

    const harness = run(
      process.execPath,
      ["--test", path.join(serverDir, "tests", "pgCloudAcceptance.harness.test.js")],
      {
        cwd: serverDir,
        env: {
          ...migrateEnv,
          RAG_ENABLED: "false",
        },
      },
    );
    process.stdout.write(harness.stdout || "");
    process.stderr.write(harness.stderr || "");
    report.harness = { status: harness.status };
    const reportPath = path.join(root, ".tmp", `pg-cloud-harness-${suffix}.json`);
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`[pg-cloud-harness] report ${reportPath}`);
    if (harness.status !== 0) process.exit(harness.status || 1);
  } finally {
    psql(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${dbName}' AND pid <> pg_backend_pid();`,
    );
    const drop = psql(`DROP DATABASE IF EXISTS ${dbName};`);
    if (drop.status !== 0) {
      console.error("[pg-cloud-harness] failed to drop disposable database:", drop.stderr || drop.stdout);
    } else {
      console.log(`[pg-cloud-harness] dropped disposable database ${dbName}`);
    }
  }
}

main();
