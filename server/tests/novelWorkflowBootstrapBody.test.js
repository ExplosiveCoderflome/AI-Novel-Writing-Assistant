const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseNovelWorkflowBootstrapBody,
} = require("../dist/services/novel/workflow/http/novelWorkflowBootstrapBody.js");

test("novel workflow bootstrap normalizes the legacy seedPayload field", () => {
  const launch = { runMode: "auto_to_execution" };
  const parsed = parseNovelWorkflowBootstrapBody({
    lane: "auto_director",
    seedPayload: launch,
  });

  assert.deepEqual(parsed, {
    lane: "auto_director",
    directorState: launch,
  });
});

test("novel workflow bootstrap prefers directorState when both payload fields are supplied", () => {
  const directorState = { launch: { runMode: "full_book_autopilot" } };
  const parsed = parseNovelWorkflowBootstrapBody({
    workflowTaskId: "task-1",
    novelId: "novel-1",
    lane: "auto_director",
    seedPayload: { runMode: "auto_to_execution" },
    directorState,
  });

  assert.deepEqual(parsed, {
    workflowTaskId: "task-1",
    novelId: "novel-1",
    lane: "auto_director",
    directorState,
  });
});
