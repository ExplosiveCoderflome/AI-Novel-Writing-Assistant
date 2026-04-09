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
  normalizeWorkflowResumeTargetForCandidateSelection,
} = require("../dist/services/task/adapters/NovelWorkflowTaskAdapter.js");

test("candidate-selection tasks always resolve back to the director create page", () => {
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
    "/novels/create?workflowTaskId=task_candidate_selection&mode=director",
  );
});

test("bootstrapTask does not auto-attach a pre-confirmation auto-director task to a novel", async () => {
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
    const row = await service.bootstrapTask({
      workflowTaskId: "task_pre_novel_candidate",
      novelId: "novel_should_not_bind",
      lane: "manual_create",
    });

    assert.equal(attachCalled, false);
    assert.equal(row.id, "task_pre_novel_candidate");
    assert.equal(row.novelId, null);
  } finally {
    service.getVisibleRowById = originalGetVisibleRowById;
    service.attachNovelToTask = originalAttachNovelToTask;
  }
});

test("recordCandidateSelectionRequired rewrites stale resume targets back to create flow", async () => {
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
      "/novels/create?workflowTaskId=task_candidate_checkpoint&mode=director",
    );
  } finally {
    service.getVisibleRowById = originalGetVisibleRowById;
    prisma.novelWorkflowTask.update = originalUpdate;
  }
});
