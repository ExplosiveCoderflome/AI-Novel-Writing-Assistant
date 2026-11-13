#!/usr/bin/env node
/**
 * Cloud/CI disposable PostgreSQL acceptance driver for the 0.8.2 candidate.
 *
 * - Creates a unique empty database (never touches default ai_novel / user DBs)
 * - Records that `prisma migrate deploy` fails on a fresh empty PG (known defect)
 * - Applies current schema via `prisma db push` for functional acceptance only
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
    dbPush: null,
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
      console.log("[pg-cloud-harness] unexpected: migrate deploy succeeded on fresh empty PG");
    } else {
      console.log("[pg-cloud-harness] confirmed: migrate deploy fails on fresh empty PG (not claimed as pass)");
    }

    // Functional path: current schema via db push (explicitly not migrate-deploy)
    const push = run(
      "pnpm",
      ["exec", "prisma", "db", "push", "--config", "prisma.config.ts", "--accept-data-loss"],
      { cwd: serverDir, env: migrateEnv },
    );
    report.dbPush = { status: push.status, stdoutTail: (push.stdout || "").split("\n").slice(-8).join("\n") };
    if (push.status !== 0) {
      console.error(push.stderr || push.stdout);
      process.exit(push.status || 1);
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
