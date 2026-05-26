const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const srcRoot = path.join(repoRoot, "src");

function readSource(...segments) {
  return fs.readFileSync(path.join(srcRoot, ...segments), "utf8");
}

function walkTsFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return walkTsFiles(fullPath);
    }
    return entry.isFile() && entry.name.endsWith(".ts") ? [fullPath] : [];
  });
}

test("ChapterRuntimeCoordinator remains a thin facade without dynamic require", () => {
  const source = readSource("services", "novel", "runtime", "ChapterRuntimeCoordinator.ts");
  const lineCount = source.split(/\r?\n/).length;

  assert.ok(lineCount < 200, `ChapterRuntimeCoordinator.ts has ${lineCount} lines`);
  assert.equal(source.includes("require("), false);
});

test("chapter runtime package builders stay free of IO and service singletons", () => {
  const source = readSource("services", "novel", "runtime", "chapterRuntimePackageBuilders.ts");

  for (const forbidden of [
    "../../../db/prisma",
    "prisma.",
    "../../audit/",
    "../../planner/",
    "../../state/",
    "../../../modules/timeline",
    "ChapterWritingGraph",
  ]) {
    assert.equal(source.includes(forbidden), false, `builder must not depend on ${forbidden}`);
  }
});

test("routes depend on the coordinator facade instead of runtime internals", () => {
  const routeFiles = walkTsFiles(path.join(srcRoot, "routes"));
  const forbiddenRuntimeInternals = [
    "ChapterContentFinalizationService",
    "ChapterQualityGateService",
    "ChapterStreamGenerationOrchestrator",
    "ChapterPipelineRuntimeAdapter",
    "chapterRuntimePackageBuilders",
  ];
  const offenders = routeFiles.filter((file) => {
    const source = fs.readFileSync(file, "utf8");
    return forbiddenRuntimeInternals.some((name) => source.includes(name));
  });

  assert.deepEqual(offenders.map((file) => path.relative(repoRoot, file)), []);
});
