import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const utilsPath = path.join(root, "src", "pages", "novels", "novelEditRuntimeUtils.ts");

test("NovelEdit runtime utils exist and expose pipeline parsing and download helpers", () => {
  assert.equal(fs.existsSync(utilsPath), true, "expected novelEditRuntimeUtils.ts to exist");
  const source = fs.readFileSync(utilsPath, "utf8");
  assert.match(source, /export function parsePipelineBackgroundActivities\(/);
  assert.match(source, /export function triggerBlobDownload\(/);
});
