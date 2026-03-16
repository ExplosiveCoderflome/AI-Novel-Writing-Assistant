const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { createApp } = require("../dist/app.js");
const { AgentTraceStore } = require("../dist/agents/traceStore.js");
const { creativeHubLangGraph } = require("../dist/creativeHub/CreativeHubLangGraph.js");
const { creativeHubService } = require("../dist/creativeHub/CreativeHubService.js");
const { llmConnectivityService } = require("../dist/llm/connectivity.js");
const { NovelService } = require("../dist/services/novel/NovelService.js");

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(address.port);
    });
  });
}

test("GET /api/llm/model-routes returns success payload", async () => {
  const app = createApp();
  const server = http.createServer(app);
  const port = await listen(server);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/llm/model-routes`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.success, true);
    assert.ok(Array.isArray(payload.data.taskTypes));
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("POST /api/llm/model-routes/connectivity returns per-task connectivity statuses", async () => {
  const originalTestModelRoutes = llmConnectivityService.testModelRoutes;
  llmConnectivityService.testModelRoutes = async () => ({
    testedAt: new Date().toISOString(),
    statuses: [{
      taskType: "repair",
      provider: "deepseek",
      model: "deepseek-chat",
      ok: true,
      latency: 128,
      error: null,
    }],
  });

  const app = createApp();
  const server = http.createServer(app);
  const port = await listen(server);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/llm/model-routes/connectivity`, {
      method: "POST",
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.success, true);
    assert.equal(payload.data.statuses[0].taskType, "repair");
    assert.equal(payload.data.statuses[0].ok, true);
  } finally {
    llmConnectivityService.testModelRoutes = originalTestModelRoutes;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("GET /api/agent-catalog returns agents and tools", async () => {
  const app = createApp();
  const server = http.createServer(app);
  const port = await listen(server);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/agent-catalog`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.success, true);
    assert.ok(Array.isArray(payload.data.agents));
    assert.ok(Array.isArray(payload.data.tools));
    assert.ok(payload.data.tools.some((item) => item.name === "list_tasks"));
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("creative hub thread create and state routes return success payloads", async () => {
  const app = createApp();
  const server = http.createServer(app);
  const port = await listen(server);
  try {
    const createResponse = await fetch(`http://127.0.0.1:${port}/api/creative-hub/threads`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "测试线程",
        resourceBindings: {
          novelId: "novel_demo",
        },
      }),
    });
    assert.equal(createResponse.status, 201);
    const createPayload = await createResponse.json();
    assert.equal(createPayload.success, true);
    assert.ok(createPayload.data.id);

    const stateResponse = await fetch(`http://127.0.0.1:${port}/api/creative-hub/threads/${createPayload.data.id}/state`);
    assert.equal(stateResponse.status, 200);
    const statePayload = await stateResponse.json();
    assert.equal(statePayload.success, true);
    assert.equal(statePayload.data.thread.id, createPayload.data.id);
    assert.ok(Array.isArray(statePayload.data.messages));
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("creative hub stream route emits turn summary frames", async () => {
  const app = createApp();
  const server = http.createServer(app);
  const port = await listen(server);
  const thread = await creativeHubService.createThread({
    title: "stream summary test",
  });
  const originalRunThread = creativeHubLangGraph.runThread;
  const turnSummary = {
    runId: "run_summary_test",
    checkpointId: "cp_summary_test",
    status: "succeeded",
    currentStage: "章节推进",
    intentSummary: "围绕当前章节继续推进正文。",
    actionSummary: "读取上下文并生成了新的章节回复。",
    impactSummary: "线程状态已更新，下一步可以继续扩写或复盘。",
    nextSuggestion: "继续扩写当前章节，并检查角色动机是否一致。",
  };

  creativeHubLangGraph.runThread = async (_input, emitFrame) => {
    emitFrame({
      event: "creative_hub/run_status",
      data: {
        runId: turnSummary.runId,
        status: "running",
      },
    });
    emitFrame({
      event: "messages/complete",
      data: [{
        id: "ai_1",
        type: "ai",
        content: "已生成新的章节回复。",
      }],
    });
    emitFrame({
      event: "creative_hub/turn_summary",
      data: turnSummary,
    });
    emitFrame({
      event: "metadata",
      data: {
        checkpointId: turnSummary.checkpointId,
        runId: turnSummary.runId,
        latestTurnSummary: turnSummary,
      },
    });
    return {
      runId: turnSummary.runId,
      assistantOutput: "已生成新的章节回复。",
      checkpoint: {
        checkpointId: turnSummary.checkpointId,
        parentCheckpointId: null,
        runId: turnSummary.runId,
        messageCount: 2,
        preview: "已生成新的章节回复。",
        createdAt: new Date().toISOString(),
      },
      interrupts: [],
      status: "idle",
      latestError: null,
      messages: [{
        id: "ai_1",
        type: "ai",
        content: "已生成新的章节回复。",
      }],
      resourceBindings: {},
      diagnostics: undefined,
      turnSummary,
    };
  };

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/creative-hub/threads/${thread.id}/runs/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [{
          id: "human_1",
          type: "human",
          content: "继续写这一章",
        }],
      }),
    });
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.match(text, /"event":"creative_hub\/turn_summary"/);
    assert.match(text, /"runId":"run_summary_test"/);
    assert.match(text, /"checkpointId":"cp_summary_test"/);
  } finally {
    creativeHubLangGraph.runThread = originalRunThread;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("creative hub state route exposes latest turn summary metadata", async () => {
  const app = createApp();
  const server = http.createServer(app);
  const port = await listen(server);
  const thread = await creativeHubService.createThread({
    title: "state summary test",
  });
  const turnSummary = {
    runId: "run_state_summary",
    checkpointId: "cp_state_summary",
    status: "failed",
    currentStage: "世界观校验",
    intentSummary: "检查当前世界观设定是否冲突。",
    actionSummary: "读取设定文档并发现了一处角色冲突。",
    impactSummary: "本轮未继续推进正文，需要先修复设定问题。",
    nextSuggestion: "先修复角色设定冲突，再继续章节写作。",
  };

  try {
    await creativeHubService.saveCheckpoint(thread.id, {
      checkpointId: turnSummary.checkpointId,
      runId: turnSummary.runId,
      status: "error",
      latestError: "validation failed",
      messages: [{
        id: "human_1",
        type: "human",
        content: "检查世界观是否冲突",
      }],
      interrupts: [],
      resourceBindings: {},
      metadata: {
        latestTurnSummary: turnSummary,
      },
    });

    const response = await fetch(`http://127.0.0.1:${port}/api/creative-hub/threads/${thread.id}/state`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.success, true);
    assert.equal(payload.data.thread.id, thread.id);
    assert.equal(payload.data.metadata.latestTurnSummary.runId, turnSummary.runId);
    assert.equal(payload.data.metadata.latestTurnSummary.currentStage, turnSummary.currentStage);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("creative hub interrupt route resumes via langgraph and updates thread state", async () => {
  const app = createApp();
  const server = http.createServer(app);
  const port = await listen(server);
  const store = new AgentTraceStore();
  try {
    const thread = await creativeHubService.createThread({
      title: "审批线程",
    });
    const run = await store.createRun({
      sessionId: `creative_hub_${thread.id}`,
      goal: "审批恢复测试",
      entryAgent: "Planner",
    });
    await store.updateRun(run.id, {
      status: "waiting_approval",
      currentStep: "waiting_approval",
      currentAgent: "Planner",
      startedAt: new Date(),
    });
    const approval = await store.addApproval({
      runId: run.id,
      approvalType: "high_impact_write",
      targetType: "novel",
      targetId: "novel_demo",
      diffSummary: "请确认是否继续。",
      payloadJson: JSON.stringify({
        goal: "审批恢复测试",
        context: {
          contextMode: "global",
        },
        plannedActions: [{
          agent: "Planner",
          reasoning: "审批通过后读取小说列表",
          calls: [{
            tool: "list_novels",
            reason: "继续读取小说列表",
            idempotencyKey: `approval_${run.id}`,
            input: {
              limit: 5,
            },
          }],
        }],
      }),
    });
    await creativeHubService.saveCheckpoint(thread.id, {
      checkpointId: `cp_${run.id}`,
      runId: run.id,
      status: "interrupted",
      messages: [{
        id: "human_1",
        type: "human",
        content: "继续执行审批任务",
      }],
      interrupts: [{
        id: approval.id,
        approvalId: approval.id,
        runId: run.id,
        title: "待审批",
        summary: approval.diffSummary,
        targetType: approval.targetType,
        targetId: approval.targetId,
      }],
      resourceBindings: {},
      metadata: {
        source: "test_seed",
      },
    });

    const response = await fetch(`http://127.0.0.1:${port}/api/creative-hub/threads/${thread.id}/interrupts/${approval.id}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "approve",
        note: "通过测试审批",
      }),
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.success, true);
    assert.equal(payload.data.thread.id, thread.id);
    assert.equal(payload.data.thread.latestRunId, run.id);
    assert.ok(Array.isArray(payload.data.messages));
    assert.ok(payload.data.messages.some((item) => item.type === "ai"));
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("novel state and planning routes return success payloads", async () => {
  const originalMethods = {
    getNovelState: NovelService.prototype.getNovelState,
    getLatestStateSnapshot: NovelService.prototype.getLatestStateSnapshot,
    getChapterStateSnapshot: NovelService.prototype.getChapterStateSnapshot,
    rebuildNovelState: NovelService.prototype.rebuildNovelState,
    generateBookPlan: NovelService.prototype.generateBookPlan,
    generateArcPlan: NovelService.prototype.generateArcPlan,
    generateChapterPlan: NovelService.prototype.generateChapterPlan,
    getChapterPlan: NovelService.prototype.getChapterPlan,
    replanNovel: NovelService.prototype.replanNovel,
  };
  const novelId = "novel-route-test";
  const chapterId = "chapter-route-test";
  const snapshot = {
    id: "snapshot-1",
    novelId,
    sourceChapterId: chapterId,
    chapterOrder: 3,
    summary: "状态快照摘要",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    characterStates: [],
    relationStates: [],
    informationStates: [],
    foreshadowStates: [],
  };
  const plan = {
    id: "plan-1",
    novelId,
    chapterId,
    sourceStateSnapshotId: snapshot.id,
    level: "chapter",
    title: "第3章规划",
    objective: "推进角色冲突",
    participantsJson: JSON.stringify(["主角", "对手"]),
    revealsJson: JSON.stringify(["揭露新线索"]),
    riskNotesJson: JSON.stringify(["避免重复设定"]),
    hookTarget: "留下交易反转悬念",
    rawPlanJson: JSON.stringify({ ok: true }),
    externalRef: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    scenes: [{
      id: "scene-1",
      planId: "plan-1",
      sortOrder: 1,
      title: "遭遇",
      objective: "制造冲突",
      conflict: "双方试探",
      reveal: "交易线索",
      emotionBeat: "紧绷",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }],
  };
  NovelService.prototype.getNovelState = async () => ({ latestSnapshot: snapshot, snapshots: [snapshot] });
  NovelService.prototype.getLatestStateSnapshot = async () => snapshot;
  NovelService.prototype.getChapterStateSnapshot = async () => snapshot;
  NovelService.prototype.rebuildNovelState = async () => ({ rebuiltCount: 1, latestSnapshot: snapshot });
  NovelService.prototype.generateBookPlan = async () => ({ ...plan, chapterId: null, level: "book", scenes: [] });
  NovelService.prototype.generateArcPlan = async () => ({ ...plan, chapterId: null, level: "arc", externalRef: "arc-1", scenes: [] });
  NovelService.prototype.generateChapterPlan = async () => plan;
  NovelService.prototype.getChapterPlan = async () => plan;
  NovelService.prototype.replanNovel = async () => ({ ...plan, id: "plan-replanned" });

  const app = createApp();
  const server = http.createServer(app);
  const port = await listen(server);
  try {
    const stateResponse = await fetch(`http://127.0.0.1:${port}/api/novels/${novelId}/state`);
    assert.equal(stateResponse.status, 200);
    assert.equal((await stateResponse.json()).success, true);

    const latestSnapshotResponse = await fetch(`http://127.0.0.1:${port}/api/novels/${novelId}/state-snapshots/latest`);
    assert.equal(latestSnapshotResponse.status, 200);
    assert.equal((await latestSnapshotResponse.json()).data.id, snapshot.id);

    const chapterSnapshotResponse = await fetch(`http://127.0.0.1:${port}/api/novels/${novelId}/chapters/${chapterId}/state-snapshot`);
    assert.equal(chapterSnapshotResponse.status, 200);
    assert.equal((await chapterSnapshotResponse.json()).data.sourceChapterId, chapterId);

    const rebuildResponse = await fetch(`http://127.0.0.1:${port}/api/novels/${novelId}/state/rebuild`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    assert.equal(rebuildResponse.status, 200);
    assert.equal((await rebuildResponse.json()).data.rebuiltCount, 1);

    const bookPlanResponse = await fetch(`http://127.0.0.1:${port}/api/novels/${novelId}/plans/book/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    assert.equal(bookPlanResponse.status, 200);
    assert.equal((await bookPlanResponse.json()).data.level, "book");

    const arcPlanResponse = await fetch(`http://127.0.0.1:${port}/api/novels/${novelId}/plans/arcs/arc-1/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    assert.equal(arcPlanResponse.status, 200);
    assert.equal((await arcPlanResponse.json()).data.level, "arc");

    const chapterPlanGenerateResponse = await fetch(`http://127.0.0.1:${port}/api/novels/${novelId}/chapters/${chapterId}/plan/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    assert.equal(chapterPlanGenerateResponse.status, 200);
    assert.equal((await chapterPlanGenerateResponse.json()).data.id, plan.id);

    const chapterPlanResponse = await fetch(`http://127.0.0.1:${port}/api/novels/${novelId}/chapters/${chapterId}/plan`);
    assert.equal(chapterPlanResponse.status, 200);
    assert.equal((await chapterPlanResponse.json()).data.objective, plan.objective);

    const replanResponse = await fetch(`http://127.0.0.1:${port}/api/novels/${novelId}/replan`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chapterId,
        reason: "manual route test",
      }),
    });
    assert.equal(replanResponse.status, 200);
    assert.equal((await replanResponse.json()).data.id, "plan-replanned");
  } finally {
    Object.assign(NovelService.prototype, originalMethods);
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("novel audit routes return success payloads", async () => {
  const originalMethods = {
    auditChapter: NovelService.prototype.auditChapter,
    listChapterAuditReports: NovelService.prototype.listChapterAuditReports,
    resolveAuditIssues: NovelService.prototype.resolveAuditIssues,
  };
  const novelId = "novel-audit-route-test";
  const chapterId = "chapter-audit-route-test";
  const issue = {
    id: "issue-1",
    reportId: "report-1",
    auditType: "continuity",
    severity: "high",
    code: "continuity_gap",
    description: "设定前后不一致",
    evidence: "第二段角色知道了不该知道的信息",
    fixSuggestion: "补充信息来源或移除该已知信息",
    status: "open",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const report = {
    id: "report-1",
    novelId,
    chapterId,
    auditType: "continuity",
    overallScore: 71,
    summary: "存在连续性风险",
    legacyScoreJson: JSON.stringify({ overall: 71 }),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    issues: [issue],
  };
  const auditResult = {
    score: {
      coherence: 72,
      repetition: 82,
      pacing: 75,
      voice: 79,
      engagement: 78,
      overall: 77,
    },
    issues: [{
      severity: "high",
      category: "coherence",
      evidence: issue.evidence,
      fixSuggestion: issue.fixSuggestion,
    }],
    auditReports: [report],
  };
  NovelService.prototype.auditChapter = async () => auditResult;
  NovelService.prototype.listChapterAuditReports = async () => [report];
  NovelService.prototype.resolveAuditIssues = async () => [{ ...issue, status: "resolved" }];

  const app = createApp();
  const server = http.createServer(app);
  const port = await listen(server);
  try {
    const fullAuditResponse = await fetch(`http://127.0.0.1:${port}/api/novels/${novelId}/chapters/${chapterId}/audit/full`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    assert.equal(fullAuditResponse.status, 200);
    assert.equal((await fullAuditResponse.json()).data.auditReports[0].auditType, "continuity");

    const continuityAuditResponse = await fetch(`http://127.0.0.1:${port}/api/novels/${novelId}/chapters/${chapterId}/audit/continuity`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    assert.equal(continuityAuditResponse.status, 200);
    assert.equal((await continuityAuditResponse.json()).success, true);

    const reportsResponse = await fetch(`http://127.0.0.1:${port}/api/novels/${novelId}/chapters/${chapterId}/audit-reports`);
    assert.equal(reportsResponse.status, 200);
    assert.equal((await reportsResponse.json()).data.length, 1);

    const resolveResponse = await fetch(`http://127.0.0.1:${port}/api/novels/${novelId}/audit-issues/${issue.id}/resolve`, {
      method: "POST",
    });
    assert.equal(resolveResponse.status, 200);
    assert.equal((await resolveResponse.json()).data[0].status, "resolved");
  } finally {
    Object.assign(NovelService.prototype, originalMethods);
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
