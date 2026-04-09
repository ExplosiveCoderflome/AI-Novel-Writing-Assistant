const test = require("node:test");
const assert = require("node:assert/strict");

const {
  collectWorkflowLinkedPipelineIds,
} = require("../dist/services/task/taskCenterVisibility.js");

test("collectWorkflowLinkedPipelineIds ignores failed and cancelled workflow wrappers", () => {
  const linkedIds = collectWorkflowLinkedPipelineIds([
    {
      id: "workflow-running",
      kind: "novel_workflow",
      status: "running",
      targetResources: [{ type: "generation_job", id: "job-running" }],
    },
    {
      id: "workflow-failed",
      kind: "novel_workflow",
      status: "failed",
      targetResources: [{ type: "generation_job", id: "job-failed" }],
    },
    {
      id: "workflow-cancelled",
      kind: "novel_workflow",
      status: "cancelled",
      targetResources: [{ type: "generation_job", id: "job-cancelled" }],
    },
  ]);

  assert.deepEqual([...linkedIds], ["job-running"]);
});
