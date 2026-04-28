const test = require("node:test");
const assert = require("node:assert/strict");

const {
  NovelDirectorAutoExecutionRuntime,
} = require("../dist/services/novel/director/novelDirectorAutoExecutionRuntime.js");

function buildRequest(overrides = {}) {
  return {
    idea: "一个普通人被卷入命运迷局",
    candidate: {
      id: "candidate-1",
      workingTitle: "命运谜局",
      titleOptions: [],
      logline: "一个普通人误入更大的秘密链条。",
      positioning: "都市悬疑成长",
      sellingPoint: "强钩子与高压追更感",
      coreConflict: "主角必须在真相与自保之间抉择",
      protagonistPath: "从被动卷入到主动破局",
      endingDirection: "主角以代价换来新秩序",
      hookStrategy: "用反常事件做开局钩子",
      progressionLoop: "调查推进、反噬升级、关系重组",
      whyItFits: "适合自动导演快速启动",
      toneKeywords: ["悬疑", "压迫感"],
      targetChapterCount: 80,
    },
    runMode: "auto_to_execution",
    ...overrides,
  };
}

function buildSceneCards(order) {
  return JSON.stringify({
    targetWordCount: 2800,
    lengthBudget: {
      targetWordCount: 2800,
      softMinWordCount: 2380,
      softMaxWordCount: 3220,
      hardMaxWordCount: 3500,
    },
    scenes: [
      {
        key: `chapter-${order}-scene-1`,
        title: "起势",
        purpose: "推进本章核心目标",
        mustAdvance: ["主线"],
        mustPreserve: ["人物动机"],
        entryState: "进入冲突",
        exitState: "压力升级",
        forbiddenExpansion: [],
        targetWordCount: 900,
      },
      {
        key: `chapter-${order}-scene-2`,
        title: "交锋",
        purpose: "制造选择压力",
        mustAdvance: ["冲突"],
        mustPreserve: ["设定边界"],
        entryState: "压力升级",
        exitState: "代价显形",
        forbiddenExpansion: [],
        targetWordCount: 900,
      },
      {
        key: `chapter-${order}-scene-3`,
        title: "落点",
        purpose: "形成章末推进",
        mustAdvance: ["章末钩子"],
        mustPreserve: ["后续入口"],
        entryState: "代价显形",
        exitState: "进入下一章",
        forbiddenExpansion: [],
        targetWordCount: 1000,
      },
    ],
  });
}

function withExecutionDetail(chapter) {
  const order = chapter.order ?? chapter.chapterOrder ?? 1;
  return {
    purpose: `第${order}章目标`,
    conflictLevel: 5,
    revealLevel: 3,
    targetWordCount: 2800,
    mustAvoid: "不要展开无关支线",
    taskSheet: `第${order}章任务单`,
    sceneCards: buildSceneCards(order),
    ...chapter,
  };
}

function buildPreparedVolume(order, title, chapterOrders) {
  const volumeId = `volume-${order}`;
  const beatKey = `${volumeId}-beat-1`;
  return {
    id: volumeId,
    sortOrder: order,
    title,
    chapters: chapterOrders.map((chapterOrder) => withExecutionDetail({
      id: `chapter-${chapterOrder}`,
      chapterOrder,
      title: `第${chapterOrder}章`,
      beatKey,
      payoffRefs: [],
    })),
  };
}

function buildPreparedWorkspace() {
  return {
    volumes: [
      buildPreparedVolume(1, "开局卷", [1, 2, 3, 4]),
      buildPreparedVolume(2, "反扑卷", [5, 6, 7, 8]),
    ],
    beatSheets: [
      {
        volumeId: "volume-1",
        beats: [{ key: "volume-1-beat-1", label: "开局推进", chapterSpanHint: "1-4" }],
      },
      {
        volumeId: "volume-2",
        beats: [{ key: "volume-2-beat-1", label: "反扑升级", chapterSpanHint: "1-4" }],
      },
    ],
  };
}

test("runFromReady completes immediately when repaired chapters leave no remaining auto-execution work", async () => {
  const calls = [];
  const runtime = new NovelDirectorAutoExecutionRuntime({
    novelContextService: {
      async listChapters() {
        return [
          { id: "chapter-1", order: 1, generationState: "approved" },
          { id: "chapter-2", order: 2, generationState: "published" },
        ];
      },
    },
    novelService: {
      async startPipelineJob() {
        calls.push(["startPipelineJob"]);
        throw new Error("should not start a new pipeline job");
      },
      async findActivePipelineJobForRange() {
        return null;
      },
      async getPipelineJobById() {
        throw new Error("should not inspect a pipeline job");
      },
      async cancelPipelineJob() {
        calls.push(["cancelPipelineJob"]);
      },
    },
    workflowService: {
      async bootstrapTask(input) {
        calls.push(["bootstrapTask", input.seedPayload.autoExecution.remainingChapterCount]);
      },
      async getTaskById() {
        return { status: "waiting_approval" };
      },
      async markTaskRunning() {
        calls.push(["markTaskRunning"]);
      },
      async recordCheckpoint(taskId, input) {
        calls.push([
          "recordCheckpoint",
          taskId,
          input.checkpointType,
          input.itemLabel,
          input.seedPayload.autoExecution.remainingChapterCount,
        ]);
      },
      async markTaskFailed() {
        calls.push(["markTaskFailed"]);
      },
    },
    buildDirectorSeedPayload(_request, _novelId, extra) {
      return extra ?? {};
    },
  });

  await runtime.runFromReady({
    taskId: "task-auto-exec",
    novelId: "novel-1",
    request: buildRequest(),
    existingState: {
      enabled: true,
      firstChapterId: "chapter-1",
      startOrder: 1,
      endOrder: 2,
      totalChapterCount: 2,
      pipelineJobId: "job-failed",
      pipelineStatus: "failed",
    },
  });

  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], ["bootstrapTask", 0]);
  assert.deepEqual(calls[1].slice(0, 3), ["recordCheckpoint", "task-auto-exec", "workflow_completed"]);
  assert.match(String(calls[1][3]), /前 ?2 章自动执行完成/);
  assert.equal(calls[1][4], 0);
});

test("runFromReady reuses an existing active range job before starting a new pipeline", async () => {
  const calls = [];
  let pipelineCompleted = false;
  const runtime = new NovelDirectorAutoExecutionRuntime({
    novelContextService: {
      async listChapters() {
        return [
          withExecutionDetail({ id: "chapter-1", order: 1, generationState: pipelineCompleted ? "approved" : "draft" }),
          withExecutionDetail({ id: "chapter-2", order: 2, generationState: pipelineCompleted ? "approved" : "draft" }),
        ];
      },
    },
    novelService: {
      async startPipelineJob() {
        calls.push(["startPipelineJob"]);
        throw new Error("should not start a new pipeline job");
      },
      async findActivePipelineJobForRange(novelId, startOrder, endOrder, preferredJobId) {
        calls.push(["findActivePipelineJobForRange", novelId, startOrder, endOrder, preferredJobId]);
        return { id: "job-active", status: "running" };
      },
      async getPipelineJobById(jobId) {
        calls.push(["getPipelineJobById", jobId]);
        if (jobId === "job-active") {
          pipelineCompleted = true;
          return {
            id: "job-active",
            status: "succeeded",
            progress: 1,
            currentStage: null,
            currentItemLabel: null,
            error: null,
          };
        }
        return null;
      },
      async cancelPipelineJob() {
        calls.push(["cancelPipelineJob"]);
      },
    },
    workflowService: {
      async bootstrapTask(input) {
        calls.push(["bootstrapTask", input.seedPayload.autoExecution.pipelineJobId, input.seedPayload.autoExecution.pipelineStatus]);
      },
      async getTaskById() {
        return { status: "running" };
      },
      async markTaskRunning() {
        calls.push(["markTaskRunning"]);
      },
      async recordCheckpoint(taskId, input) {
        calls.push(["recordCheckpoint", taskId, input.seedPayload.autoExecution.pipelineJobId, input.seedPayload.autoExecution.pipelineStatus]);
      },
      async markTaskFailed() {
        calls.push(["markTaskFailed"]);
      },
    },
    buildDirectorSeedPayload(_request, _novelId, extra) {
      return extra ?? {};
    },
  });

  await runtime.runFromReady({
    taskId: "task-auto-exec",
    novelId: "novel-1",
    request: buildRequest(),
    existingState: {
      enabled: true,
      firstChapterId: "chapter-1",
      startOrder: 1,
      endOrder: 2,
      totalChapterCount: 2,
      pipelineJobId: "job-stale",
      pipelineStatus: "queued",
    },
    existingPipelineJobId: "job-stale",
  });

  assert.deepEqual(calls, [
    ["bootstrapTask", "job-stale", "running"],
    ["getPipelineJobById", "job-stale"],
    ["findActivePipelineJobForRange", "novel-1", 1, 1, null],
    ["bootstrapTask", "job-active", "running"],
    ["getPipelineJobById", "job-active"],
    ["recordCheckpoint", "task-auto-exec", "job-active", "succeeded"],
  ]);
});

test("runFromReady records a normal checkpoint when pipeline completes with quality notices", async () => {
  const calls = [];
  const runtime = new NovelDirectorAutoExecutionRuntime({
    novelContextService: {
      async listChapters() {
        return [
          withExecutionDetail({ id: "chapter-1", order: 1, generationState: "planned" }),
          withExecutionDetail({ id: "chapter-2", order: 2, generationState: "planned" }),
        ];
      },
    },
    novelService: {
      async startPipelineJob() {
        calls.push(["startPipelineJob"]);
        return { id: "job-quality", status: "queued" };
      },
      async findActivePipelineJobForRange() {
        return null;
      },
      async getPipelineJobById(jobId) {
        calls.push(["getPipelineJobById", jobId]);
        return {
          id: "job-quality",
          status: "succeeded",
          progress: 1,
          currentStage: null,
          currentItemLabel: null,
          noticeSummary: "以下章节未达到质量阈值：第 1 章",
          error: null,
        };
      },
      async cancelPipelineJob() {
        calls.push(["cancelPipelineJob"]);
      },
    },
    workflowService: {
      async bootstrapTask(input) {
        calls.push(["bootstrapTask", input.seedPayload.autoExecution.pipelineStatus]);
      },
      async getTaskById() {
        return { status: "running" };
      },
      async markTaskRunning() {
        calls.push(["markTaskRunning"]);
      },
      async recordCheckpoint(taskId, input) {
        calls.push([
          "recordCheckpoint",
          taskId,
          input.checkpointType,
          input.checkpointSummary,
          input.seedPayload.autoExecution.pipelineStatus,
        ]);
      },
      async markTaskFailed() {
        calls.push(["markTaskFailed"]);
      },
    },
    buildDirectorSeedPayload(_request, _novelId, extra) {
      return extra ?? {};
    },
  });

  await runtime.runFromReady({
    taskId: "task-auto-exec",
    novelId: "novel-1",
    request: buildRequest(),
    existingState: {
      enabled: true,
      firstChapterId: "chapter-1",
      startOrder: 1,
      endOrder: 2,
      totalChapterCount: 2,
      pipelineJobId: null,
      pipelineStatus: null,
    },
  });

  assert.equal(calls.length, 7);
  assert.deepEqual(calls[0], ["bootstrapTask", "queued"]);
  assert.deepEqual(calls[1], ["markTaskRunning"]);
  assert.deepEqual(calls[2], ["startPipelineJob"]);
  assert.deepEqual(calls[3], ["bootstrapTask", "queued"]);
  assert.deepEqual(calls[4], ["getPipelineJobById", "job-quality"]);
  assert.equal(calls[5][0], "recordCheckpoint");
  assert.equal(calls[5][1], "task-auto-exec");
  assert.equal(calls[5][2], "chapter_batch_ready");
  assert.ok(String(calls[5][3]).length > 0);
  assert.equal(calls[5][4], "succeeded");
  assert.deepEqual(calls[6], ["bootstrapTask", "succeeded"]);
});

test("runFromReady notifies and continues low-risk quality repair in AI-driver execution", async () => {
  const calls = [];
  let phase = "quality_notice";
  const runtime = new NovelDirectorAutoExecutionRuntime({
    novelContextService: {
      async listChapters() {
        if (phase === "completed") {
          return [
            { id: "chapter-1", order: 1, generationState: "repaired", chapterStatus: "completed", content: "正文1" },
            { id: "chapter-2", order: 2, generationState: "approved", chapterStatus: "completed", content: "正文2" },
          ];
        }
        return phase === "quality_notice"
          ? [
              withExecutionDetail({ id: "chapter-1", order: 1, generationState: "planned", chapterStatus: "unplanned", content: "" }),
              withExecutionDetail({ id: "chapter-2", order: 2, generationState: "planned", chapterStatus: "unplanned", content: "" }),
            ]
          : [
              { id: "chapter-1", order: 1, generationState: "repaired", chapterStatus: "completed", content: "正文1" },
              withExecutionDetail({ id: "chapter-2", order: 2, generationState: "planned", chapterStatus: "unplanned", content: "" }),
            ];
      },
    },
    novelService: {
      async startPipelineJob(_novelId, options) {
        calls.push(["startPipelineJob", options.startOrder, options.endOrder, options.maxRetries, options.autoRepair]);
        return calls.filter((call) => call[0] === "startPipelineJob").length === 1
          ? { id: "job-low-risk", status: "queued" }
          : { id: "job-followup", status: "queued" };
      },
      async findActivePipelineJobForRange() {
        return null;
      },
      async getPipelineJobById(jobId) {
        calls.push(["getPipelineJobById", jobId]);
        if (jobId === "job-followup") {
          phase = "completed";
          return {
            id: "job-followup",
            status: "succeeded",
            progress: 1,
            currentStage: null,
            currentItemLabel: null,
            noticeSummary: null,
            error: null,
          };
        }
        phase = "after_quality_notice";
        return {
          id: "job-low-risk",
          status: "succeeded",
          progress: 1,
          currentStage: null,
          currentItemLabel: null,
          payload: JSON.stringify({
            repairMode: "light_repair",
            qualityAlertDetails: ["第 1 章局部修复完成"],
          }),
          noticeCode: "PIPELINE_QUALITY_REVIEW",
          noticeSummary: "Some chapters finished below the configured quality threshold: 第 1 章局部修复完成",
          error: null,
        };
      },
      async cancelPipelineJob() {
        calls.push(["cancelPipelineJob"]);
      },
    },
    workflowService: {
      async bootstrapTask(input) {
        calls.push(["bootstrapTask", input.seedPayload.autoExecution.qualityRepairRisk?.riskLevel ?? null]);
      },
      async getTaskById() {
        return { status: "running" };
      },
      async markTaskRunning() {
        calls.push(["markTaskRunning"]);
      },
      async recordCheckpoint(taskId, input) {
        calls.push([
          "recordCheckpoint",
          taskId,
          input.checkpointType,
          input.seedPayload.autoExecution?.qualityRepairRisk,
          input.seedPayload.autoExecution.remainingChapterCount,
        ]);
      },
      async markTaskFailed() {
        calls.push(["markTaskFailed"]);
      },
    },
    buildDirectorSeedPayload(_request, _novelId, extra) {
      return extra ?? {};
    },
    async recordAutoApproval(input) {
      calls.push(["recordAutoApproval", input.checkpointType, input.qualityRepairRisk.riskLevel, input.checkpointSummary]);
    },
  });

  await runtime.runFromReady({
    taskId: "task-auto-exec",
    novelId: "novel-1",
    request: buildRequest(),
    existingState: {
      enabled: true,
      mode: "chapter_range",
      firstChapterId: "chapter-1",
      startOrder: 1,
      endOrder: 2,
      totalChapterCount: 2,
      pipelineJobId: null,
      pipelineStatus: null,
    },
  });

  assert.ok(calls.some((call) => call[0] === "recordAutoApproval" && call[1] === "chapter_batch_ready" && call[2] === "low"));
  assert.ok(calls.some((call) => call[0] === "recordAutoApproval" && /quality threshold/.test(String(call[3]))));
  assert.deepEqual(calls.filter((call) => call[0] === "startPipelineJob").map((call) => call.slice(1)), [
    [1, 1, 1, true],
    [2, 2, 1, true],
  ]);
  assert.equal(calls.some((call) => call[0] === "recordCheckpoint" && call[2] === "chapter_batch_ready"), false);
  assert.ok(calls.some((call) => call[0] === "recordCheckpoint" && call[2] === "workflow_completed"));
});

test("runFromReady notifies final low-risk quality repair without pausing AI-driver execution", async () => {
  const calls = [];
  const runtime = new NovelDirectorAutoExecutionRuntime({
    novelContextService: {
      async listChapters() {
        return [
          { id: "chapter-1", order: 1, generationState: "repaired", chapterStatus: "completed", content: "正文1" },
        ];
      },
    },
    novelService: {
      async startPipelineJob(_novelId, options) {
        calls.push(["startPipelineJob", options.startOrder, options.endOrder]);
        return { id: "job-final-low-risk", status: "queued" };
      },
      async findActivePipelineJobForRange() {
        return null;
      },
      async getPipelineJobById(jobId) {
        calls.push(["getPipelineJobById", jobId]);
        return {
          id: "job-final-low-risk",
          status: "succeeded",
          progress: 1,
          currentStage: null,
          currentItemLabel: null,
          payload: JSON.stringify({
            repairMode: "light_repair",
            qualityAlertDetails: ["第 1 章自动修复后仍低于质量阈值"],
          }),
          noticeCode: "PIPELINE_QUALITY_REVIEW",
          noticeSummary: "Some chapters finished below the configured quality threshold: 第 1 章自动修复后仍低于质量阈值",
          error: null,
        };
      },
      async cancelPipelineJob() {
        calls.push(["cancelPipelineJob"]);
      },
    },
    workflowService: {
      async bootstrapTask(input) {
        calls.push(["bootstrapTask", input.seedPayload.autoExecution?.remainingChapterCount ?? null]);
      },
      async getTaskById() {
        return { status: "running" };
      },
      async markTaskRunning() {
        calls.push(["markTaskRunning"]);
      },
      async recordCheckpoint(taskId, input) {
        calls.push(["recordCheckpoint", taskId, input.checkpointType]);
      },
      async markTaskFailed() {
        calls.push(["markTaskFailed"]);
      },
    },
    buildDirectorSeedPayload(_request, _novelId, extra) {
      return extra ?? {};
    },
    async recordAutoApproval(input) {
      calls.push(["recordAutoApproval", input.checkpointType, input.qualityRepairRisk.riskLevel, input.checkpointSummary]);
    },
  });

  await runtime.runFromReady({
    taskId: "task-auto-exec",
    novelId: "novel-1",
    request: buildRequest(),
    existingState: {
      enabled: true,
      mode: "chapter_range",
      firstChapterId: "chapter-1",
      startOrder: 1,
      endOrder: 1,
      totalChapterCount: 1,
      pipelineJobId: "job-final-low-risk",
      pipelineStatus: "queued",
    },
    existingPipelineJobId: "job-final-low-risk",
  });

  assert.ok(calls.some((call) => call[0] === "recordAutoApproval" && call[1] === "chapter_batch_ready" && call[2] === "low"));
  assert.equal(calls.some((call) => call[0] === "recordCheckpoint" && call[2] === "chapter_batch_ready"), false);
  assert.ok(calls.some((call) => call[0] === "recordCheckpoint" && call[2] === "workflow_completed"));
});

test("runFromReady honors approval selection for low-risk quality repair outside AI-driver execution", async () => {
  const calls = [];
  let phase = "initial";
  const runtime = new NovelDirectorAutoExecutionRuntime({
    novelContextService: {
      async listChapters() {
        if (phase === "initial") {
          return [
            withExecutionDetail({ id: "chapter-1", order: 1, generationState: "planned", chapterStatus: "unplanned", content: "" }),
            withExecutionDetail({ id: "chapter-2", order: 2, generationState: "planned", chapterStatus: "unplanned", content: "" }),
          ];
        }
        if (phase !== "completed") {
          return [
            { id: "chapter-1", order: 1, generationState: "repaired", chapterStatus: "completed", content: "正文1" },
            withExecutionDetail({ id: "chapter-2", order: 2, generationState: "planned", chapterStatus: "unplanned", content: "" }),
          ];
        }
        return [
          { id: "chapter-1", order: 1, generationState: "repaired", chapterStatus: "completed", content: "正文1" },
          { id: "chapter-2", order: 2, generationState: "approved", chapterStatus: "completed", content: "正文2" },
        ];
      },
    },
    novelService: {
      async startPipelineJob(_novelId, options) {
        calls.push(["startPipelineJob", options.startOrder, options.endOrder]);
        return calls.filter((call) => call[0] === "startPipelineJob").length === 1
          ? { id: "job-low-risk", status: "queued" }
          : { id: "job-followup", status: "queued" };
      },
      async findActivePipelineJobForRange() {
        return null;
      },
      async getPipelineJobById(jobId) {
        calls.push(["getPipelineJobById", jobId]);
        if (jobId === "job-low-risk") {
          phase = "repair_done";
          return {
            id: jobId,
            status: "succeeded",
            progress: 1,
            currentStage: null,
            currentItemLabel: null,
            payload: JSON.stringify({
              repairMode: "light_repair",
              qualityAlertDetails: ["第 1 章局部修复完成"],
            }),
            noticeCode: "PIPELINE_QUALITY_REVIEW",
            noticeSummary: "Some chapters finished below the configured quality threshold: 第 1 章局部修复完成",
            error: null,
          };
        }
        phase = "completed";
        return {
          id: jobId,
          status: "succeeded",
          progress: 1,
          currentStage: null,
          currentItemLabel: null,
          noticeSummary: null,
          error: null,
        };
      },
      async cancelPipelineJob() {
        calls.push(["cancelPipelineJob"]);
      },
    },
    workflowService: {
      async bootstrapTask(input) {
        calls.push(["bootstrapTask", input.seedPayload.autoExecution?.pipelineJobId ?? null]);
      },
      async getTaskById() {
        return { status: "running" };
      },
      async markTaskRunning(_taskId, input) {
        calls.push(["markTaskRunning", input.clearCheckpoint ?? false]);
      },
      async recordCheckpoint(taskId, input) {
        calls.push(["recordCheckpoint", taskId, input.checkpointType]);
      },
      async markTaskFailed() {
        calls.push(["markTaskFailed"]);
      },
    },
    buildDirectorSeedPayload(_request, _novelId, extra) {
      return extra ?? {};
    },
    async shouldAutoContinueQualityRepair(input) {
      calls.push(["autoApprovalGuard", input.qualityRepairRisk.riskLevel, input.remainingChapterCount]);
      return true;
    },
    async recordAutoApproval(input) {
      calls.push(["recordAutoApproval", input.checkpointType, input.qualityRepairRisk.riskLevel]);
    },
  });

  await runtime.runFromReady({
    taskId: "task-auto-exec",
    novelId: "novel-1",
    request: buildRequest({
      runMode: "auto_to_ready",
      autoApproval: {
        enabled: true,
        approvalPointCodes: ["low_risk_quality_repair_continue"],
      },
    }),
    existingState: {
      enabled: true,
      mode: "chapter_range",
      firstChapterId: "chapter-1",
      startOrder: 1,
      endOrder: 2,
      totalChapterCount: 2,
      pipelineJobId: null,
      pipelineStatus: null,
    },
  });

  assert.ok(calls.some((call) => call[0] === "autoApprovalGuard" && call[1] === "low"));
  assert.ok(calls.some((call) => call[0] === "recordAutoApproval" && call[1] === "chapter_batch_ready"));
  assert.deepEqual(calls.filter((call) => call[0] === "startPipelineJob").map((call) => call.slice(1)), [
    [1, 1],
    [2, 2],
  ]);
  assert.equal(calls.some((call) => call[0] === "recordCheckpoint" && call[2] === "chapter_batch_ready"), false);
  assert.ok(calls.some((call) => call[0] === "recordCheckpoint" && call[2] === "workflow_completed"));
});

test("runFromReady notifies and continues replan notices in AI-driver execution", async () => {
  const calls = [];
  let phase = "initial";
  const runtime = new NovelDirectorAutoExecutionRuntime({
    novelContextService: {
      async listChapters() {
        if (phase === "initial") {
          return [
            withExecutionDetail({ id: "chapter-1", order: 1, generationState: "planned", chapterStatus: "unplanned", content: "" }),
            withExecutionDetail({ id: "chapter-2", order: 2, generationState: "planned", chapterStatus: "unplanned", content: "" }),
          ];
        }
        if (phase === "completed") {
          return [
            { id: "chapter-1", order: 1, generationState: "repaired", chapterStatus: "completed", content: "正文1" },
            { id: "chapter-2", order: 2, generationState: "approved", chapterStatus: "completed", content: "正文2" },
          ];
        }
        return [
          { id: "chapter-1", order: 1, generationState: "repaired", chapterStatus: "completed", content: "正文1" },
          withExecutionDetail({ id: "chapter-2", order: 2, generationState: "planned", chapterStatus: "unplanned", content: "" }),
        ];
      },
    },
    novelService: {
      async startPipelineJob(_novelId, options) {
        calls.push(["startPipelineJob", options.startOrder, options.endOrder]);
        return calls.filter((call) => call[0] === "startPipelineJob").length === 1
          ? { id: "job-replan", status: "queued" }
          : { id: "job-after-replan", status: "queued" };
      },
      async findActivePipelineJobForRange() {
        return null;
      },
      async getPipelineJobById(jobId) {
        calls.push(["getPipelineJobById", jobId]);
        if (jobId === "job-after-replan") {
          phase = "completed";
          return {
            id: jobId,
            status: "succeeded",
            progress: 1,
            currentStage: null,
            currentItemLabel: null,
            noticeSummary: null,
            error: null,
          };
        }
        phase = "after_replan_notice";
        return {
          id: "job-replan",
          status: "succeeded",
          progress: 1,
          currentStage: null,
          currentItemLabel: null,
          payload: JSON.stringify({
            repairMode: "heavy_repair",
            replanAlertDetails: ["第 2 章需要重规划"],
          }),
          noticeCode: "PIPELINE_REPLAN_REQUIRED",
          noticeSummary: "State-driven replan is required before continuing: 第 2 章需要重规划",
          error: null,
        };
      },
      async cancelPipelineJob() {
        calls.push(["cancelPipelineJob"]);
      },
    },
    workflowService: {
      async bootstrapTask(input) {
        calls.push(["bootstrapTask", input.seedPayload.autoExecution?.qualityRepairRisk?.riskLevel ?? null]);
      },
      async getTaskById() {
        return { status: "running" };
      },
      async markTaskRunning() {
        calls.push(["markTaskRunning"]);
      },
      async recordCheckpoint(taskId, input) {
        calls.push(["recordCheckpoint", taskId, input.checkpointType, input.seedPayload.autoExecution.qualityRepairRisk]);
      },
      async markTaskFailed() {
        calls.push(["markTaskFailed"]);
      },
    },
    buildDirectorSeedPayload(_request, _novelId, extra) {
      return extra ?? {};
    },
    async recordAutoApproval(input) {
      calls.push(["recordAutoApproval", input.checkpointType, input.qualityRepairRisk.riskLevel, input.checkpointSummary]);
    },
  });

  await runtime.runFromReady({
    taskId: "task-auto-exec",
    novelId: "novel-1",
    request: buildRequest(),
    existingState: {
      enabled: true,
      mode: "chapter_range",
      firstChapterId: "chapter-1",
      startOrder: 1,
      endOrder: 2,
      totalChapterCount: 2,
      pipelineJobId: null,
      pipelineStatus: null,
    },
  });

  assert.equal(calls.some((call) => call[0] === "replanNovel"), false);
  assert.ok(calls.some((call) => call[0] === "recordAutoApproval" && call[1] === "replan_required" && call[2] === "replan"));
  assert.deepEqual(calls.filter((call) => call[0] === "startPipelineJob").map((call) => call.slice(1)), [
    [1, 1],
    [2, 2],
  ]);
  assert.equal(calls.some((call) => call[0] === "recordCheckpoint" && call[2] === "replan_required"), false);
  assert.ok(calls.some((call) => call[0] === "recordCheckpoint" && call[2] === "workflow_completed"));
});

test("runFromReady records replan_required outside AI-driver execution when pipeline completes with replan notice", async () => {
  const calls = [];
  const runtime = new NovelDirectorAutoExecutionRuntime({
    novelContextService: {
      async listChapters() {
        return [
          withExecutionDetail({ id: "chapter-1", order: 1, generationState: "planned" }),
          withExecutionDetail({ id: "chapter-2", order: 2, generationState: "planned" }),
        ];
      },
    },
    novelService: {
      async startPipelineJob() {
        calls.push(["startPipelineJob"]);
        return { id: "job-replan", status: "queued" };
      },
      async findActivePipelineJobForRange() {
        return null;
      },
      async getPipelineJobById(jobId) {
        calls.push(["getPipelineJobById", jobId]);
        return {
          id: "job-replan",
          status: "succeeded",
          progress: 1,
          currentStage: null,
          currentItemLabel: null,
          noticeCode: "PIPELINE_REPLAN_REQUIRED",
          noticeSummary: "State-driven replan is required before continuing: 第2章需要重规划",
          error: null,
        };
      },
      async cancelPipelineJob() {
        calls.push(["cancelPipelineJob"]);
      },
    },
    workflowService: {
      async bootstrapTask(input) {
        calls.push(["bootstrapTask", input.seedPayload.autoExecution.pipelineStatus]);
      },
      async getTaskById() {
        return { status: "running" };
      },
      async markTaskRunning() {
        calls.push(["markTaskRunning"]);
      },
      async recordCheckpoint(taskId, input) {
        calls.push([
          "recordCheckpoint",
          taskId,
          input.checkpointType,
          input.itemLabel,
          input.checkpointSummary,
        ]);
      },
      async markTaskFailed() {
        calls.push(["markTaskFailed"]);
      },
    },
    buildDirectorSeedPayload(_request, _novelId, extra) {
      return extra ?? {};
    },
  });

  await runtime.runFromReady({
    taskId: "task-auto-exec",
    novelId: "novel-1",
    request: buildRequest({ runMode: "auto_to_ready" }),
    existingState: {
      enabled: true,
      firstChapterId: "chapter-1",
      startOrder: 1,
      endOrder: 2,
      totalChapterCount: 2,
      pipelineJobId: null,
      pipelineStatus: null,
    },
  });

  assert.equal(calls[5][0], "recordCheckpoint");
  assert.equal(calls[5][2], "replan_required");
  assert.match(String(calls[5][3]), /等待处理重规划建议/);
  assert.match(String(calls[5][4]), /replan/i);
});

test("runFromReady uses the latest auto-execution review toggles instead of stale saved state when starting a new batch", async () => {
  const calls = [];
  let pipelineCompleted = false;
  const runtime = new NovelDirectorAutoExecutionRuntime({
    novelContextService: {
      async listChapters() {
        return Array.from({ length: 10 }, (_, index) => withExecutionDetail({
          id: `chapter-${index + 1}`,
          order: index + 1,
          generationState: pipelineCompleted ? "approved" : "planned",
        }));
      },
    },
    novelService: {
      async startPipelineJob(_novelId, options) {
        calls.push(["startPipelineJob", options.startOrder, options.endOrder, options.autoReview, options.autoRepair]);
        return { id: "job-no-review", status: "queued" };
      },
      async findActivePipelineJobForRange() {
        return null;
      },
      async getPipelineJobById(jobId) {
        calls.push(["getPipelineJobById", jobId]);
        pipelineCompleted = true;
        return {
          id: jobId,
          status: "succeeded",
          progress: 1,
          currentStage: null,
          currentItemLabel: null,
          noticeSummary: null,
          error: null,
        };
      },
      async cancelPipelineJob() {
        calls.push(["cancelPipelineJob"]);
      },
    },
    workflowService: {
      async bootstrapTask(input) {
        calls.push([
          "bootstrapTask",
          input.seedPayload.autoExecution?.autoReview ?? null,
          input.seedPayload.autoExecution?.autoRepair ?? null,
        ]);
      },
      async getTaskById() {
        return { status: "running" };
      },
      async markTaskRunning() {
        calls.push(["markTaskRunning"]);
      },
      async recordCheckpoint(taskId, input) {
        calls.push([
          "recordCheckpoint",
          taskId,
          input.seedPayload.autoExecution?.autoReview ?? null,
          input.seedPayload.autoExecution?.autoRepair ?? null,
        ]);
      },
      async markTaskFailed() {
        calls.push(["markTaskFailed"]);
      },
    },
    buildDirectorSeedPayload(_request, _novelId, extra) {
      return extra ?? {};
    },
  });

  await runtime.runFromReady({
    taskId: "task-auto-exec",
    novelId: "novel-1",
    request: buildRequest({
      autoExecutionPlan: {
        mode: "front10",
        autoReview: false,
        autoRepair: false,
      },
    }),
    existingState: {
      enabled: true,
      mode: "front10",
      startOrder: 1,
      endOrder: 2,
      totalChapterCount: 2,
      autoReview: true,
      autoRepair: true,
      pipelineJobId: "old-job",
      pipelineStatus: "succeeded",
    },
  });

  assert.deepEqual(calls[0], ["bootstrapTask", false, false]);
  assert.deepEqual(calls[1], ["markTaskRunning"]);
  assert.deepEqual(calls[2], ["startPipelineJob", 1, 1, false, false]);
  assert.deepEqual(calls[3], ["bootstrapTask", false, false]);
  assert.deepEqual(calls[4], ["getPipelineJobById", "job-no-review"]);
  assert.deepEqual(calls[5], ["recordCheckpoint", "task-auto-exec", false, false]);
});

test("runFromReady skips the current review-blocked chapter when continuing explicit auto execution", async () => {
  const calls = [];
  const completedOrders = new Set();
  const jobOrderById = new Map();
  const runtime = new NovelDirectorAutoExecutionRuntime({
    novelContextService: {
      async listChapters() {
        return [
          { id: "chapter-1", order: 1, generationState: "reviewed", chapterStatus: "needs_repair" },
          withExecutionDetail({ id: "chapter-2", order: 2, generationState: completedOrders.has(2) ? "approved" : "planned" }),
          withExecutionDetail({ id: "chapter-3", order: 3, generationState: completedOrders.has(3) ? "approved" : "planned" }),
        ];
      },
    },
    novelService: {
      async startPipelineJob(_novelId, options) {
        calls.push([
          "startPipelineJob",
          options.startOrder,
          options.endOrder,
        ]);
        const jobId = `job-skip-review-${options.startOrder}`;
        jobOrderById.set(jobId, options.startOrder);
        return { id: jobId, status: "queued" };
      },
      async findActivePipelineJobForRange(_novelId, startOrder, endOrder, preferredJobId) {
        calls.push(["findActivePipelineJobForRange", startOrder, endOrder, preferredJobId]);
        return null;
      },
      async getPipelineJobById(jobId) {
        calls.push(["getPipelineJobById", jobId]);
        const order = jobOrderById.get(jobId);
        if (typeof order === "number") {
          completedOrders.add(order);
        }
        return {
          id: jobId,
          status: "succeeded",
          progress: 1,
          currentStage: null,
          currentItemLabel: null,
          noticeSummary: null,
          error: null,
        };
      },
      async cancelPipelineJob() {
        calls.push(["cancelPipelineJob"]);
      },
    },
    workflowService: {
      async bootstrapTask(input) {
        calls.push([
          "bootstrapTask",
          input.seedPayload.autoExecution?.nextChapterOrder ?? null,
          input.seedPayload.autoExecution?.skippedChapterOrders ?? [],
        ]);
      },
      async getTaskById() {
        return { status: "running" };
      },
      async markTaskRunning() {
        calls.push(["markTaskRunning"]);
      },
      async recordCheckpoint(taskId, input) {
        calls.push([
          "recordCheckpoint",
          taskId,
          input.seedPayload.autoExecution?.skippedChapterOrders ?? [],
        ]);
      },
      async markTaskFailed() {
        calls.push(["markTaskFailed"]);
      },
    },
    buildDirectorSeedPayload(_request, _novelId, extra) {
      return extra ?? {};
    },
  });

  await runtime.runFromReady({
    taskId: "task-auto-exec",
    novelId: "novel-1",
    request: buildRequest(),
    existingState: {
      enabled: true,
      mode: "front10",
      firstChapterId: "chapter-1",
      startOrder: 1,
      endOrder: 3,
      totalChapterCount: 3,
      nextChapterId: "chapter-1",
      nextChapterOrder: 1,
      pipelineJobId: "job-failed",
      pipelineStatus: "failed",
    },
    previousFailureMessage: "Chapter generation is blocked until review is resolved. 4 pending state proposal(s)",
    allowSkipReviewBlockedChapter: true,
  });

  assert.deepEqual(calls[0], ["bootstrapTask", 2, [1]]);
  assert.deepEqual(calls[1], ["findActivePipelineJobForRange", 2, 2, null]);
  assert.deepEqual(calls.filter((call) => call[0] === "startPipelineJob").map((call) => call.slice(1)), [
    [2, 2],
    [3, 3],
  ]);
  assert.deepEqual(calls.filter((call) => call[0] === "getPipelineJobById").map((call) => call[1]), [
    "job-skip-review-2",
    "job-skip-review-3",
  ]);
  assert.deepEqual(calls.find((call) => call[0] === "recordCheckpoint"), ["recordCheckpoint", "task-auto-exec", [1]]);
});

test("prepareRequestedAutoExecution resolves the selected volume range instead of falling back to front10", async () => {
  const runtime = new NovelDirectorAutoExecutionRuntime({
    novelContextService: {
      async listChapters() {
        return [
          { id: "chapter-1", order: 1, generationState: "approved" },
          { id: "chapter-2", order: 2, generationState: "approved" },
          { id: "chapter-3", order: 3, generationState: "approved" },
          { id: "chapter-4", order: 4, generationState: "approved" },
          withExecutionDetail({ id: "chapter-5", order: 5, generationState: "planned" }),
          withExecutionDetail({ id: "chapter-6", order: 6, generationState: "planned" }),
          withExecutionDetail({ id: "chapter-7", order: 7, generationState: "planned" }),
          withExecutionDetail({ id: "chapter-8", order: 8, generationState: "planned" }),
        ];
      },
    },
    novelService: {
      async startPipelineJob() {
        throw new Error("should not start a pipeline in prepareRequestedAutoExecution");
      },
      async findActivePipelineJobForRange() {
        return null;
      },
      async getPipelineJobById() {
        return null;
      },
      async cancelPipelineJob() {
        return null;
      },
    },
    volumeWorkspaceService: {
      async getVolumes() {
        return buildPreparedWorkspace();
      },
    },
    workflowService: {
      async bootstrapTask() {
        throw new Error("should not bootstrap in prepareRequestedAutoExecution");
      },
      async getTaskById() {
        return { status: "waiting_approval" };
      },
      async markTaskRunning() {
        throw new Error("should not mark running in prepareRequestedAutoExecution");
      },
      async recordCheckpoint() {
        throw new Error("should not record checkpoint in prepareRequestedAutoExecution");
      },
      async markTaskFailed() {
        throw new Error("should not mark failed in prepareRequestedAutoExecution");
      },
    },
    buildDirectorSeedPayload(_request, _novelId, extra) {
      return extra ?? {};
    },
  });

  const resolved = await runtime.prepareRequestedAutoExecution({
    novelId: "novel-1",
    request: buildRequest({
      autoExecutionPlan: {
        mode: "volume",
        volumeOrder: 2,
      },
    }),
    existingState: {
      enabled: true,
      mode: "volume",
      volumeOrder: 1,
      startOrder: 1,
      endOrder: 4,
      totalChapterCount: 4,
    },
  });

  assert.deepEqual(resolved.range, {
    startOrder: 5,
    endOrder: 8,
    totalChapterCount: 4,
    firstChapterId: "chapter-5",
  });
  assert.equal(resolved.autoExecution.volumeOrder, 2);
  assert.equal(resolved.autoExecution.scopeLabel, "第 2 卷 · 反扑卷");
  assert.deepEqual(resolved.autoExecution.remainingChapterOrders, [5, 6, 7, 8]);
});

test("prepareRequestedAutoExecution refreshes a stale volume range after chapter planning grows", async () => {
  const runtime = new NovelDirectorAutoExecutionRuntime({
    novelContextService: {
      async listChapters() {
        return [
          { id: "chapter-1", order: 1, content: "正文1", generationState: "approved" },
          { id: "chapter-2", order: 2, content: "正文2", generationState: "approved" },
          { id: "chapter-3", order: 3, content: "正文3", generationState: "approved" },
          { id: "chapter-4", order: 4, content: "正文4", generationState: "approved" },
          withExecutionDetail({ id: "chapter-5", order: 5, content: "", generationState: "planned" }),
          withExecutionDetail({ id: "chapter-6", order: 6, content: "", generationState: "planned" }),
          withExecutionDetail({ id: "chapter-7", order: 7, content: "", generationState: "planned" }),
          withExecutionDetail({ id: "chapter-8", order: 8, content: "", generationState: "planned" }),
        ];
      },
    },
    novelService: {
      async startPipelineJob() {
        throw new Error("should not start a pipeline in prepareRequestedAutoExecution");
      },
      async findActivePipelineJobForRange() {
        return null;
      },
      async getPipelineJobById() {
        return null;
      },
      async cancelPipelineJob() {
        return null;
      },
    },
    volumeWorkspaceService: {
      async getVolumes() {
        return {
          volumes: [
            buildPreparedVolume(1, "扩写卷", [1, 2, 3, 4, 5, 6, 7, 8]),
          ],
          beatSheets: [
            {
              volumeId: "volume-1",
              beats: [{ key: "volume-1-beat-1", label: "扩写推进", chapterSpanHint: "1-8" }],
            },
          ],
        };
      },
    },
    workflowService: {
      async bootstrapTask() {
        throw new Error("should not bootstrap in prepareRequestedAutoExecution");
      },
      async getTaskById() {
        return { status: "waiting_approval" };
      },
      async markTaskRunning() {
        throw new Error("should not mark running in prepareRequestedAutoExecution");
      },
      async recordCheckpoint() {
        throw new Error("should not record checkpoint in prepareRequestedAutoExecution");
      },
      async markTaskFailed() {
        throw new Error("should not mark failed in prepareRequestedAutoExecution");
      },
    },
    buildDirectorSeedPayload(_request, _novelId, extra) {
      return extra ?? {};
    },
  });

  const resolved = await runtime.prepareRequestedAutoExecution({
    novelId: "novel-1",
    request: buildRequest({
      autoExecutionPlan: {
        mode: "volume",
        volumeOrder: 1,
      },
    }),
    existingState: {
      enabled: true,
      mode: "volume",
      volumeOrder: 1,
      startOrder: 1,
      endOrder: 4,
      totalChapterCount: 4,
    },
  });

  assert.deepEqual(resolved.range, {
    startOrder: 1,
    endOrder: 8,
    totalChapterCount: 8,
    firstChapterId: "chapter-1",
  });
  assert.deepEqual(resolved.autoExecution.remainingChapterOrders, [5, 6, 7, 8]);
});

test("prepareRequestedAutoExecution reruns the earliest ungenerated chapter instead of preserving stale skips", async () => {
  const runtime = new NovelDirectorAutoExecutionRuntime({
    novelContextService: {
      async listChapters() {
        return [
          { id: "chapter-5", order: 5, content: "正文5", generationState: "approved" },
          withExecutionDetail({ id: "chapter-6", order: 6, content: "", generationState: "planned" }),
          { id: "chapter-7", order: 7, content: "正文7", generationState: "approved" },
          withExecutionDetail({ id: "chapter-8", order: 8, content: "", generationState: "planned" }),
        ];
      },
    },
    novelService: {
      async startPipelineJob() {
        throw new Error("should not start a pipeline in prepareRequestedAutoExecution");
      },
      async findActivePipelineJobForRange() {
        return null;
      },
      async getPipelineJobById() {
        return null;
      },
      async cancelPipelineJob() {
        return null;
      },
    },
    workflowService: {
      async bootstrapTask() {
        throw new Error("should not bootstrap in prepareRequestedAutoExecution");
      },
      async getTaskById() {
        return { status: "waiting_approval" };
      },
      async markTaskRunning() {
        throw new Error("should not mark running in prepareRequestedAutoExecution");
      },
      async recordCheckpoint() {
        throw new Error("should not record checkpoint in prepareRequestedAutoExecution");
      },
      async markTaskFailed() {
        throw new Error("should not mark failed in prepareRequestedAutoExecution");
      },
    },
    buildDirectorSeedPayload(_request, _novelId, extra) {
      return extra ?? {};
    },
  });

  const resolved = await runtime.prepareRequestedAutoExecution({
    novelId: "novel-1",
    request: buildRequest({
      autoExecutionPlan: {
        mode: "chapter_range",
        startOrder: 5,
        endOrder: 8,
      },
    }),
    existingState: {
      enabled: true,
      mode: "chapter_range",
      startOrder: 5,
      endOrder: 8,
      totalChapterCount: 4,
      nextChapterId: "chapter-7",
      nextChapterOrder: 7,
      remainingChapterIds: ["chapter-7", "chapter-8"],
      remainingChapterOrders: [7, 8],
      skippedChapterIds: ["chapter-6"],
      skippedChapterOrders: [6],
    },
  });

  assert.deepEqual(resolved.autoExecution.skippedChapterOrders, []);
  assert.deepEqual(resolved.autoExecution.remainingChapterOrders, [6, 8]);
  assert.equal(resolved.autoExecution.nextChapterOrder, 6);
});

test("prepareRequestedAutoExecution does not let stale skips bypass execution detail checks", async () => {
  const runtime = new NovelDirectorAutoExecutionRuntime({
    novelContextService: {
      async listChapters() {
        return [
          { id: "chapter-5", order: 5, content: "正文5", generationState: "approved" },
          { id: "chapter-6", order: 6, content: "", generationState: "planned" },
          { id: "chapter-7", order: 7, content: "正文7", generationState: "approved" },
        ];
      },
    },
    novelService: {
      async startPipelineJob() {
        throw new Error("should not start a pipeline in prepareRequestedAutoExecution");
      },
      async findActivePipelineJobForRange() {
        return null;
      },
      async getPipelineJobById() {
        return null;
      },
      async cancelPipelineJob() {
        return null;
      },
    },
    workflowService: {
      async bootstrapTask() {
        throw new Error("should not bootstrap in prepareRequestedAutoExecution");
      },
      async getTaskById() {
        return { status: "waiting_approval" };
      },
      async markTaskRunning() {
        throw new Error("should not mark running in prepareRequestedAutoExecution");
      },
      async recordCheckpoint() {
        throw new Error("should not record checkpoint in prepareRequestedAutoExecution");
      },
      async markTaskFailed() {
        throw new Error("should not mark failed in prepareRequestedAutoExecution");
      },
    },
    buildDirectorSeedPayload(_request, _novelId, extra) {
      return extra ?? {};
    },
  });

  await assert.rejects(
    runtime.prepareRequestedAutoExecution({
      novelId: "novel-1",
      request: buildRequest({
        autoExecutionPlan: {
          mode: "chapter_range",
          startOrder: 5,
          endOrder: 7,
        },
      }),
      existingState: {
        enabled: true,
        mode: "chapter_range",
        startOrder: 5,
        endOrder: 7,
        totalChapterCount: 3,
        skippedChapterIds: ["chapter-6"],
        skippedChapterOrders: [6],
      },
    }),
    /第 6 章.*章节细化/,
  );
});

test("prepareRequestedAutoExecution rejects skipping to a later volume while earlier volumes are unfinished", async () => {
  const runtime = new NovelDirectorAutoExecutionRuntime({
    novelContextService: {
      async listChapters() {
        return [
          withExecutionDetail({ id: "chapter-1", order: 1, generationState: "planned" }),
          withExecutionDetail({ id: "chapter-2", order: 2, generationState: "planned" }),
          withExecutionDetail({ id: "chapter-3", order: 3, generationState: "planned" }),
          withExecutionDetail({ id: "chapter-4", order: 4, generationState: "planned" }),
          withExecutionDetail({ id: "chapter-5", order: 5, generationState: "planned" }),
          withExecutionDetail({ id: "chapter-6", order: 6, generationState: "planned" }),
          withExecutionDetail({ id: "chapter-7", order: 7, generationState: "planned" }),
          withExecutionDetail({ id: "chapter-8", order: 8, generationState: "planned" }),
        ];
      },
    },
    novelService: {
      async startPipelineJob() {
        throw new Error("should not start a pipeline in prepareRequestedAutoExecution");
      },
      async findActivePipelineJobForRange() {
        return null;
      },
      async getPipelineJobById() {
        return null;
      },
      async cancelPipelineJob() {
        return null;
      },
    },
    volumeWorkspaceService: {
      async getVolumes() {
        return buildPreparedWorkspace();
      },
    },
    workflowService: {
      async bootstrapTask() {
        throw new Error("should not bootstrap in prepareRequestedAutoExecution");
      },
      async getTaskById() {
        return { status: "waiting_approval" };
      },
      async markTaskRunning() {
        throw new Error("should not mark running in prepareRequestedAutoExecution");
      },
      async recordCheckpoint() {
        throw new Error("should not record checkpoint in prepareRequestedAutoExecution");
      },
      async markTaskFailed() {
        throw new Error("should not mark failed in prepareRequestedAutoExecution");
      },
    },
    buildDirectorSeedPayload(_request, _novelId, extra) {
      return extra ?? {};
    },
  });

  await assert.rejects(
    runtime.prepareRequestedAutoExecution({
      novelId: "novel-1",
      request: buildRequest({
        autoExecutionPlan: {
          mode: "volume",
          volumeOrder: 2,
        },
      }),
    }),
    /开局卷仍有未完成章节（第 1 章起），不能直接跳到第 2 卷/,
  );
});

test("prepareRequestedAutoExecution rejects chapter ranges with incomplete execution detail", async () => {
  const runtime = new NovelDirectorAutoExecutionRuntime({
    novelContextService: {
      async listChapters() {
        return [
          {
            id: "chapter-1",
            order: 1,
            generationState: "planned",
            content: "",
            taskSheet: "task-1",
            sceneCards: JSON.stringify({
              targetWordCount: 2800,
              lengthBudget: {
                targetWordCount: 2800,
                softMinWordCount: 2380,
                softMaxWordCount: 3220,
                hardMaxWordCount: 3500,
              },
              scenes: [
                {
                  key: "s1",
                  title: "场景一",
                  purpose: "推进本章目标",
                  mustAdvance: ["主线"],
                  mustPreserve: ["设定"],
                  entryState: "进入",
                  exitState: "退出",
                  forbiddenExpansion: [],
                  targetWordCount: 900,
                },
                {
                  key: "s2",
                  title: "场景二",
                  purpose: "升级冲突",
                  mustAdvance: ["冲突"],
                  mustPreserve: ["边界"],
                  entryState: "进入",
                  exitState: "退出",
                  forbiddenExpansion: [],
                  targetWordCount: 900,
                },
                {
                  key: "s3",
                  title: "场景三",
                  purpose: "章末推进",
                  mustAdvance: ["钩子"],
                  mustPreserve: ["人物"],
                  entryState: "进入",
                  exitState: "退出",
                  forbiddenExpansion: [],
                  targetWordCount: 1000,
                },
              ],
            }),
            purpose: "完整章节目标",
            conflictLevel: 5,
            revealLevel: 3,
            targetWordCount: 2800,
            mustAvoid: "不要展开支线",
          },
          {
            id: "chapter-2",
            order: 2,
            generationState: "planned",
            content: "",
            taskSheet: "fallback task only",
            sceneCards: JSON.stringify([{ key: "too-short", title: "场景不足" }]),
            purpose: "",
            conflictLevel: null,
            revealLevel: null,
            targetWordCount: null,
            mustAvoid: "",
          },
        ];
      },
    },
    novelService: {
      async startPipelineJob() {
        throw new Error("should not start a pipeline in prepareRequestedAutoExecution");
      },
      async findActivePipelineJobForRange() {
        return null;
      },
      async getPipelineJobById() {
        return null;
      },
      async cancelPipelineJob() {},
    },
    workflowService: {
      async bootstrapTask() {
        throw new Error("should not bootstrap in prepareRequestedAutoExecution");
      },
      async getTaskById() {
        return { status: "waiting_approval" };
      },
      async markTaskRunning() {
        throw new Error("should not mark running in prepareRequestedAutoExecution");
      },
      async recordCheckpoint() {
        throw new Error("should not record checkpoint in prepareRequestedAutoExecution");
      },
      async markTaskFailed() {
        throw new Error("should not mark failed in prepareRequestedAutoExecution");
      },
    },
    buildDirectorSeedPayload(_request, _novelId, extra) {
      return extra ?? {};
    },
  });

  await assert.rejects(
    runtime.prepareRequestedAutoExecution({
      taskId: "task-auto-exec",
      novelId: "novel-1",
      request: buildRequest({
        autoExecutionPlan: {
          mode: "chapter_range",
          startOrder: 1,
          endOrder: 2,
        },
      }),
      existingState: {
        enabled: true,
        mode: "chapter_range",
        startOrder: 1,
        endOrder: 2,
        totalChapterCount: 2,
      },
    }),
    /第 2 章.*章节细化/,
  );
});
