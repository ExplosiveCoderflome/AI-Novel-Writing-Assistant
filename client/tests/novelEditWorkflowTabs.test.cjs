const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

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
