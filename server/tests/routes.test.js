const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { createApp } = require("../dist/app.js");
const { AgentTraceStore } = require("../dist/agents/traceStore.js");
const { creativeHubLangGraph } = require("../dist/creativeHub/CreativeHubLangGraph.js");
const { creativeHubService } = require("../dist/creativeHub/CreativeHubService.js");
const { llmConnectivityService } = require("../dist/llm/connectivity.js");
const { NovelService } = require("../dist/services/novel/NovelService.js");
const { NovelFramingSuggestionService } = require("../dist/services/novel/NovelFramingSuggestionService.js");
const { ragServices } = require("../dist/services/rag/index.js");
const { providerBalanceService } = require("../dist/services/settings/ProviderBalanceService.js");
const { prisma } = require("../dist/db/prisma.js");

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(address.port);
    });
  });
}

async function safeDeleteCreativeHubThread(threadId) {
  if (!threadId) {
    return;
  }
  try {
    await creativeHubService.deleteThread(threadId);
  } catch {
    // Ignore cleanup failures in shared dev/test environments.
  }
}

async function safeDeleteNovel(port, novelId) {
  if (!novelId) {
    return;
  }
  try {
    await fetch(`http://127.0.0.1:${port}/api/novels/${novelId}`, {
      method: "DELETE",
    });
  } catch {
    // Ignore cleanup failures in shared dev/test environments.
  }
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

test("GET /api/settings/rag/models/openai returns embedding-only models", async () => {
  const originalFetch = global.fetch;
  const originalOpenAIKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-openai-key";
  global.fetch = async () => new Response(JSON.stringify({
    data: [
      { id: "gpt-4o-mini" },
      { id: "text-embedding-3-small" },
      { id: "text-embedding-3-large" },
    ],
  }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });

  const httpFetch = originalFetch.bind(global);
  const app = createApp();
  const server = http.createServer(app);
  const port = await listen(server);
  try {
    const response = await httpFetch(`http://127.0.0.1:${port}/api/settings/rag/models/openai`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.success, true);
    assert.equal(payload.data.provider, "openai");
    assert.ok(Array.isArray(payload.data.models));
    assert.ok(payload.data.models.every((model) => model.startsWith("text-embedding-")));
    assert.ok(payload.data.models.includes("text-embedding-3-small"));
    assert.equal(payload.data.source, "remote");
  } finally {
    global.fetch = originalFetch;
    if (originalOpenAIKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalOpenAIKey;
    }
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("PUT /api/settings/rag saves extended settings and auto-enqueues reindex", async () => {
  const originalEnqueueReindex = ragServices.ragIndexService.enqueueReindex;
  ragServices.ragIndexService.enqueueReindex = async () => ({
    scope: "all",
    id: null,
    count: 12,
    jobs: [],
  });

  const app = createApp();
  const server = http.createServer(app);
  const port = await listen(server);
  try {
    const settingsResponse = await fetch(`http://127.0.0.1:${port}/api/settings/rag`);
    assert.equal(settingsResponse.status, 200);
    const settingsPayload = await settingsResponse.json();
    const current = settingsPayload.data;
    const nextModel = current.embeddingModel === "text-embedding-3-small"
      ? "text-embedding-3-large"
      : "text-embedding-3-small";

    const response = await fetch(`http://127.0.0.1:${port}/api/settings/rag`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        embeddingProvider: current.embeddingProvider,
        embeddingModel: nextModel,
        collectionMode: "auto",
        collectionName: current.collectionName,
        collectionTag: "kb",
        autoReindexOnChange: true,
        embeddingBatchSize: current.embeddingBatchSize,
        embeddingTimeoutMs: current.embeddingTimeoutMs,
        embeddingMaxRetries: current.embeddingMaxRetries,
        embeddingRetryBaseMs: current.embeddingRetryBaseMs,
      }),
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.success, true);
    assert.equal(payload.data.embeddingModel, nextModel);
    assert.equal(payload.data.collectionMode, "auto");
    assert.equal(payload.data.reindexQueuedCount, 12);

    await fetch(`http://127.0.0.1:${port}/api/settings/rag`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        embeddingProvider: current.embeddingProvider,
        embeddingModel: current.embeddingModel,
        collectionMode: current.collectionMode,
        collectionName: current.collectionName,
        collectionTag: current.collectionTag,
        autoReindexOnChange: current.autoReindexOnChange,
        embeddingBatchSize: current.embeddingBatchSize,
        embeddingTimeoutMs: current.embeddingTimeoutMs,
        embeddingMaxRetries: current.embeddingMaxRetries,
        embeddingRetryBaseMs: current.embeddingRetryBaseMs,
      }),
    });
  } finally {
    ragServices.ragIndexService.enqueueReindex = originalEnqueueReindex;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("GET /api/rag/jobs returns progress snapshots", async () => {
  const originalListJobSummaries = ragServices.ragIndexService.listJobSummaries;
  ragServices.ragIndexService.listJobSummaries = async () => ([{
    id: "rag-job-1",
    tenantId: "default",
    jobType: "rebuild",
    ownerType: "knowledge_document",
    ownerId: "doc-1",
    status: "running",
    attempts: 1,
    maxAttempts: 5,
    runAfter: new Date("2026-03-18T10:00:00.000Z"),
    lastError: null,
    createdAt: new Date("2026-03-18T10:00:00.000Z"),
    updatedAt: new Date("2026-03-18T10:01:00.000Z"),
    progress: {
      stage: "embedding",
      label: "生成向量",
      detail: "正在生成向量，第 2/4 批。",
      current: 32,
      total: 64,
      percent: 0.5,
      documents: 1,
      chunks: 64,
      updatedAt: "2026-03-18T10:01:00.000Z",
    },
  }]);

  const app = createApp();
  const server = http.createServer(app);
  const port = await listen(server);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/rag/jobs`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.success, true);
    assert.equal(payload.data[0].ownerType, "knowledge_document");
    assert.equal(payload.data[0].progress.stage, "embedding");
    assert.equal(payload.data[0].progress.current, 32);
    assert.equal(payload.data[0].progress.total, 64);
  } finally {
    ragServices.ragIndexService.listJobSummaries = originalListJobSummaries;
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

test("GET /api/settings/api-keys/balances returns provider balance statuses", async () => {
  const originalListBalances = providerBalanceService.listBalances;
  providerBalanceService.listBalances = async () => ([
    {
      provider: "deepseek",
      status: "available",
      supported: true,
      canRefresh: true,
      source: "provider_api",
      currency: "CNY",
      availableBalance: 88.5,
      totalBalance: 88.5,
      cashBalance: null,
      voucherBalance: null,
      chargeBalance: null,
      toppedUpBalance: 80,
      grantedBalance: 8.5,
      fetchedAt: new Date().toISOString(),
      message: "余额已刷新。",
      error: null,
    },
    {
      provider: "qwen",
      status: "unsupported",
      supported: false,
      canRefresh: false,
      source: "aliyun_account",
      currency: null,
      availableBalance: null,
      totalBalance: null,
      cashBalance: null,
      voucherBalance: null,
      chargeBalance: null,
      toppedUpBalance: null,
      grantedBalance: null,
      fetchedAt: new Date().toISOString(),
      message: "当前系统只保存 DashScope API Key。",
      error: null,
    },
  ]);

  const app = createApp();
  const server = http.createServer(app);
  const port = await listen(server);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/settings/api-keys/balances`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.success, true);
    assert.equal(payload.data[0].provider, "deepseek");
    assert.equal(payload.data[0].availableBalance, 88.5);
    assert.equal(payload.data[1].provider, "qwen");
    assert.equal(payload.data[1].status, "unsupported");
  } finally {
    providerBalanceService.listBalances = originalListBalances;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("POST /api/settings/api-keys/:provider/refresh-balance returns provider balance snapshot", async () => {
  const originalFindUnique = prisma.aPIKey.findUnique;
  const originalGetProviderBalance = providerBalanceService.getProviderBalance;
  prisma.aPIKey.findUnique = async () => ({
    provider: "deepseek",
    key: "test-deepseek-key",
  });
  providerBalanceService.getProviderBalance = async () => ({
    provider: "deepseek",
    status: "available",
    supported: true,
    canRefresh: true,
    source: "provider_api",
    currency: "CNY",
    availableBalance: 66.6,
    totalBalance: 66.6,
    cashBalance: null,
    voucherBalance: null,
    chargeBalance: null,
    toppedUpBalance: 60,
    grantedBalance: 6.6,
    fetchedAt: new Date().toISOString(),
    message: "余额已刷新。",
    error: null,
  });

  const app = createApp();
  const server = http.createServer(app);
  const port = await listen(server);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/settings/api-keys/deepseek/refresh-balance`, {
      method: "POST",
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.success, true);
    assert.equal(payload.data.provider, "deepseek");
    assert.equal(payload.data.availableBalance, 66.6);
  } finally {
    prisma.aPIKey.findUnique = originalFindUnique;
    providerBalanceService.getProviderBalance = originalGetProviderBalance;
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
  let createdThreadId = null;
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
          styleProfileId: "style_demo",
        },
      }),
    });
    assert.equal(createResponse.status, 201);
    const createPayload = await createResponse.json();
    assert.equal(createPayload.success, true);
    assert.ok(createPayload.data.id);
    createdThreadId = createPayload.data.id;

    const stateResponse = await fetch(`http://127.0.0.1:${port}/api/creative-hub/threads/${createPayload.data.id}/state`);
    assert.equal(stateResponse.status, 200);
    const statePayload = await stateResponse.json();
    assert.equal(statePayload.success, true);
    assert.equal(statePayload.data.thread.id, createPayload.data.id);
    assert.equal(statePayload.data.thread.resourceBindings.styleProfileId, "style_demo");
    assert.ok(Array.isArray(statePayload.data.messages));
  } finally {
    await safeDeleteCreativeHubThread(createdThreadId);
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("novel routes preserve book framing fields through create-get-update cycle", async () => {
  const app = createApp();
  const server = http.createServer(app);
  const port = await listen(server);
  let novelId = null;

  try {
    const createResponse = await fetch(`http://127.0.0.1:${port}/api/novels`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: `book-framing-route-${Date.now()}`,
        description: "测试书级 framing roundtrip。",
        targetAudience: "爱看都市高压逆袭的读者",
        bookSellingPoint: "每次现实困局都会撬动更大的利益链。",
        competingFeel: "现实职场压迫感里带强反压。",
        first30ChapterPromise: "前 30 章必须让核心对手浮出水面。",
        commercialTags: ["逆袭", "强冲突", "职场博弈"],
      }),
    });
    assert.equal(createResponse.status, 201);
    const createPayload = await createResponse.json();
    assert.equal(createPayload.success, true);
    assert.equal(createPayload.data.targetAudience, "爱看都市高压逆袭的读者");
    assert.deepEqual(createPayload.data.commercialTags, ["逆袭", "强冲突", "职场博弈"]);
    novelId = createPayload.data.id;

    const detailResponse = await fetch(`http://127.0.0.1:${port}/api/novels/${novelId}`);
    assert.equal(detailResponse.status, 200);
    const detailPayload = await detailResponse.json();
    assert.equal(detailPayload.data.bookSellingPoint, "每次现实困局都会撬动更大的利益链。");
    assert.equal(detailPayload.data.competingFeel, "现实职场压迫感里带强反压。");
    assert.equal(detailPayload.data.first30ChapterPromise, "前 30 章必须让核心对手浮出水面。");

    const updateResponse = await fetch(`http://127.0.0.1:${port}/api/novels/${novelId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        targetAudience: "爱看现实强冲突和关系拉扯的读者",
        first30ChapterPromise: "前 30 章必须让主角完成第一次强反压。",
        competingFeel: null,
        commercialTags: ["关系拉扯", "现实高压", "持续钩子"],
      }),
    });
    assert.equal(updateResponse.status, 200);
    const updatePayload = await updateResponse.json();
    assert.equal(updatePayload.data.targetAudience, "爱看现实强冲突和关系拉扯的读者");
    assert.equal(updatePayload.data.competingFeel, null);
    assert.deepEqual(updatePayload.data.commercialTags, ["关系拉扯", "现实高压", "持续钩子"]);

    const detailAfterUpdateResponse = await fetch(`http://127.0.0.1:${port}/api/novels/${novelId}`);
    assert.equal(detailAfterUpdateResponse.status, 200);
    const detailAfterUpdatePayload = await detailAfterUpdateResponse.json();
    assert.equal(detailAfterUpdatePayload.data.first30ChapterPromise, "前 30 章必须让主角完成第一次强反压。");
    assert.deepEqual(detailAfterUpdatePayload.data.commercialTags, ["关系拉扯", "现实高压", "持续钩子"]);
  } finally {
    await safeDeleteNovel(port, novelId);
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("POST /api/novels/framing/suggest returns book framing suggestion", async () => {
  const originalSuggest = NovelFramingSuggestionService.prototype.suggest;
  NovelFramingSuggestionService.prototype.suggest = async () => ({
    targetAudience: "爱看高压逆袭和关系拉扯的读者",
    commercialTags: ["逆袭", "强冲突", "持续钩子"],
    competingFeel: "现实压力下的高密度反压阅读感",
    bookSellingPoint: "主角每次解决困局都会撬动更大的利益链。",
    first30ChapterPromise: "前 30 章必须让核心对手浮出水面并完成第一次强反压。",
  });

  const app = createApp();
  const server = http.createServer(app);
  const port = await listen(server);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/novels/framing/suggest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "雾港审判局",
        description: "一个被压制的基层调查员，在雾港权力体系里不断反压上位。",
      }),
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.success, true);
    assert.equal(payload.data.targetAudience, "爱看高压逆袭和关系拉扯的读者");
    assert.deepEqual(payload.data.commercialTags, ["逆袭", "强冲突", "持续钩子"]);
  } finally {
    NovelFramingSuggestionService.prototype.suggest = originalSuggest;
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
    await safeDeleteCreativeHubThread(thread.id);
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
    await safeDeleteCreativeHubThread(thread.id);
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("creative hub interrupt route resumes via langgraph and updates thread state", async () => {
  const app = createApp();
  const server = http.createServer(app);
  const port = await listen(server);
  const store = new AgentTraceStore();
  let threadId = null;
  try {
    const thread = await creativeHubService.createThread({
      title: "审批线程",
    });
    threadId = thread.id;
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
    await safeDeleteCreativeHubThread(threadId);
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

test("novel world slice routes return success payloads", async () => {
  const originalMethods = {
    getWorldSlice: NovelService.prototype.getWorldSlice,
    refreshWorldSlice: NovelService.prototype.refreshWorldSlice,
    updateWorldSliceOverrides: NovelService.prototype.updateWorldSliceOverrides,
  };
  const novelId = "novel-world-slice-route";
  const worldSliceView = {
    hasWorld: true,
    worldId: "world-1",
    worldName: "都市试验场",
    slice: {
      storyId: novelId,
      worldId: "world-1",
      coreWorldFrame: "现实压力驱动情节。",
      appliedRules: [{
        id: "rule-1",
        name: "现实规则优先",
        summary: "所有冲突都要落回现实社会机制。",
        whyItMatters: "它决定剧情边界。",
      }],
      activeForces: [{
        id: "force-1",
        name: "乐圣公司",
        summary: "控制资源的强势公司。",
        roleInStory: "外部施压者",
        pressure: "资源卡位",
      }],
      activeLocations: [{
        id: "location-1",
        name: "核心办公区",
        summary: "职场主战场。",
        storyUse: "承接竞争和交易",
        risk: "失误会被放大",
      }],
      activeElements: [],
      conflictCandidates: ["商业利益与情感关系冲突"],
      pressureSources: ["乐圣公司的资源卡位"],
      mysterySources: [],
      suggestedStoryAxes: ["现实情感"],
      recommendedEntryPoints: ["从主角入职后的第一次重大受挫切入"],
      forbiddenCombinations: ["不要直接引入超自然力量"],
      storyScopeBoundary: "保留现实都市基底。",
      metadata: {
        schemaVersion: 1,
        builtAt: new Date().toISOString(),
        sourceWorldUpdatedAt: new Date().toISOString(),
        storyInputDigest: "digest",
        builtFromStructuredData: true,
        builderMode: "manual_refresh",
      },
    },
    overrides: {
      primaryLocationId: "location-1",
      requiredForceIds: ["force-1"],
      requiredLocationIds: ["location-1"],
      requiredRuleIds: ["rule-1"],
      scopeNote: "保留现实商业压力。",
    },
    availableRules: [{
      id: "rule-1",
      name: "现实规则优先",
      summary: "所有冲突都要落回现实社会机制。",
    }],
    availableForces: [{
      id: "force-1",
      name: "乐圣公司",
      summary: "控制资源的强势公司。",
    }],
    availableLocations: [{
      id: "location-1",
      name: "核心办公区",
      summary: "职场主战场。",
    }],
    storyInputSource: "story_macro",
    isStale: false,
  };

  NovelService.prototype.getWorldSlice = async () => worldSliceView;
  NovelService.prototype.refreshWorldSlice = async () => ({
    ...worldSliceView,
    isStale: false,
  });
  NovelService.prototype.updateWorldSliceOverrides = async () => ({
    ...worldSliceView,
    overrides: {
      ...worldSliceView.overrides,
      scopeNote: "只保留现实压力。",
    },
  });

  const app = createApp();
  const server = http.createServer(app);
  const port = await listen(server);
  try {
    const getResponse = await fetch(`http://127.0.0.1:${port}/api/novels/${novelId}/world-slice`);
    assert.equal(getResponse.status, 200);
    assert.equal((await getResponse.json()).data.worldId, "world-1");

    const refreshResponse = await fetch(`http://127.0.0.1:${port}/api/novels/${novelId}/world-slice/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        builderMode: "manual_refresh",
      }),
    });
    assert.equal(refreshResponse.status, 200);
    assert.equal((await refreshResponse.json()).success, true);

    const updateResponse = await fetch(`http://127.0.0.1:${port}/api/novels/${novelId}/world-slice/overrides`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        primaryLocationId: "location-1",
        requiredForceIds: ["force-1"],
        requiredLocationIds: ["location-1"],
        requiredRuleIds: ["rule-1"],
        scopeNote: "只保留现实压力。",
      }),
    });
    assert.equal(updateResponse.status, 200);
    assert.equal((await updateResponse.json()).data.overrides.scopeNote, "只保留现实压力。");
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
