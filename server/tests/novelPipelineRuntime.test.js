const test = require("node:test");
const assert = require("node:assert/strict");

const {
  NovelPipelineRuntimeService,
} = require("../dist/services/novel/NovelPipelineRuntimeService.js");

test("resumePendingPipelineJobs resumes queued and running pipeline jobs after restart", async () => {
  const calls = [];
  const runtimeService = new NovelPipelineRuntimeService({
    async listPendingCancellationPipelineJobs() {
      return [];
    },
    async listRecoverablePipelineJobs() {
      return [
        { id: "job-queued", status: "queued" },
        { id: "job-running", status: "running" },
      ];
    },
    async listStaleRecoverablePipelineJobs() {
      return [];
    },
    async markPipelineJobCancelled(jobId) {
      calls.push(["cancelled", jobId]);
    },
    async resumePipelineJob(jobId) {
      calls.push(["resume", jobId]);
    },
    async markPipelineJobFailed(jobId, message) {
      calls.push(["failed", jobId, message]);
    },
  });

  await runtimeService.resumePendingPipelineJobs();

  assert.deepEqual(calls, [
    ["resume", "job-queued"],
    ["resume", "job-running"],
  ]);
});

test("resumePendingPipelineJobs settles pending cancellations before resuming work", async () => {
  const calls = [];
  const runtimeService = new NovelPipelineRuntimeService({
    async listPendingCancellationPipelineJobs() {
      return [{ id: "job-cancelling", status: "cancelled" }];
    },
    async listRecoverablePipelineJobs() {
      return [{ id: "job-running", status: "running" }];
    },
    async listStaleRecoverablePipelineJobs() {
      return [];
    },
    async markPipelineJobCancelled(jobId) {
      calls.push(["cancelled", jobId]);
    },
    async resumePipelineJob(jobId) {
      calls.push(["resume", jobId]);
    },
    async markPipelineJobFailed(jobId, message) {
      calls.push(["failed", jobId, message]);
    },
  });

  await runtimeService.resumePendingPipelineJobs();

  assert.deepEqual(calls, [
    ["cancelled", "job-cancelling"],
    ["resume", "job-running"],
  ]);
});

test("recoverStalePipelineJobs marks failed when resume throws", async () => {
  const calls = [];
  const runtimeService = new NovelPipelineRuntimeService({
    async listPendingCancellationPipelineJobs() {
      return [];
    },
    async listRecoverablePipelineJobs() {
      return [];
    },
    async listStaleRecoverablePipelineJobs() {
      return [{ id: "job-stale", status: "running" }];
    },
    async markPipelineJobCancelled(jobId) {
      calls.push(["cancelled", jobId]);
    },
    async resumePipelineJob() {
      throw new Error("缺少章节上下文");
    },
    async markPipelineJobFailed(jobId, message) {
      calls.push([jobId, message]);
    },
  });

  await runtimeService.recoverStalePipelineJobs(new Date("2026-04-03T00:00:00+08:00"), 60_000);

  assert.deepEqual(calls, [
    ["job-stale", "章节流水线任务心跳超时，正在尝试恢复。 恢复失败：缺少章节上下文"],
  ]);
});

test("markPendingPipelineJobsForManualRecovery settles cancellations and marks recoverable jobs", async () => {
  const calls = [];
  const runtimeService = new NovelPipelineRuntimeService({
    async listPendingCancellationPipelineJobs() {
      return [{ id: "job-cancelling", status: "cancelled" }];
    },
    async listRecoverablePipelineJobs() {
      return [
        { id: "job-queued", status: "queued" },
        { id: "job-running", status: "running" },
      ];
    },
    async listStaleRecoverablePipelineJobs() {
      return [];
    },
    async markPipelineJobCancelled(jobId) {
      calls.push(["cancelled", jobId]);
    },
    async markPipelineJobPendingManualRecovery(jobId, message) {
      calls.push(["pending", jobId, message]);
    },
    async resumePipelineJob(jobId) {
      calls.push(["resume", jobId]);
    },
    async markPipelineJobFailed(jobId, message) {
      calls.push(["failed", jobId, message]);
    },
  });

  await runtimeService.markPendingPipelineJobsForManualRecovery();

  assert.deepEqual(calls, [
    ["cancelled", "job-cancelling"],
    ["pending", "job-queued", "服务重启后任务已暂停，等待手动恢复。"],
    ["pending", "job-running", "服务重启后任务已暂停，等待手动恢复。"],
  ]);
});
