import test from "node:test";
import assert from "node:assert/strict";

import {
  getTaskListPriority,
  getTaskNoticeSeverity,
  getTaskNoticeTitle,
  getTaskQueueLevelLabel,
  getTaskQueueTone,
  isTaskMustHandle,
} from "./taskCenterUtils.ts";

const baseTask = {
  status: "queued",
  pendingManualRecovery: false,
  checkpointType: null,
  noticeCode: null,
  noticeSummary: null,
  failureCode: null,
  failureSummary: null,
  lastError: null,
};

test("task queue uses structured failure state as blocker", () => {
  const task = { ...baseTask, status: "failed", failureCode: "NOVEL_WORKFLOW_FAILED" };
  assert.equal(getTaskQueueTone(task), "danger");
  assert.equal(getTaskQueueLevelLabel(task), "任务失败");
});

test("task queue keeps a completed task notice as quality reminder", () => {
  const task = { ...baseTask, status: "succeeded", noticeCode: "PIPELINE_QUALITY_REVIEW", noticeSummary: "待局部修复" };
  assert.equal(getTaskQueueTone(task), "warning");
  assert.equal(getTaskQueueLevelLabel(task), "质量提醒");
});

test("task queue treats explicit replan checkpoint as blocker", () => {
  const task = { ...baseTask, status: "waiting_approval", checkpointType: "replan_required" };
  assert.equal(getTaskQueueTone(task), "danger");
});

test("task queue keeps replan notices blocking and labels them explicitly", () => {
  const task = {
    ...baseTask,
    status: "succeeded",
    noticeCode: "PIPELINE_REPLAN_REQUIRED",
    noticeSummary: "后续章节需要先重规划",
  };
  assert.equal(getTaskQueueTone(task), "danger");
  assert.equal(getTaskQueueLevelLabel(task), "需要重规划");
  assert.equal(getTaskNoticeSeverity(task), "blocking");
  assert.equal(getTaskNoticeTitle(task), "需要重规划");
});

test("a failed task cannot be downgraded by a residual quality notice", () => {
  const task = {
    ...baseTask,
    status: "failed",
    noticeCode: "PIPELINE_QUALITY_REVIEW",
    noticeSummary: "部分章节保留质量债",
    failureCode: "PIPELINE_FAILED",
    failureSummary: "模型服务不可用",
  };
  assert.equal(getTaskQueueTone(task), "danger");
  assert.equal(getTaskQueueLevelLabel(task), "任务失败");
  assert.equal(getTaskNoticeSeverity(task), "quality");
});

test("task queue keeps structured pipeline and title review codes local", () => {
  const pipelineReview = {
    ...baseTask,
    status: "failed",
    failureCode: "PIPELINE_QUALITY_REVIEW",
  };
  const titleReminder = {
    ...baseTask,
    status: "failed",
    failureCode: "CHAPTER_TITLE_DIVERSITY",
    failureSummary: "标题审查待局部处理",
  };
  assert.equal(getTaskQueueTone(pipelineReview), "warning");
  assert.equal(getTaskQueueLevelLabel(pipelineReview), "质量提醒");
  assert.equal(getTaskQueueTone(titleReminder), "warning");
  assert.equal(getTaskQueueLevelLabel(titleReminder), "质量提醒");
});

test("task queue presents waiting approval as an action instead of a fault", () => {
  const task = { ...baseTask, status: "waiting_approval" };
  assert.equal(getTaskQueueTone(task), "info");
  assert.equal(getTaskQueueLevelLabel(task), "待操作");
});

test("must-handle filtering follows structured impact instead of failed and cancelled statuses", () => {
  assert.equal(isTaskMustHandle({ ...baseTask, status: "queued", pendingManualRecovery: true }), true);
  assert.equal(isTaskMustHandle({ ...baseTask, status: "waiting_approval", checkpointType: "replan_required" }), true);
  assert.equal(isTaskMustHandle({ ...baseTask, status: "cancelled" }), false);
  assert.equal(isTaskMustHandle({
    ...baseTask,
    status: "failed",
    failureCode: "PIPELINE_QUALITY_REVIEW",
  }), false);
});

test("task queue distinguishes running and completed ordinary tasks", () => {
  assert.equal(getTaskQueueTone({ ...baseTask, status: "running" }), "info");
  assert.equal(getTaskQueueTone({ ...baseTask, status: "succeeded" }), "success");
});

test("task queue sorting keeps blocker and quality reminder ahead of progress", () => {
  const blocker = { ...baseTask, status: "failed" };
  const quality = { ...baseTask, status: "succeeded", noticeCode: "PIPELINE_QUALITY_REVIEW" };
  const running = { ...baseTask, status: "running" };
  assert.ok(getTaskListPriority(blocker) < getTaskListPriority(quality));
  assert.ok(getTaskListPriority(quality) < getTaskListPriority(running));
});
