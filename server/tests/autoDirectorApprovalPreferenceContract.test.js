const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_DIRECTOR_AUTO_APPROVAL_POINT_CODES,
  normalizeDirectorAutoApprovalConfig,
  shouldAutoApproveDirectorCheckpoint,
} = require("../../shared/dist/types/autoDirectorApproval.js");
const {
  buildWorkflowSeedPayload,
  buildRouteFollowingDirectorLlmOptions,
  buildTaskModelDirectorLlmOptions,
  applyDirectorLlmOverride,
  getDirectorLlmOptionsFromSeedPayload,
  isDirectorTaskModelBinding,
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

test("director default model binding follows route while explicit task override preserves task model", () => {
  const legacySeed = buildWorkflowSeedPayload({
    idea: "A city sleeps under glass.",
    provider: "openai",
    model: "legacy-model",
    temperature: 0.66,
    runMode: "auto_to_execution",
  });

  assert.equal(isDirectorTaskModelBinding(legacySeed), false);
  assert.deepEqual(buildRouteFollowingDirectorLlmOptions(legacySeed), {});
  assert.deepEqual(buildTaskModelDirectorLlmOptions(legacySeed), {
    provider: "openai",
    model: "legacy-model",
    temperature: 0.66,
  });

  const overridden = applyDirectorLlmOverride(legacySeed, {
    provider: "openai",
    model: "route-selected-model",
    temperature: 0.2,
  });

  assert.equal(isDirectorTaskModelBinding(overridden), true);
  assert.deepEqual(getDirectorLlmOptionsFromSeedPayload(overridden), {
    provider: "openai",
    model: "route-selected-model",
    temperature: 0.2,
  });
  assert.deepEqual(buildRouteFollowingDirectorLlmOptions(overridden), {
    provider: "openai",
    model: "route-selected-model",
    temperature: 0.2,
  });
});
