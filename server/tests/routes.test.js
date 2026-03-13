const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { createApp } = require("../dist/app.js");
const { AgentTraceStore } = require("../dist/agents/traceStore.js");
const { creativeHubService } = require("../dist/creativeHub/CreativeHubService.js");

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
