#!/usr/bin/env node
/**
 * Cloud/CI disposable PostgreSQL acceptance driver for the 0.8.2 candidate.
 *
 * - Creates TWO unique empty databases (never touches default ai_novel / user DBs)
 *   rawDb:      records raw `prisma migrate deploy` evidence only
 *   officialDb: official `scripts/deploy-prisma-postgres.cjs --fresh-empty-ok`
 *               and subsequent harness tests
 * - Raw deploy is historically expected to fail (P3018 on the first SQLite-dialect
 *   migration). A success is accepted if the historical chain is ever repaired.
 * - Official path never runs on the raw-failure database (BUG-6 / P3009).
 * - Does not fall back to `db push`.
 * - Drops both disposable databases afterward.
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
const rawDbName = `ai_novel_cloud_raw_${suffix}`;
const officialDbName = `ai_novel_cloud_official_${suffix}`;

function urlFor(dbName) {
  return adminUrl.replace(/\/[^/?]+(\?.*)?$/, `/${dbName}$1`);
}

const rawUrl = urlFor(rawDbName);
const officialUrl = urlFor(officialDbName);

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

function dropDisposable(dbName) {
  psql(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${dbName}' AND pid <> pg_backend_pid();`,
  );
  const drop = psql(`DROP DATABASE IF EXISTS ${dbName};`);
  if (drop.status !== 0) {
    console.error(`[pg-cloud-harness] failed to drop disposable database ${dbName}:`, drop.stderr || drop.stdout);
    return false;
  }
  console.log(`[pg-cloud-harness] dropped disposable database ${dbName}`);
  return true;
}

function main() {
  console.log(`[pg-cloud-harness] creating disposable databases ${rawDbName} (raw evidence) and ${officialDbName} (official path)`);
  const owner = new URL(adminUrl).username || "ai_novel_cloud";
  for (const dbName of [rawDbName, officialDbName]) {
    const created = psql(`CREATE DATABASE ${dbName} OWNER ${owner};`);
    if (created.status !== 0) {
      console.error(created.stderr || created.stdout);
      dropDisposable(rawDbName);
      dropDisposable(officialDbName);
      process.exit(created.status || 1);
    }
  }

  const report = {
    rawDbName,
    officialDbName,
    migrateDeployFresh: null,
    officialEmptyDeploy: null,
    harness: null,
  };

  try {
    const rawEnv = {
      ...process.env,
      DATABASE_URL: rawUrl,
      AI_NOVEL_DATABASE_MODE: "postgresql",
      NODE_OPTIONS: process.env.NODE_OPTIONS || "--max-old-space-size=8192",
    };
    const officialEnv = {
      ...rawEnv,
      DATABASE_URL: officialUrl,
    };

    const migrate = run("pnpm", ["exec", "prisma", "migrate", "deploy", "--config", "prisma.config.ts"], {
      cwd: serverDir,
      env: rawEnv,
    });
    report.migrateDeployFresh = {
      status: migrate.status,
      database: rawDbName,
      stderrTail: (migrate.stderr || migrate.stdout || "").split("\n").slice(-12).join("\n"),
    };
    if (migrate.status === 0) {
      console.log("[pg-cloud-harness] raw prisma migrate deploy succeeded on fresh empty PG (raw database only)");
    } else {
      console.log("[pg-cloud-harness] raw prisma migrate deploy failed on fresh empty PG (historical chain; evidence kept on raw database; not claimed as official pass)");
    }

    const official = run(
      process.execPath,
      [path.join(root, "scripts/deploy-prisma-postgres.cjs"), "--fresh-empty-ok"],
      { cwd: root, env: officialEnv },
    );
    process.stdout.write(official.stdout || "");
    process.stderr.write(official.stderr || "");
    report.officialEmptyDeploy = {
      status: official.status,
      database: officialDbName,
      stderrTail: (official.stderr || official.stdout || "").split("\n").slice(-12).join("\n"),
    };
    if (official.status !== 0) {
      console.error("[pg-cloud-harness] official empty-PG deploy script failed on the official database; not falling back to db push; raw-failure evidence left intact");
      process.exit(official.status || 1);
    }

    const harness = run(
      process.execPath,
      ["--test", path.join(serverDir, "tests", "pgCloudAcceptance.harness.test.js")],
      {
        cwd: serverDir,
        env: {
          ...officialEnv,
          RAG_ENABLED: "false",
        },
      },
    );
    process.stdout.write(harness.stdout || "");
    process.stderr.write(harness.stderr || "");
    report.harness = { status: harness.status, database: officialDbName };
    const reportPath = path.join(root, ".tmp", `pg-cloud-harness-${suffix}.json`);
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`[pg-cloud-harness] report ${reportPath}`);
    if (harness.status !== 0) process.exit(harness.status || 1);
  } finally {
    dropDisposable(rawDbName);
    dropDisposable(officialDbName);
  }
}

main();
