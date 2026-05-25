const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");

function readSource(...segments) {
  return fs.readFileSync(path.join(repoRoot, "src", ...segments), "utf8");
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

test("novel routes depend on application capabilities instead of NovelService", () => {
  const routeFiles = walkTsFiles(path.join(repoRoot, "src", "routes"));
  const offenders = routeFiles.filter((file) => readSource(path.relative(path.join(repoRoot, "src"), file)).includes("NovelService"));

  assert.deepEqual(offenders.map((file) => path.relative(repoRoot, file)), []);
});

test("NovelService compatibility facade does not inherit the legacy service chain", () => {
  const novelServiceSource = readSource("services", "novel", "NovelService.ts");
  assert.equal(/class\s+NovelService\s+extends/.test(novelServiceSource), false);

  for (const fileName of [
    "NovelArtifactService.ts",
    "NovelGenerationService.ts",
    "NovelReviewService.ts",
    "NovelPipelineService.ts",
  ]) {
    const source = readSource("services", "novel", fileName);
    assert.equal(source.includes("extends Novel"), false, `${fileName} must not extend another Novel service`);
  }
});

test("production code uses the application capability layer instead of new NovelService", () => {
  const sourceFiles = walkTsFiles(path.join(repoRoot, "src"));
  const offenders = sourceFiles
    .filter((file) => !file.endsWith(path.join("services", "novel", "NovelService.ts")))
    .filter((file) => readSource(path.relative(path.join(repoRoot, "src"), file)).includes("new NovelService"));

  assert.deepEqual(offenders.map((file) => path.relative(repoRoot, file)), []);
});
