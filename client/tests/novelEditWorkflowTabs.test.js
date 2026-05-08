import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const builderPath = path.join(root, "src", "pages", "novels", "novelEditWorkflowTabs.ts");

test("NovelEdit workflow tab builders exist and expose the expected builder functions", () => {
  assert.equal(fs.existsSync(builderPath), true, "expected novelEditWorkflowTabs.ts to exist");
  const source = fs.readFileSync(builderPath, "utf8");
  assert.match(source, /export function buildNovelEditChapterTab\(/);
  assert.match(source, /export function buildNovelEditPipelineTab\(/);
  assert.match(source, /export function buildNovelEditCharacterTab\(/);
  assert.match(source, /export function buildNovelEditExportControls\(/);
  assert.match(source, /export function buildNovelEditTaskDrawer\(/);
  assert.match(source, /export function resolveNovelEditActiveTakeoverStep\(/);
  assert.match(source, /export function createNovelEditTaskDrawerResourceProposalHandler\(/);
});
