#!/usr/bin/env node
/**
 * Non-publish probe: use the production Node/Prisma launch path for migrate diff.
 * Used by Windows Publish Path Verify CI only — does not tag or upload.
 */
const { runPrisma, childProcessFailure } = require("../deploy-prisma-postgres.cjs");
const cmd = process.execPath;
const result = runPrisma(
  "postgresql://prisma_diff:prisma_diff@127.0.0.1:5432/prisma_diff_dummy",
  [
    "migrate",
    "diff",
    "--config",
    "prisma.config.ts",
    "--from-empty",
    "--to-schema=src/prisma/schema.prisma",
    "--script",
  ],
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
  console.error(childProcessFailure(result, "production prisma migrate diff probe"));
  process.exit(1);
}
if (result.status !== 0) {
  console.error("[probe-win-pnpm-spawn] prisma migrate diff non-zero");
  console.error(childProcessFailure(result, "production prisma migrate diff probe"));
  process.exit(1);
}
if (!String(result.stdout || "").includes("CREATE TABLE")) {
  console.error("[probe-win-pnpm-spawn] unexpected empty/invalid migrate diff script");
  process.exit(1);
}
console.log("[probe-win-pnpm-spawn] OK");
