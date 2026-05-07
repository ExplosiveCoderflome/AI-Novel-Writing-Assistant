const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ALL_DIRECTOR_AUTO_APPROVAL_POINT_CODES,
  DEFAULT_DIRECTOR_AUTO_APPROVAL_POINT_CODES,
  buildFullDirectorAutoApprovalConfig,
  normalizeDirectorAutoApprovalConfig,
  shouldAutoApproveDirectorCheckpoint,
} = require("../../shared/dist/types/autoDirectorApproval.js");
const {
  buildFullBookAutopilotExecutionPlan,
  isDirectorAutoExecutionRunMode,
  isFullBookAutopilotRunMode,
} = require("../../shared/dist/types/novelDirector.js");
const {
  buildWorkflowSeedPayload,
} = require("../dist/services/novel/director/novelDirectorHelpers.js");

test("auto approval config normalizes concrete point codes and ignores invalid values", () => {
  assert.deepEqual(
    normalizeDirectorAutoApprovalConfig({
      enabled: true,
      approvalPointCodes: [
        "chapter_execution_continue",
        "missing",
        "chapter_execution_continue",
      ],
    }),
    {
      enabled: true,
      approvalPointCodes: ["chapter_execution_continue"],
    },
  );

  assert.deepEqual(
    normalizeDirectorAutoApprovalConfig(null),
    {
      enabled: false,
      approvalPointCodes: [...DEFAULT_DIRECTOR_AUTO_APPROVAL_POINT_CODES],
    },
  );
});

test("auto approval config maps known checkpoints to approval points", () => {
  const config = normalizeDirectorAutoApprovalConfig({
    enabled: true,
    approvalPointCodes: [
      "structured_outline_ready",
      "chapter_execution_continue",
    ],
  });

  assert.equal(shouldAutoApproveDirectorCheckpoint(config, "chapter_batch_ready"), true);
  assert.equal(shouldAutoApproveDirectorCheckpoint(config, "chapter_batch_ready"), true);
  assert.equal(shouldAutoApproveDirectorCheckpoint(config, "replan_required"), false);
  assert.equal(shouldAutoApproveDirectorCheckpoint({ ...config, enabled: false }, "chapter_batch_ready"), false);
});

test("full auto approval covers every defined approval point", () => {
  const fullAutoConfig = normalizeDirectorAutoApprovalConfig({
    enabled: true,
    approvalPointCodes: ALL_DIRECTOR_AUTO_APPROVAL_POINT_CODES,
  });

  assert.equal(fullAutoConfig.enabled, true);
  assert.deepEqual(fullAutoConfig.approvalPointCodes, ALL_DIRECTOR_AUTO_APPROVAL_POINT_CODES);
  assert.equal(shouldAutoApproveDirectorCheckpoint(fullAutoConfig, "chapter_batch_ready"), true);
  assert.equal(shouldAutoApproveDirectorCheckpoint(fullAutoConfig, "chapter_batch_ready"), true);
  assert.equal(shouldAutoApproveDirectorCheckpoint(fullAutoConfig, "replan_required"), true);
});

test("full-book autopilot shared contract is full book and full auto", () => {
  assert.equal(isFullBookAutopilotRunMode("full_book_autopilot"), true);
  assert.equal(isDirectorAutoExecutionRunMode("full_book_autopilot"), true);
  assert.deepEqual(buildFullBookAutopilotExecutionPlan(), {
    mode: "book",
    autoReview: true,
    autoRepair: true,
  });
  assert.deepEqual(buildFullDirectorAutoApprovalConfig(), {
    enabled: true,
    approvalPointCodes: ALL_DIRECTOR_AUTO_APPROVAL_POINT_CODES,
  });
});

test("director seed payload stores book-level auto approval selection", () => {
  const payload = buildWorkflowSeedPayload({
    idea: "A city sleeps under glass.",
    runMode: "auto_to_execution",
  }, {
    autoApproval: {
      enabled: true,
      approvalPointCodes: ["chapter_execution_continue"],
    },
  });

  assert.deepEqual(payload.autoApproval, {
    enabled: true,
    approvalPointCodes: ["chapter_execution_continue"],
  });
});

