#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_THRESHOLD = 700;
const DEFAULT_TARGETS = [
  "client/src",
  "server/src",
  "shared/types",
  "server/tests",
];
const SOURCE_FILE_PATTERN = /\.(ts|tsx|js|jsx)$/i;
const ALLOWLIST_PATH = path.join(__dirname, "source-file-length.allowlist.json");

function normalizeRelativePath(targetPath) {
  return targetPath.split(path.sep).join("/");
}

function countFileLines(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  if (content.length === 0) {
    return 0;
  }
  const lines = content.split(/\r?\n/);
  return lines.at(-1) === "" ? lines.length - 1 : lines.length;
}

function walkTargetFiles(targetDir, rootDir, files) {
  if (!fs.existsSync(targetDir)) {
    return;
  }

  for (const entry of fs.readdirSync(targetDir, { withFileTypes: true })) {
    const fullPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "dist" || entry.name === "node_modules") {
        continue;
      }
      walkTargetFiles(fullPath, rootDir, files);
      continue;
    }
    if (!entry.isFile() || !SOURCE_FILE_PATTERN.test(entry.name)) {
      continue;
    }
    files.push({
      fullPath,
      relativePath: normalizeRelativePath(path.relative(rootDir, fullPath)),
      lines: countFileLines(fullPath),
    });
  }
}

function collectTargetFiles(rootDir, targets = DEFAULT_TARGETS) {
  const files = [];
  for (const target of targets) {
    walkTargetFiles(path.resolve(rootDir, target), rootDir, files);
  }
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function loadAllowlist(allowlistPath = ALLOWLIST_PATH) {
  if (!fs.existsSync(allowlistPath)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(allowlistPath, "utf8"));
}

function checkSourceFileLengths(options = {}) {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const threshold = Number.isFinite(options.threshold) ? Number(options.threshold) : DEFAULT_THRESHOLD;
  const targets = Array.isArray(options.targets) && options.targets.length > 0 ? options.targets : DEFAULT_TARGETS;
  const allowlist = options.allowlist ?? loadAllowlist(options.allowlistPath);
  const violations = [];

  for (const file of collectTargetFiles(rootDir, targets)) {
    if (file.lines <= threshold) {
      continue;
    }
    const allowedMax = allowlist[file.relativePath];
    if (typeof allowedMax === "number") {
      if (file.lines > allowedMax) {
        violations.push({
          ...file,
          allowedMax,
          reason: "allowlisted_file_grew",
        });
      }
      continue;
    }
    violations.push({
      ...file,
      allowedMax: null,
      reason: "new_over_limit",
    });
  }

  return {
    ok: violations.length === 0,
    threshold,
    targets,
    violations,
  };
}

function formatViolations(result) {
  if (result.ok) {
    return `Source file length check passed. threshold=${result.threshold}`;
  }

  const lines = [
    `Source file length check failed. threshold=${result.threshold}`,
  ];
  for (const violation of result.violations) {
    if (violation.reason === "allowlisted_file_grew") {
      lines.push(
        `- ${violation.relativePath}: ${violation.lines} lines (allowlist max ${violation.allowedMax})`,
      );
      continue;
    }
    lines.push(`- ${violation.relativePath}: ${violation.lines} lines (new file over limit)`);
  }
  return lines.join("\n");
}

function runCli() {
  const result = checkSourceFileLengths({
    rootDir: process.cwd(),
  });
  const output = formatViolations(result);
  if (result.ok) {
    console.log(output);
    return 0;
  }
  console.error(output);
  return 1;
}

if (require.main === module) {
  process.exitCode = runCli();
}

module.exports = {
  ALLOWLIST_PATH,
  DEFAULT_TARGETS,
  DEFAULT_THRESHOLD,
  checkSourceFileLengths,
  collectTargetFiles,
  countFileLines,
  formatViolations,
  loadAllowlist,
};
