#!/usr/bin/env node
const path = require("node:path");
const { parseArgs } = require("node:util");
const { writeBuildManifest } = require("./guard.cjs");

const repoRoot = path.resolve(__dirname, "../..");

try {
  const { values } = parseArgs({
    options: {
      platform: { type: "string" },
      dist: { type: "string" },
    },
    strict: true,
  });
  if (!values.platform || !values.dist) {
    throw new Error("Usage: node scripts/desktop-release/write-build-manifest.cjs --platform <key> --dist <dir>");
  }
  const distDir = path.resolve(repoRoot, values.dist);
  const manifestPath = writeBuildManifest(repoRoot, {
    platformKey: values.platform,
    distDir,
  });
  console.log(`[desktop-release] build manifest: ${manifestPath}`);
} catch (error) {
  console.error(`[desktop-release] ${error.message}`);
  process.exitCode = 1;
}
