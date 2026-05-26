const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const directorRoot = path.join(repoRoot, "src", "services", "novel", "director");
const routesRoot = path.join(repoRoot, "src", "routes");

function readSource(...segments) {
  return fs.readFileSync(path.join(repoRoot, "src", ...segments), "utf8");
}

test("director root stays limited to compatibility facades", () => {
  const rootTsFiles = fs
    .readdirSync(directorRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => entry.name)
    .sort();

  assert.deepEqual(rootTsFiles, [
    "DirectorStateCommitter.ts",
    "DirectorStateReader.ts",
    "DirectorStateStore.ts",
    "NovelDirectorService.ts",
    "novelDirectorConfirmNodeAdapters.ts",
    "novelDirectorPipelineRuntime.ts",
  ]);
});

test("director responsibility directories exist", () => {
  for (const dirname of [
    "commands",
    "http",
    "phases",
    "projections",
    "recovery",
    "runtime",
    "state",
  ]) {
    const fullPath = path.join(directorRoot, dirname);
    assert.equal(fs.statSync(fullPath).isDirectory(), true, `${dirname} must be a directory`);
  }
});

test("legacy route entry remains a thin compatibility export", () => {
  const source = fs.readFileSync(path.join(routesRoot, "novelDirector.ts"), "utf8").trim();

  assert.equal(source, 'export { default } from "../services/novel/director/http/novelDirector";');
});

test("director subsystem README points at the runtime facade", () => {
  const source = readSource("services", "novel", "director", "README.md");

  assert.equal(source.includes('from "./directorSubsystem"'), false);
  assert.equal(source.includes('from "./runtime/directorSubsystem"'), true);
});
