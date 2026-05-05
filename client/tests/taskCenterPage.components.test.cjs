const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const componentsPath = path.join(root, "src", "pages", "tasks", "taskCenterPage.components.tsx");

test("TaskCenter components module exists and exposes page section components", () => {
  assert.equal(fs.existsSync(componentsPath), true, "expected taskCenterPage.components.tsx to exist");
  const source = fs.readFileSync(componentsPath, "utf8");
  assert.match(source, /export function TaskCenterSummaryCards\(/);
  assert.match(source, /export function TaskCenterFilters\(/);
  assert.match(source, /export function TaskCenterTaskList\(/);
  assert.match(source, /export function TaskCenterDetailPane\(/);
});

test("TaskCenter candidate-selection CTA reuses shared workflow navigation helper", () => {
  const source = fs.readFileSync(componentsPath, "utf8");
  assert.match(source, /getCandidateSelectionLink\(selectedTask\.id\)/);
  assert.doesNotMatch(source, /\/novel-workflows\/\$\{selectedTask\.id\}\/candidate-selection/);
});
