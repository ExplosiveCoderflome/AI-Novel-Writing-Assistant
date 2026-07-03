const test = require("node:test");
const assert = require("node:assert/strict");

require("../dist/app.js");
const { prisma } = require("../dist/db/prisma.js");
const {
  resumeTargetToRoute,
} = require("../dist/services/novel/workflow/novelWorkflow.shared.js");
const {
  NovelWorkflowService,
} = require("../dist/services/novel/workflow/NovelWorkflowService.js");
const {
  resolveAutoDirectorBootstrapInitialState,
} = require("../dist/services/novel/workflow/novelWorkflowAutoDirectorInitialState.js");
const {
  normalizeWorkflowResumeTargetForCandidateSelection,
} = require("../dist/services/task/adapters/NovelWorkflowTaskAdapter.js");

test("candidate-selection tasks always resolve back to the auto-director create page", () => {
  const resumeTarget = normalizeWorkflowResumeTargetForCandidateSelection({
    id: "task_candidate_selection",
    checkpointType: "candidate_selection_required",
    currentItemKey: "auto_director",
    resumeTargetJson: JSON.stringify({
      route: "/novels/:id/edit",
      novelId: "novel_stale",
      taskId: "task_candidate_selection",
      stage: "basic",
    }),
    seedPayloadJson: JSON.stringify({
      candidateStage: {
        mode: "generate",
      },
    }),
  });

  assert.equal(
    resumeTargetToRoute(resumeTarget),
    "/novels/auto-director?taskId=task_candidate_selection",
  );
});

test("structured auto-director tasks fall back to seed resume target when row resume target is missing volume scope", () => {
  const resumeTarget = normalizeWorkflowResumeTargetForCandidateSelection({
    id: "task_structured_outline",
    checkpointType: null,
    currentItemKey: "chapter_list",
    resumeTargetJson: JSON.stringify({
      route: "/novels/:id/edit",
      novelId: "novel-1",
      taskId: "task_structured_outline",
      stage: "basic",
      volumeId: null,
    }),
    seedPayloadJson: JSON.stringify({
      directorSession: {
        phase: "structured_outline",
      },
      resumeTarget: {
        route: "/novels/:id/edit",
        novelId: "novel-1",
        taskId: "task_structured_outline",
        stage: "structured",
        volumeId: "volume-1",
      },
    }),
  });

  assert.equal(resumeTarget.stage, "structured");
  assert.equal(resumeTarget.volumeId, "volume-1");
});

test("edit resume routes keep manual workspace tasks separate from director task ids", () => {
  assert.equal(
    resumeTargetToRoute({
      route: "/novels/:id/edit",
      novelId: "novel-1",
      taskId: "manual-task",
      lane: "manual_create",
      stage: "basic",
    }),
    "/novels/novel-1/edit?stage=basic&workspaceTaskId=manual-task",
  );

  assert.equal(
    resumeTargetToRoute({
      route: "/novels/:id/edit",
      novelId: "novel-1",
      taskId: "director-task",
      lane: "auto_director",
      stage: "structured",
    }),
    "/novels/novel-1/edit?stage=structured&directorTaskId=director-task",
  );
});

test("auto-director takeover bootstrap derives initial progress from runtime resume metadata", () => {
  const initialState = resolveAutoDirectorBootstrapInitialState({
    lane: "auto_director",
    novelId: "novel-1",
    seedPayload: {
      directorSession: {
        phase: "structured_outline",
      },
      takeover: {
        effectiveStage: "structured_outline",
      },
      resumeTarget: {
        route: "/novels/:id/edit",
        novelId: "novel-1",
        taskId: null,
        stage: "structured",
        volumeId: "volume-1",
      },
    },
  });

  assert.equal(initialState.stage, "structured_outline");
  assert.equal(initialState.itemKey, "beat_sheet");
  assert.equal(initialState.volumeId, "volume-1");
  assert.notEqual(initialState.itemLabel, "等待生成候选方向");
});

test("auto-director candidate bootstrap keeps candidate-stage default before a novel exists", () => {
  const initialState = resolveAutoDirectorBootstrapInitialState({
    lane: "auto_director",
    novelId: null,
    seedPayload: {
      directorSession: {
        phase: "structured_outline",
      },
      resumeTarget: {
        route: "/novels/:id/edit",
        novelId: "novel-1",
        stage: "structured",
      },
    },
  });

  assert.equal(initialState, null);
});

test("bootstrapTask rejects workflowTaskId reuse across workflow lanes", async () => {
  const service = new NovelWorkflowService();
  const originalGetVisibleRowById = service.getVisibleRowById;
  const originalAttachNovelToTask = service.attachNovelToTask;
  let attachCalled = false;

  service.getVisibleRowById = async () => ({
    id: "task_pre_novel_candidate",
    lane: "auto_director",
    novelId: null,
    checkpointType: "candidate_selection_required",
    currentItemKey: "auto_director",
    seedPayloadJson: JSON.stringify({
      candidateStage: {
        mode: "generate",
      },
    }),
  });
  service.attachNovelToTask = async () => {
    attachCalled = true;
    throw new Error("should not attach");
  };

  try {
    await assert.rejects(
      () => service.bootstrapTask({
        workflowTaskId: "task_pre_novel_candidate",
        novelId: "novel_should_not_bind",
        lane: "manual_create",
      }),
      (error) => {
        assert.equal(error.name, "AppError");
        assert.equal(error.statusCode, 409);
        assert.equal(error.details.existingLane, "auto_director");
        assert.equal(error.details.requestedLane, "manual_create");
        return true;
      },
    );
    assert.equal(attachCalled, false);
  } finally {
    service.getVisibleRowById = originalGetVisibleRowById;
    service.attachNovelToTask = originalAttachNovelToTask;
  }
});

test("recordCandidateSelectionRequired rewrites stale resume targets back to auto-director flow", async () => {
  const service = new NovelWorkflowService();
  const originalGetVisibleRowById = service.getVisibleRowById;
  const originalUpdate = prisma.novelWorkflowTask.update;
  let capturedResumeTargetJson = null;

  service.getVisibleRowById = async () => ({
    id: "task_candidate_checkpoint",
    lane: "auto_director",
    novelId: "novel_stale",
    progress: 0.15,
    seedPayloadJson: null,
    milestonesJson: null,
  });
  prisma.novelWorkflowTask.update = async ({ data }) => {
    capturedResumeTargetJson = data.resumeTargetJson ?? null;
    return {
      id: "task_candidate_checkpoint",
      ...data,
    };
  };

  try {
    await service.recordCandidateSelectionRequired("task_candidate_checkpoint", {
      summary: "第 1 轮 已生成 2 套书级方向，并完成每套书名组。",
    });

    assert.equal(
      resumeTargetToRoute(JSON.parse(capturedResumeTargetJson)),
      "/novels/auto-director?taskId=task_candidate_checkpoint",
    );
  } finally {
    service.getVisibleRowById = originalGetVisibleRowById;
    prisma.novelWorkflowTask.update = originalUpdate;
  }
});
