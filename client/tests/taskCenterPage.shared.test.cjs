const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sharedPath = path.join(root, "src", "pages", "tasks", "taskCenterPage.shared.ts");

test("TaskCenter shared module exists and exposes list/detail formatting helpers", () => {
  assert.equal(fs.existsSync(sharedPath), true, "expected taskCenterPage.shared.ts to exist");
  const source = fs.readFileSync(sharedPath, "utf8");
  assert.match(source, /export const ACTIVE_STATUSES/);
  assert.match(source, /export function formatCheckpoint\(/);
  assert.match(source, /export function formatResumeTarget\(/);
  assert.match(source, /export function formatStatus\(/);
  assert.match(source, /export function normalizeTaskMeta\(/);
  assert.match(source, /export function normalizeTaskSteps\(/);
});
