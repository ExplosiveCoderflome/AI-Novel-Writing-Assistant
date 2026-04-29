const test = require("node:test");
const assert = require("node:assert/strict");

const {
  validateAutoDirectorAction,
  validateAutoDirectorTakeoverRequest,
  resolveAutoDirectorFollowUpSection,
} = require("../dist/services/novel/director/autoDirectorValidationService.js");

test("validateAutoDirectorTakeoverRequest blocks chapter ranges before structured outline support exists", () => {
  const result = validateAutoDirectorTakeoverRequest({
    source: "takeover",
    request: {
      novelId: "novel-1",
      entryStep: "chapter",
      strategy: "continue_existing",
      autoExecutionPlan: {
        mode: "chapter_range",
        startOrder: 1,
        endOrder: 10,
      },
    },
    assets: {
      hasProjectSetup: true,
      hasStoryMacroPlan: true,
      hasBookContract: true,
      characterCount: 3,
      volumeCount: 1,
      hasVolumeStrategyPlan: true,
      hasStructuredOutline: false,
      totalChapterCount: 20,
    },
  });

  assert.equal(result.allowed, false);
  assert.deepEqual(result.affectedScope, {
    type: "chapter_range",
    label: "第 1-10 章",
    startOrder: 1,
    endOrder: 10,
  });
  assert.ok(result.blockingReasons.some((reason) => reason.includes("节奏拆章")));
  assert.equal(result.nextAction, "blocked");
});

test("validateAutoDirectorTakeoverRequest allows volume-scoped structured outline when prerequisite assets exist", () => {
  const result = validateAutoDirectorTakeoverRequest({
    source: "takeover",
    request: {
      novelId: "novel-1",
      entryStep: "structured",
      strategy: "continue_existing",
      autoExecutionPlan: {
        mode: "volume",
        volumeOrder: 2,
      },
    },
    assets: {
      hasProjectSetup: true,
      hasStoryMacroPlan: true,
      hasBookContract: true,
      characterCount: 3,
      volumeCount: 3,
      hasVolumeStrategyPlan: true,
      hasStructuredOutline: false,
      totalChapterCount: 60,
    },
  });

  assert.equal(result.allowed, true);
  assert.deepEqual(result.affectedScope, {
    type: "volume",
    label: "第 2 卷",
    volumeOrder: 2,
  });
  assert.equal(result.nextCheckpoint, "front10_ready");
  assert.equal(result.nextAction, "continue_structured_outline");
});

test("validateAutoDirectorTakeoverRequest blocks later nodes when book contract is missing", () => {
  const result = validateAutoDirectorTakeoverRequest({
    source: "takeover",
    request: {
      novelId: "novel-1",
      entryStep: "outline",
      strategy: "continue_existing",
      autoExecutionPlan: {
        mode: "book",
      },
    },
    assets: {
      hasProjectSetup: true,
      hasStoryMacroPlan: true,
      hasBookContract: false,
      characterCount: 3,
      volumeCount: 3,
      hasVolumeStrategyPlan: true,
      hasStructuredOutline: true,
      totalChapterCount: 60,
    },
  });

  assert.equal(result.allowed, false);
  assert.match(result.blockingReasons.join("\n"), /Book Contract|故事宏观规划/);
});

test("validateAutoDirectorTakeoverRequest blocks chapter ranges not covered by real volume strategy", () => {
  const result = validateAutoDirectorTakeoverRequest({
    source: "takeover",
    request: {
      novelId: "novel-1",
      entryStep: "structured",
      strategy: "continue_existing",
      autoExecutionPlan: {
        mode: "chapter_range",
        startOrder: 11,
        endOrder: 20,
      },
    },
    assets: {
      hasProjectSetup: true,
      hasStoryMacroPlan: true,
      hasBookContract: true,
      characterCount: 3,
      volumeCount: 2,
      hasVolumeStrategyPlan: true,
      hasStructuredOutline: false,
      totalChapterCount: 20,
      volumeChapterRanges: [
        { volumeOrder: 1, startOrder: 1, endOrder: 10 },
      ],
    },
  });

  assert.equal(result.allowed, false);
  assert.match(result.blockingReasons.join("\n"), /卷战略|目标范围/);
});

test("validateAutoDirectorTakeoverRequest blocks chapter execution when structured assets do not cover the requested range", () => {
  const result = validateAutoDirectorTakeoverRequest({
    source: "takeover",
    request: {
      novelId: "novel-1",
      entryStep: "chapter",
      strategy: "continue_existing",
      autoExecutionPlan: {
        mode: "chapter_range",
        startOrder: 1,
        endOrder: 5,
      },
    },
    assets: {
      hasProjectSetup: true,
      hasStoryMacroPlan: true,
      hasBookContract: true,
      characterCount: 3,
      volumeCount: 1,
      hasVolumeStrategyPlan: true,
      hasStructuredOutline: true,
      totalChapterCount: 10,
      volumeChapterRanges: [
        { volumeOrder: 1, startOrder: 1, endOrder: 10 },
      ],
      structuredOutlineChapterOrders: [1, 2, 3, 4],
    },
  });

  assert.equal(result.allowed, false);
  assert.match(result.blockingReasons.join("\n"), /节奏拆章|第 5 章/);
});

test("validateAutoDirectorTakeoverRequest accepts chapter execution when structured outline is ready and covers the requested range", () => {
  const result = validateAutoDirectorTakeoverRequest({
    source: "takeover",
    request: {
      novelId: "novel-1",
      entryStep: "chapter",
      strategy: "continue_existing",
      autoExecutionPlan: {
        mode: "chapter_range",
        startOrder: 1,
        endOrder: 2,
      },
    },
    assets: {
      hasProjectSetup: true,
      hasStoryMacroPlan: true,
      hasBookContract: true,
      characterCount: 3,
      volumeCount: 1,
      hasVolumeStrategyPlan: true,
      hasStructuredOutline: true,
      totalChapterCount: 10,
      volumeChapterRanges: [
        { volumeOrder: 1, startOrder: 1, endOrder: 10 },
      ],
      structuredOutlineChapterOrders: [1, 2],
    },
  });

  assert.equal(result.allowed, true);
  assert.equal(result.nextAction, "continue_auto_execution");
});

test("validateAutoDirectorTakeoverRequest reports missing chapter detail instead of missing beat outline when chapter list covers the range", () => {
  const result = validateAutoDirectorTakeoverRequest({
    source: "takeover",
    request: {
      novelId: "novel-1",
      entryStep: "chapter",
      strategy: "continue_existing",
      autoExecutionPlan: {
        mode: "chapter_range",
        startOrder: 1,
        endOrder: 2,
      },
    },
    assets: {
      hasProjectSetup: true,
      hasStoryMacroPlan: true,
      hasBookContract: true,
      characterCount: 3,
      volumeCount: 1,
      hasVolumeStrategyPlan: true,
      hasStructuredOutline: false,
      totalChapterCount: 10,
      volumeChapterRanges: [
        { volumeOrder: 1, startOrder: 1, endOrder: 10 },
      ],
      structuredOutlineChapterOrders: [1, 2],
    },
  });

  assert.equal(result.allowed, false);
  assert.match(result.blockingReasons.join("\n"), /章节列表/);
  assert.match(result.blockingReasons.join("\n"), /章节细化|同步到执行区/);
  assert.doesNotMatch(result.blockingReasons.join("\n"), /缺少节奏拆章，需要先完成/);
});

test("validateAutoDirectorTakeoverRequest blocks chapter scope before structured entry", () => {
  const result = validateAutoDirectorTakeoverRequest({
    source: "takeover",
    request: {
      novelId: "novel-1",
      entryStep: "outline",
      strategy: "continue_existing",
      autoExecutionPlan: {
        mode: "chapter_range",
        startOrder: 11,
        endOrder: 20,
      },
    },
    assets: {
      hasProjectSetup: true,
      hasStoryMacroPlan: true,
      hasBookContract: true,
      characterCount: 3,
      volumeCount: 3,
      hasVolumeStrategyPlan: true,
      hasStructuredOutline: true,
      totalChapterCount: 60,
    },
  });

  assert.equal(result.allowed, false);
  assert.ok(result.blockingReasons.some((reason) => reason.includes("章节范围") && reason.includes("节奏拆章")));
});

test("validateAutoDirectorTakeoverRequest blocks volume scope before outline entry", () => {
  const result = validateAutoDirectorTakeoverRequest({
    source: "takeover",
    request: {
      novelId: "novel-1",
      entryStep: "character",
      strategy: "continue_existing",
      autoExecutionPlan: {
        mode: "volume",
        volumeOrder: 1,
      },
    },
    assets: {
      hasProjectSetup: true,
      hasStoryMacroPlan: true,
      hasBookContract: true,
      characterCount: 3,
      volumeCount: 3,
      hasVolumeStrategyPlan: true,
      hasStructuredOutline: true,
      totalChapterCount: 60,
    },
  });

  assert.equal(result.allowed, false);
  assert.ok(result.blockingReasons.some((reason) => reason.includes("卷范围") && reason.includes("卷战略")));
});

test("validateAutoDirectorTakeoverRequest accepts full-book scope from any entry", () => {
  const result = validateAutoDirectorTakeoverRequest({
    source: "takeover",
    request: {
      novelId: "novel-1",
      entryStep: "story_macro",
      strategy: "continue_existing",
      autoExecutionPlan: {
        mode: "book",
      },
    },
    assets: {
      hasProjectSetup: true,
      hasStoryMacroPlan: true,
      hasBookContract: true,
      characterCount: 3,
      volumeCount: 3,
      hasVolumeStrategyPlan: true,
      hasStructuredOutline: true,
      totalChapterCount: 60,
    },
  });

  assert.equal(result.allowed, true);
  assert.deepEqual(result.affectedScope, {
    type: "book",
    label: "全书",
  });
});

test("validateAutoDirectorAction blocks channel callbacks for high-risk rewrite actions", () => {
  const result = validateAutoDirectorAction({
    source: "wecom",
    actionCode: "retry_with_route_model",
    task: {
      id: "task-1",
      lane: "auto_director",
      status: "failed",
      checkpointType: "chapter_batch_ready",
      pendingManualRecovery: false,
      novelId: "novel-1",
      seedPayload: {
        autoExecution: {
          enabled: true,
          scopeLabel: "第 11-20 章",
          startOrder: 11,
          endOrder: 20,
        },
      },
    },
  });

  assert.equal(result.allowed, false);
  assert.match(result.blockingReasons.join("\n"), /站内|确认/);
  assert.equal(result.nextAction, "open_follow_up_center");
});

test("validateAutoDirectorAction marks safe follow-up continue with required checkpoint cleanup", () => {
  const result = validateAutoDirectorAction({
    source: "web",
    actionCode: "continue_auto_execution",
    task: {
      id: "task-2",
      lane: "auto_director",
      status: "waiting_approval",
      checkpointType: "front10_ready",
      pendingManualRecovery: false,
      novelId: "novel-1",
      seedPayload: {
        autoExecution: {
          enabled: true,
          scopeLabel: "前 10 章",
          startOrder: 1,
          endOrder: 10,
        },
      },
    },
  });

  assert.equal(result.allowed, true);
  assert.equal(result.affectedScope.label, "前 10 章");
  assert.deepEqual(result.requiredActions.map((item) => item.code), ["clear_checkpoint"]);
  assert.equal(result.nextAction, "continue_auto_execution");
});

test("resolveAutoDirectorFollowUpSection gives validation issues top priority over actionable waiting state", () => {
  const section = resolveAutoDirectorFollowUpSection({
    status: "waiting_approval",
    checkpointType: "front10_ready",
    validationResult: {
      allowed: false,
      blockingReasons: ["目标范围缺少节奏拆章，需要先重新校验。"],
      warnings: [],
      requiredActions: [],
      affectedScope: { type: "chapter_range", label: "第 1-10 章", startOrder: 1, endOrder: 10 },
      nextAction: "revalidate",
    },
  });

  assert.equal(section, "needs_validation");
});

test("resolveAutoDirectorFollowUpSection prioritizes validation, exceptions, pending, auto progress, and replaced", () => {
  assert.equal(resolveAutoDirectorFollowUpSection({
    status: "failed",
    replacementTaskId: "task_new",
    validationResult: {
      allowed: false,
      blockingReasons: ["目标范围需要重新校验。"],
      warnings: [],
      requiredActions: [],
      affectedScope: { type: "book", label: "全书" },
      nextAction: "revalidate",
    },
  }), "needs_validation");

  assert.equal(resolveAutoDirectorFollowUpSection({
    status: "failed",
    replacementTaskId: "task_new",
  }), "exception");

  assert.equal(resolveAutoDirectorFollowUpSection({
    status: "cancelled",
    replacementTaskId: "task_new",
  }), "replaced");

  assert.equal(resolveAutoDirectorFollowUpSection({
    status: "waiting_approval",
    checkpointType: "front10_ready",
    replacementTaskId: "task_new",
  }), "pending");

  assert.equal(resolveAutoDirectorFollowUpSection({
    status: "running",
    replacementTaskId: "task_new",
  }), "auto_progress");

  assert.equal(resolveAutoDirectorFollowUpSection({
    status: "succeeded",
    replacementTaskId: "task_new",
  }), "replaced");
});
