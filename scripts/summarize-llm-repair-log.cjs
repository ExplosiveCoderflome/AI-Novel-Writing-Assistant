#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

function usage() {
  console.error("Usage: node scripts/summarize-llm-repair-log.cjs <path-to-llm-repair.jsonl>");
}

function readRows(filePath) {
  return fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function promptIdOf(row) {
  return row.promptMeta?.promptId
    || (typeof row.label === "string" ? row.label.replace(/@v\d+$/u, "") : "")
    || "unknown";
}

function pathsOf(row) {
  if (Array.isArray(row.schemaPaths) && row.schemaPaths.length > 0) {
    return row.schemaPaths.map((item) => String(item || "(root)"));
  }
  const validationError = String(row.validationError || "");
  const paths = validationError
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => {
      const colonIndex = line.indexOf(":");
      return colonIndex > 2 ? line.slice(2, colonIndex).trim() : "";
    })
    .filter(Boolean);
  return paths.length > 0 ? Array.from(new Set(paths)) : ["(unknown)"];
}

const inputPath = process.argv[2];
if (!inputPath) {
  usage();
  process.exit(1);
}

const resolved = path.resolve(inputPath);
const rows = readRows(resolved);
const aggregate = new Map();

for (const row of rows) {
  if (row.event !== "repair_start") {
    continue;
  }
  const promptId = promptIdOf(row);
  for (const schemaPath of pathsOf(row)) {
    const key = `${promptId}\t${schemaPath}`;
    aggregate.set(key, (aggregate.get(key) || 0) + 1);
  }
}

for (const [key, count] of Array.from(aggregate.entries()).sort((left, right) => right[1] - left[1])) {
  const [promptId, schemaPath] = key.split("\t");
  console.log(`${count}\t${promptId}\t${schemaPath}`);
}
