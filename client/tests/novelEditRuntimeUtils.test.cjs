const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const utilsPath = path.join(root, "src", "pages", "novels", "novelEditRuntimeUtils.ts");

test("NovelEdit runtime utils exist and expose pipeline parsing and download helpers", () => {
  assert.equal(fs.existsSync(utilsPath), true, "expected novelEditRuntimeUtils.ts to exist");
  const source = fs.readFileSync(utilsPath, "utf8");
  assert.match(source, /export function parsePipelineBackgroundActivities\(/);
  assert.match(source, /export function triggerBlobDownload\(/);
});
