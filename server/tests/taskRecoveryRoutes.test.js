const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { createApp } = require("../dist/app.js");
const { recoveryTaskService } = require("../dist/services/task/RecoveryTaskService.js");
const { taskCenterService } = require("../dist/services/task/TaskCenterService.js");

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(address.port);
    });
  });
}

test("recovery task service accepts auto director resume before background work finishes", async () => {
  const { RecoveryTaskService } = require("../dist/services/task/RecoveryTaskService.js");
  let releaseContinue;
  let continueStarted = false;
  const continuePromise = new Promise((resolve) => {
    releaseContinue = resolve;
  });
  const recoveryService = new RecoveryTaskService(
    {},
    {},
    {
      async continueTask(taskId) {
        continueStarted = taskId === "workflow-1";
        return continuePromise;
      },
    },
    {},
    {
      async markPendingBookAnalysesForManualRecovery() {},
      async markPendingImageTasksForManualRecovery() {},
      async markPendingAutoDirectorTasksForManualRecovery() {},
      async markPendingPipelineJobsForManualRecovery() {},
      async markPendingStyleTasksForManualRecovery() {},
    },
  );

  const result = await Promise.race([
    recoveryService.startResumeRecoveryCandidate("novel_workflow", "workflow-1").then(() => "accepted"),
    continuePromise.then(() => "finished"),
  ]);

  assert.equal(result, "accepted");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(continueStarted, true);
  releaseContinue();
  await continuePromise;
});

test("task recovery routes expose overview, recovery candidates, and resume actions", async () => {
  const originals = {
    getOverview: taskCenterService.getOverview,
    listRecoveryCandidates: recoveryTaskService.listRecoveryCandidates,
    resumeRecoveryCandidate: recoveryTaskService.resumeRecoveryCandidate,
    resumeAllRecoveryCandidates: recoveryTaskService.resumeAllRecoveryCandidates,
    startResumeRecoveryCandidate: recoveryTaskService.startResumeRecoveryCandidate,
    startResumeAllRecoveryCandidates: recoveryTaskService.startResumeAllRecoveryCandidates,
  };
  const calls = [];

  taskCenterService.getOverview = async () => ({
    queuedCount: 2,
    runningCount: 1,
    failedCount: 3,
    cancelledCount: 1,
    waitingApprovalCount: 4,
    recoveryCandidateCount: 2,
  });
  recoveryTaskService.listRecoveryCandidates = async () => ({
    items: [{
      id: "workflow-1",
      kind: "novel_workflow",
      title: "《风雪断桥》自动导演",
      ownerLabel: "风雪断桥",
      status: "queued",
      currentStage: "故事宏观规划",
      currentItemLabel: "等待恢复候选方向",
      resumeAction: "继续导演",
      sourceRoute: "/novels/auto-director?taskId=workflow-1",
      recoveryHint: "建议先确认当前候选方向，再继续后续自动推进。",
    }],
  });
  recoveryTaskService.resumeRecoveryCandidate = async (kind, id) => {
    calls.push(["single", kind, id]);
  };
  recoveryTaskService.resumeAllRecoveryCandidates = async () => {
    calls.push(["all"]);
    return [{ kind: "novel_workflow", id: "workflow-1" }];
  };
  recoveryTaskService.startResumeRecoveryCandidate = async (kind, id) => {
    calls.push(["single", kind, id]);
  };
  recoveryTaskService.startResumeAllRecoveryCandidates = async () => {
    calls.push(["all"]);
    return [{ kind: "novel_workflow", id: "workflow-1" }];
  };

  const app = createApp();
  const server = http.createServer(app);
  const port = await listen(server);

  try {
    const overviewResponse = await fetch(`http://127.0.0.1:${port}/api/tasks/overview`);
    assert.equal(overviewResponse.status, 200);
    const overviewPayload = await overviewResponse.json();
    assert.equal(overviewPayload.success, true);
    assert.equal(overviewPayload.data.failedCount, 3);

    const candidatesResponse = await fetch(`http://127.0.0.1:${port}/api/tasks/recovery-candidates`);
    assert.equal(candidatesResponse.status, 200);
    const candidatesPayload = await candidatesResponse.json();
    assert.equal(candidatesPayload.success, true);
    assert.equal(candidatesPayload.data.items[0].kind, "novel_workflow");

    const resumeSingleResponse = await fetch(`http://127.0.0.1:${port}/api/tasks/recovery-candidates/novel_workflow/workflow-1/resume`, {
      method: "POST",
    });
    assert.equal(resumeSingleResponse.status, 202);
    const resumeSinglePayload = await resumeSingleResponse.json();
    assert.equal(resumeSinglePayload.success, true);
    assert.deepEqual(calls[0], ["single", "novel_workflow", "workflow-1"]);

    const resumeAllResponse = await fetch(`http://127.0.0.1:${port}/api/tasks/recovery-candidates/resume-all`, {
      method: "POST",
    });
    assert.equal(resumeAllResponse.status, 202);
    const resumeAllPayload = await resumeAllResponse.json();
    assert.equal(resumeAllPayload.success, true);
    assert.equal(resumeAllPayload.data.resumed.length, 1);
    assert.deepEqual(calls[1], ["all"]);
  } finally {
    taskCenterService.getOverview = originals.getOverview;
    recoveryTaskService.listRecoveryCandidates = originals.listRecoveryCandidates;
    recoveryTaskService.resumeRecoveryCandidate = originals.resumeRecoveryCandidate;
    recoveryTaskService.resumeAllRecoveryCandidates = originals.resumeAllRecoveryCandidates;
    recoveryTaskService.startResumeRecoveryCandidate = originals.startResumeRecoveryCandidate;
    recoveryTaskService.startResumeAllRecoveryCandidates = originals.startResumeAllRecoveryCandidates;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
