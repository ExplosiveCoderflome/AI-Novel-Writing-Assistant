const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveTakeoverExecutionDirectorInput,
} = require("../dist/services/novel/director/runtime/novelDirectorTakeoverExecution.js");

test("existing-project takeover preserves the requested chapter range for execution", () => {
  const result = resolveTakeoverExecutionDirectorInput({
    request: {
      novelId: "novel-1",
      runMode: "auto_to_execution",
      autoExecutionPlan: {
        mode: "chapter_range",
        startOrder: 11,
        endOrder: 12,
        autoReview: true,
        autoRepair: true,
      },
    },
    directorInput: {
      runMode: "auto_to_ready",
      autoExecutionPlan: undefined,
      autoApproval: { enabled: false },
    },
    autoExecutionPlan: {
      mode: "chapter_range",
      startOrder: 11,
      endOrder: 12,
      autoReview: true,
      autoRepair: true,
    },
  });

  assert.equal(result.runMode, "auto_to_execution");
  assert.deepEqual(result.autoExecutionPlan, {
    mode: "chapter_range",
    startOrder: 11,
    endOrder: 12,
    autoReview: true,
    autoRepair: true,
  });
});
