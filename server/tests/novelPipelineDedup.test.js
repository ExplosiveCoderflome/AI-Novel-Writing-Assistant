const test = require("node:test");
const assert = require("node:assert/strict");

const {
  selectPrimaryPipelineJob,
} = require("../dist/services/novel/pipelineJobDedup.js");

test("selectPrimaryPipelineJob keeps the most progressed job when preferred job is stale", () => {
  const selected = selectPrimaryPipelineJob([
    { id: "job-progressed", completedCount: 4, progress: 0.45 },
    { id: "job-stale", completedCount: 1, progress: 0.1 },
  ], "job-stale");

  assert.equal(selected.id, "job-progressed");
});

test("selectPrimaryPipelineJob keeps the preferred job when progress is tied", () => {
  const selected = selectPrimaryPipelineJob([
    { id: "job-newer", completedCount: 2, progress: 0.25 },
    { id: "job-linked", completedCount: 2, progress: 0.25 },
  ], "job-linked");

  assert.equal(selected.id, "job-linked");
});
