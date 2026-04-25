const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_DIRECTOR_AUTO_APPROVAL_POINT_CODES,
  normalizeDirectorAutoApprovalConfig,
  shouldAutoApproveDirectorCheckpoint,
} = require("../../shared/dist/types/autoDirectorApproval.js");
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

  assert.equal(shouldAutoApproveDirectorCheckpoint(config, "front10_ready"), true);
  assert.equal(shouldAutoApproveDirectorCheckpoint(config, "chapter_batch_ready"), true);
  assert.equal(shouldAutoApproveDirectorCheckpoint(config, "replan_required"), false);
  assert.equal(shouldAutoApproveDirectorCheckpoint({ ...config, enabled: false }, "front10_ready"), false);
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
