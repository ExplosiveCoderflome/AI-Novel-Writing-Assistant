#!/usr/bin/env node
/**
 * Non-publish probe: spawn pnpm(.cmd) with shell:false for prisma migrate diff.
 * Used by Windows Publish Path Verify CI only — does not tag or upload.
 */
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../..");
const serverDir = path.join(repoRoot, "server");
const cmd = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const result = spawnSync(
  cmd,
  [
    "exec",
    "prisma",
    "migrate",
    "diff",
    "--config",
    "prisma.config.ts",
    "--from-empty",
    "--to-schema=src/prisma/schema.prisma",
    "--script",
  ],
  {
    cwd: serverDir,
    encoding: "utf8",
    shell: false,
    timeout: 120_000,
    env: {
      ...process.env,
      DATABASE_URL: "postgresql://prisma_diff:prisma_diff@127.0.0.1:5432/prisma_diff_dummy",
    },
  },
);

const report = {
  platform: process.platform,
  cmd,
  shell: false,
  status: result.status,
  signal: result.signal,
  error: result.error ? { code: result.error.code, message: result.error.message } : null,
  stdoutChars: String(result.stdout || "").length,
  stderrChars: String(result.stderr || "").length,
  stderrHead: String(result.stderr || "").slice(0, 800),
};
console.log(JSON.stringify(report, null, 2));

if (result.error) {
  console.error("[probe-win-pnpm-spawn] spawn failed");
  process.exit(1);
}
if (result.status !== 0) {
  console.error("[probe-win-pnpm-spawn] prisma migrate diff non-zero");
  console.error(String(result.stderr || result.stdout || ""));
  process.exit(1);
}
if (!String(result.stdout || "").includes("CREATE TABLE")) {
  console.error("[probe-win-pnpm-spawn] unexpected empty/invalid migrate diff script");
  process.exit(1);
}
console.log("[probe-win-pnpm-spawn] OK");
