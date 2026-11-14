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
 * - Retains disposable databases for diagnosis; the owning CI service is ephemeral.
 *
 * Does not bump versions, tag, or trigger releases.
 */
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { randomBytes } = require("node:crypto");

const root = path.resolve(__dirname, "../..");
const serverDir = path.join(root, "server");
const proofPath = process.env.PG_LIVE_PROOF_PATH
  ? path.resolve(process.env.PG_LIVE_PROOF_PATH)
  : path.join(root, ".tmp/pg-live-gate.json");
// Even an invalid invocation must invalidate a previous pass.
fs.rmSync(proofPath, { force: true });
const adminUrl = process.env.PG_ADMIN_URL;
if (!adminUrl || !/^postgres(ql)?:\/\//.test(adminUrl)) {
  console.error("[pg-cloud-harness] PG_ADMIN_URL is required and must be PostgreSQL; no live gate pass recorded.");
  process.exit(1);
}
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
    stdio: "inherit",
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
  console.log(`[pg-cloud-harness] creating disposable databases ${rawDbName} (raw evidence) and ${officialDbName} (official path)`);
  const owner = new URL(adminUrl).username || "ai_novel_cloud";
  for (const dbName of [rawDbName, officialDbName]) {
    const created = psql(`CREATE DATABASE ${dbName} OWNER ${owner};`);
    if (created.status !== 0) {
      console.error(created.stderr || created.stdout);
      throw new Error(`Unable to create ${dbName}`);
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
    for (const args of [["--filter", "@ai-novel/server", "prisma:generate"], ["--filter", "@ai-novel/shared", "build"], ["--filter", "@ai-novel/server", "build"]]) {
      if (run("pnpm", args, { cwd: root, env: officialEnv }).status !== 0) throw new Error(`PG preparation failed: ${args.join(" ")}`);
    }

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
      throw new Error("Official empty-PG deploy failed");
    }

    const backupPath = path.join(root, ".tmp", `pg-cloud-before-tests-${suffix}.dump`);
    fs.mkdirSync(path.dirname(backupPath), { recursive: true });
    const backupUrl = new URL(officialUrl);
    const backup = run("pg_dump", ["-h", backupUrl.hostname, "-p", backupUrl.port || "5432", "-U", backupUrl.username, "-d", officialDbName, "-Fc", "-f", backupPath], {
      env: { ...officialEnv, PGPASSWORD: decodeURIComponent(backupUrl.password || "") },
    });
    if (backup.status !== 0 || !fs.existsSync(backupPath) || fs.statSync(backupPath).size === 0) {
      throw new Error("PG harness backup failed; tests will not run");
    }
    console.log(`[pg-cloud-harness] verified pre-test backup ${backupPath} (${fs.statSync(backupPath).size} bytes)`);

    const harness = run(
      process.execPath,
      [path.join(serverDir, "scripts/run-tests.cjs"), "pg-live"],
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
    if (harness.status !== 0) throw new Error("PG live harness failed");
    const revision = run("git", ["rev-parse", "HEAD"], { cwd: root, stdio: ["ignore", "pipe", "inherit"] });
    if (revision.status !== 0) throw new Error("Cannot identify PG-tested revision");
    if (process.env.GITHUB_ACTIONS === "true") {
      if (revision.stdout.trim() !== process.env.GITHUB_SHA || !process.env.GITHUB_RUN_ID || !process.env.GITHUB_RUN_ATTEMPT) {
        throw new Error("PG-tested revision must match the current Actions SHA and run attempt");
      }
      fs.writeFileSync(proofPath, JSON.stringify({ schema: 1, status: "passed", head: revision.stdout.trim(), runId: process.env.GITHUB_RUN_ID, runAttempt: process.env.GITHUB_RUN_ATTEMPT }));
    }
    console.log("[pg-cloud-harness] PG live gate passed");
  } finally {
    console.log(`[pg-cloud-harness] retained disposable databases ${rawDbName}, ${officialDbName}; stop the owning temporary cluster after verification`);
  }
}

try { main(); } catch (error) { console.error(`[pg-cloud-harness] ${error.message}`); process.exitCode = 1; }
