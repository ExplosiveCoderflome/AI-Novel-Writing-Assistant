const test = require("node:test");
const assert = require("node:assert/strict");

const { NovelWorkflowService } = require("../dist/services/novel/workflow/NovelWorkflowService.js");
const { prisma } = require("../dist/db/prisma.js");

test("healHistoricalAutoDirectorRecoveryFailure restores legacy restart failures back to checkpoint state", async () => {
  const originals = {
    findUnique: prisma.novelWorkflowTask.findUnique,
    update: prisma.novelWorkflowTask.update,
  };

  let currentRow = {
    id: "task_front10",
    novelId: "novel_demo",
    lane: "auto_director",
    status: "failed",
    progress: 0.93,
    currentStage: "章节执行",
    currentItemKey: "chapter_execution",
    currentItemLabel: "正在自动执行前 10 章",
    checkpointType: "front10_ready",
    checkpointSummary: "《示例》已生成第 1 卷节奏板，并准备好前 10 章细化。",
    resumeTargetJson: null,
    lastError: "服务重启后恢复失败：当前导演产物已经完整，无需继续自动导演。",
    finishedAt: new Date("2026-04-03T11:55:37.000Z"),
    heartbeatAt: new Date("2026-04-03T11:55:37.000Z"),
    cancelRequestedAt: null,
  };

  prisma.novelWorkflowTask.findUnique = async () => currentRow;

  prisma.novelWorkflowTask.update = async ({ data }) => {
    currentRow = {
      ...currentRow,
      status: data.status,
      progress: data.progress,
      currentStage: data.currentStage,
      currentItemKey: data.currentItemKey,
      currentItemLabel: data.currentItemLabel,
      resumeTargetJson: data.resumeTargetJson,
      lastError: data.lastError,
      finishedAt: data.finishedAt,
      heartbeatAt: data.heartbeatAt,
      cancelRequestedAt: data.cancelRequestedAt,
    };
    return currentRow;
  };

  try {
    const service = new NovelWorkflowService();
    const healed = await service.healHistoricalAutoDirectorRecoveryFailure("task_front10");
    assert.equal(healed, true);

    assert.equal(currentRow.status, "waiting_approval");
    assert.equal(currentRow.currentStage, "章节执行");
    assert.equal(currentRow.currentItemLabel, "已准备章节可进入执行");
    assert.equal(currentRow.lastError, null);
  } finally {
    prisma.novelWorkflowTask.findUnique = originals.findUnique;
    prisma.novelWorkflowTask.update = originals.update;
  }
});

test("healAutoDirectorTaskState also reconciles chapter batch checkpoints when task detail loads without a preloaded row", async () => {
  const originals = {
    findUnique: prisma.novelWorkflowTask.findUnique,
    chapterFindMany: prisma.chapter.findMany,
    update: prisma.novelWorkflowTask.update,
  };

  let currentRow = {
    id: "task_batch_ready",
    title: "示例项目",
    novelId: "novel_demo",
    lane: "auto_director",
    status: "failed",
    progress: 0.98,
    currentStage: "质量修复",
    currentItemKey: "quality_repair",
    currentItemLabel: "前 3 章自动执行已暂停",
    checkpointType: "chapter_batch_ready",
    checkpointSummary: "旧摘要",
    resumeTargetJson: null,
    seedPayloadJson: JSON.stringify({
      autoExecution: {
        enabled: true,
        firstChapterId: "chapter-1",
        startOrder: 1,
        endOrder: 3,
        totalChapterCount: 3,
        pipelineJobId: "job-3",
        pipelineStatus: "failed",
      },
    }),
    lastError: "前 10 章自动执行未能全部通过质量要求。",
    finishedAt: new Date("2026-04-04T10:00:00.000Z"),
    heartbeatAt: new Date("2026-04-04T10:00:00.000Z"),
    cancelRequestedAt: null,
    milestonesJson: null,
  };

  prisma.novelWorkflowTask.findUnique = async () => currentRow;
  prisma.chapter.findMany = async () => [
    { id: "chapter-1", order: 1, generationState: "approved" },
    { id: "chapter-2", order: 2, generationState: "reviewed" },
    { id: "chapter-3", order: 3, generationState: "approved" },
  ];
  prisma.novelWorkflowTask.update = async ({ data }) => {
    currentRow = {
      ...currentRow,
      currentStage: data.currentStage ?? currentRow.currentStage,
      currentItemKey: data.currentItemKey ?? currentRow.currentItemKey,
      currentItemLabel: data.currentItemLabel ?? currentRow.currentItemLabel,
      checkpointType: data.checkpointType ?? currentRow.checkpointType,
      checkpointSummary: data.checkpointSummary ?? currentRow.checkpointSummary,
      resumeTargetJson: data.resumeTargetJson ?? currentRow.resumeTargetJson,
      seedPayloadJson: data.seedPayloadJson ?? currentRow.seedPayloadJson,
      heartbeatAt: data.heartbeatAt ?? currentRow.heartbeatAt,
      status: data.status ?? currentRow.status,
      progress: data.progress ?? currentRow.progress,
      finishedAt: data.finishedAt ?? currentRow.finishedAt,
      cancelRequestedAt: data.cancelRequestedAt ?? currentRow.cancelRequestedAt,
      lastError: Object.prototype.hasOwnProperty.call(data, "lastError")
        ? data.lastError
        : currentRow.lastError,
      milestonesJson: data.milestonesJson ?? currentRow.milestonesJson,
    };
    return currentRow;
  };

  try {
    const service = new NovelWorkflowService();
    const healed = await service.healAutoDirectorTaskState("task_batch_ready");

    assert.equal(healed, true);
    assert.match(currentRow.checkpointSummary, /当前仍有 1 章待继续/);
    assert.equal(JSON.parse(currentRow.resumeTargetJson).chapterId, "chapter-2");
    assert.equal(JSON.parse(currentRow.seedPayloadJson).autoExecution.remainingChapterCount, 1);
  } finally {
    prisma.novelWorkflowTask.findUnique = originals.findUnique;
    prisma.chapter.findMany = originals.chapterFindMany;
    prisma.novelWorkflowTask.update = originals.update;
  }
});

test("healAutoDirectorTaskState revives front10 auto execution tasks that only failed during restart recovery while pipeline is still running", async () => {
  const originals = {
    findUnique: prisma.novelWorkflowTask.findUnique,
    generationJobFindUnique: prisma.generationJob.findUnique,
    update: prisma.novelWorkflowTask.update,
  };

  let currentRow = {
    id: "task_front10_restart",
    title: "示例项目",
    novelId: "novel_demo",
    lane: "auto_director",
    status: "failed",
    progress: 0.9763,
    currentStage: "章节执行",
    currentItemKey: "chapter_execution",
    currentItemLabel: "正在自动执行前 10 章 · 第 2/10 章 · 示例章节",
    checkpointType: null,
    checkpointSummary: null,
    resumeTargetJson: null,
    seedPayloadJson: JSON.stringify({
      directorSession: {
        runMode: "auto_to_execution",
        phase: "front10_ready",
        isBackgroundRunning: true,
        lockedScopes: ["chapter", "pipeline"],
        reviewScope: null,
      },
      autoExecution: {
        enabled: true,
        firstChapterId: "chapter-1",
        startOrder: 1,
        endOrder: 10,
        totalChapterCount: 10,
        nextChapterId: "chapter-2",
        nextChapterOrder: 2,
        pipelineJobId: "job-front10-running",
        pipelineStatus: "running",
      },
    }),
    lastError: "服务重启后恢复失败：当前检查点不支持继续自动导演。",
    finishedAt: new Date("2026-04-05T12:33:35.000Z"),
    heartbeatAt: new Date("2026-04-05T12:33:35.000Z"),
    cancelRequestedAt: null,
    milestonesJson: null,
  };

  prisma.novelWorkflowTask.findUnique = async () => currentRow;
  prisma.generationJob.findUnique = async () => ({
    id: "job-front10-running",
    status: "running",
    progress: 0.165,
    currentStage: "reviewing",
    currentItemLabel: "第 2/10 章 · 示例章节",
  });
  prisma.novelWorkflowTask.update = async ({ data }) => {
    currentRow = {
      ...currentRow,
      status: data.status ?? currentRow.status,
      progress: data.progress ?? currentRow.progress,
      currentStage: data.currentStage ?? currentRow.currentStage,
      currentItemKey: data.currentItemKey ?? currentRow.currentItemKey,
      currentItemLabel: data.currentItemLabel ?? currentRow.currentItemLabel,
      checkpointType: Object.prototype.hasOwnProperty.call(data, "checkpointType")
        ? data.checkpointType
        : currentRow.checkpointType,
      checkpointSummary: Object.prototype.hasOwnProperty.call(data, "checkpointSummary")
        ? data.checkpointSummary
        : currentRow.checkpointSummary,
      resumeTargetJson: data.resumeTargetJson ?? currentRow.resumeTargetJson,
      heartbeatAt: data.heartbeatAt ?? currentRow.heartbeatAt,
      finishedAt: data.finishedAt ?? currentRow.finishedAt,
      cancelRequestedAt: data.cancelRequestedAt ?? currentRow.cancelRequestedAt,
      lastError: Object.prototype.hasOwnProperty.call(data, "lastError")
        ? data.lastError
        : currentRow.lastError,
    };
    return currentRow;
  };

  try {
    const service = new NovelWorkflowService();
    const healed = await service.healAutoDirectorTaskState("task_front10_restart");

    assert.equal(healed, true);
    assert.equal(currentRow.status, "running");
    assert.equal(currentRow.currentStage, "质量修复");
    assert.match(currentRow.currentItemLabel, /正在自动审校前 10 章/);
    assert.equal(currentRow.checkpointType, null);
    assert.equal(currentRow.lastError, null);
    assert.equal(JSON.parse(currentRow.resumeTargetJson).chapterId, "chapter-2");
  } finally {
    prisma.novelWorkflowTask.findUnique = originals.findUnique;
    prisma.generationJob.findUnique = originals.generationJobFindUnique;
    prisma.novelWorkflowTask.update = originals.update;
  }
});

test("healAutoDirectorTaskState promotes advanced queued auto director tasks back to running and clears stale candidate checkpoints", async () => {
  const originals = {
    findUnique: prisma.novelWorkflowTask.findUnique,
    update: prisma.novelWorkflowTask.update,
  };

  let currentRow = {
    id: "task_stale_queued",
    title: "示例项目",
    novelId: "novel_demo",
    lane: "auto_director",
    status: "queued",
    progress: 0.8458,
    currentStage: "节奏 / 拆章",
    currentItemKey: "chapter_list",
    currentItemLabel: "正在生成第 1 卷章节列表",
    checkpointType: "candidate_selection_required",
    checkpointSummary: "第 1 轮 已生成 2 套书级方向，并完成每套书名组。",
    resumeTargetJson: null,
    seedPayloadJson: JSON.stringify({
      directorSession: {
        runMode: "auto_to_ready",
        phase: "structured_outline",
        isBackgroundRunning: true,
        lockedScopes: ["basic", "story_macro", "character", "outline", "structured", "chapter", "pipeline"],
        reviewScope: null,
      },
    }),
    lastError: null,
    finishedAt: null,
    heartbeatAt: null,
    cancelRequestedAt: null,
    milestonesJson: null,
  };

  prisma.novelWorkflowTask.findUnique = async () => currentRow;
  prisma.novelWorkflowTask.update = async ({ data }) => {
    currentRow = {
      ...currentRow,
      status: data.status ?? currentRow.status,
      checkpointType: Object.prototype.hasOwnProperty.call(data, "checkpointType")
        ? data.checkpointType
        : currentRow.checkpointType,
      checkpointSummary: Object.prototype.hasOwnProperty.call(data, "checkpointSummary")
        ? data.checkpointSummary
        : currentRow.checkpointSummary,
      heartbeatAt: data.heartbeatAt ?? currentRow.heartbeatAt,
      finishedAt: Object.prototype.hasOwnProperty.call(data, "finishedAt")
        ? data.finishedAt
        : currentRow.finishedAt,
      cancelRequestedAt: Object.prototype.hasOwnProperty.call(data, "cancelRequestedAt")
        ? data.cancelRequestedAt
        : currentRow.cancelRequestedAt,
      lastError: Object.prototype.hasOwnProperty.call(data, "lastError")
        ? data.lastError
        : currentRow.lastError,
    };
    return currentRow;
  };

  try {
    const service = new NovelWorkflowService();
    const healed = await service.healAutoDirectorTaskState("task_stale_queued");

    assert.equal(healed, true);
    assert.equal(currentRow.status, "running");
    assert.equal(currentRow.checkpointType, null);
    assert.equal(currentRow.checkpointSummary, null);
    assert.ok(currentRow.heartbeatAt instanceof Date);
  } finally {
    prisma.novelWorkflowTask.findUnique = originals.findUnique;
    prisma.novelWorkflowTask.update = originals.update;
  }
});

test("healAutoDirectorTaskState repairs broken candidate seed payloads and restores candidate selection tasks", async () => {
  const originals = {
    findUnique: prisma.novelWorkflowTask.findUnique,
    update: prisma.novelWorkflowTask.update,
  };

  let currentRow = {
    id: "task_candidate_seed_repair",
    title: "示例项目",
    novelId: null,
    lane: "auto_director",
    status: "failed",
    progress: 0.15,
    currentStage: "AI 自动导演",
    currentItemKey: "auto_director",
    currentItemLabel: "等待确认书级方向",
    checkpointType: "candidate_selection_required",
    checkpointSummary: "第 1 轮已生成 2 套书级方向，并完成每套书名组。",
    resumeTargetJson: null,
    seedPayloadJson: JSON.stringify({
      directorSession: {
        runMode: "auto_to_ready",
        phase: "candidate_selection",
        isBackgroundRunning: false,
        lockedScopes: ["basic"],
        reviewScope: null,
      },
      candidateStage: {
        mode: "patch_candidate",
        batchId: "batch-1",
        candidateId: "candidate-missing",
        feedback: "只压缩铺垫",
      },
      batches: [{
        id: "batch-1",
        round: 1,
        roundLabel: "第 1 轮",
        idea: "示例灵感",
        refinementSummary: null,
        presets: [],
        candidates: [
          {
            workingTitle: "方案一",
            titleOptions: [],
            logline: "logline 1",
            positioning: "positioning 1",
            sellingPoint: "selling 1",
            coreConflict: "conflict 1",
            protagonistPath: "path 1",
            endingDirection: "ending 1",
            hookStrategy: "hook 1",
            progressionLoop: "loop 1",
            whyItFits: "fit 1",
            toneKeywords: ["a", "b"],
            targetChapterCount: 30,
          },
          {
            workingTitle: "方案二",
            titleOptions: [],
            logline: "logline 2",
            positioning: "positioning 2",
            sellingPoint: "selling 2",
            coreConflict: "conflict 2",
            protagonistPath: "path 2",
            endingDirection: "ending 2",
            hookStrategy: "hook 2",
            progressionLoop: "loop 2",
            whyItFits: "fit 2",
            toneKeywords: ["c", "d"],
            targetChapterCount: 32,
          },
        ],
        createdAt: "2026-04-14T00:00:00.000Z",
      }],
    }),
    lastError: "目标方案不存在。",
    finishedAt: new Date("2026-04-14T00:12:09.000Z"),
    heartbeatAt: new Date("2026-04-14T00:12:09.000Z"),
    cancelRequestedAt: null,
    milestonesJson: null,
  };

  prisma.novelWorkflowTask.findUnique = async () => currentRow;
  prisma.novelWorkflowTask.update = async ({ data }) => {
    currentRow = {
      ...currentRow,
      status: data.status ?? currentRow.status,
      currentStage: data.currentStage ?? currentRow.currentStage,
      currentItemKey: data.currentItemKey ?? currentRow.currentItemKey,
      currentItemLabel: data.currentItemLabel ?? currentRow.currentItemLabel,
      checkpointType: Object.prototype.hasOwnProperty.call(data, "checkpointType")
        ? data.checkpointType
        : currentRow.checkpointType,
      checkpointSummary: Object.prototype.hasOwnProperty.call(data, "checkpointSummary")
        ? data.checkpointSummary
        : currentRow.checkpointSummary,
      resumeTargetJson: data.resumeTargetJson ?? currentRow.resumeTargetJson,
      seedPayloadJson: data.seedPayloadJson ?? currentRow.seedPayloadJson,
      heartbeatAt: data.heartbeatAt ?? currentRow.heartbeatAt,
      finishedAt: Object.prototype.hasOwnProperty.call(data, "finishedAt")
        ? data.finishedAt
        : currentRow.finishedAt,
      cancelRequestedAt: Object.prototype.hasOwnProperty.call(data, "cancelRequestedAt")
        ? data.cancelRequestedAt
        : currentRow.cancelRequestedAt,
      lastError: Object.prototype.hasOwnProperty.call(data, "lastError")
        ? data.lastError
        : currentRow.lastError,
    };
    return currentRow;
  };

  try {
    const service = new NovelWorkflowService();
    const healed = await service.healAutoDirectorTaskState("task_candidate_seed_repair");

    assert.equal(healed, true);
    assert.equal(currentRow.status, "waiting_approval");
    assert.equal(currentRow.currentItemKey, "auto_director");
    assert.equal(currentRow.checkpointType, "candidate_selection_required");
    assert.equal(currentRow.lastError, null);
    assert.equal(currentRow.finishedAt, null);

    const resumeTarget = JSON.parse(currentRow.resumeTargetJson);
    assert.equal(resumeTarget.route, "/novels/create");
    assert.equal(resumeTarget.mode, "director");

    const seedPayload = JSON.parse(currentRow.seedPayloadJson);
    assert.equal(seedPayload.candidateStage, null);
    assert.equal(seedPayload.batches[0].candidates.length, 2);
    assert.ok(seedPayload.batches[0].candidates.every((candidate) => typeof candidate.id === "string" && candidate.id.length > 0));
  } finally {
    prisma.novelWorkflowTask.findUnique = originals.findUnique;
    prisma.novelWorkflowTask.update = originals.update;
  }
});

test("healAutoDirectorTaskState degrades chapter title diversity failures into warning checkpoints", async () => {
  const originals = {
    findUnique: prisma.novelWorkflowTask.findUnique,
    update: prisma.novelWorkflowTask.update,
  };

  let currentRow = {
    id: "task_title_diversity",
    title: "示例项目",
    novelId: "novel_demo",
    lane: "auto_director",
    status: "failed",
    progress: 0.84,
    currentStage: "节奏 / 拆章",
    currentItemKey: "chapter_list",
    currentItemLabel: "正在生成第 1 卷章节列表",
    checkpointType: null,
    checkpointSummary: null,
    resumeTargetJson: JSON.stringify({
      route: "/novels/novel_demo/edit",
      stage: "structured",
      novelId: "novel_demo",
      taskId: "task_title_diversity",
      volumeId: "volume-1",
      chapterId: null,
    }),
    seedPayloadJson: JSON.stringify({
      directorSession: {
        runMode: "auto_to_ready",
        phase: "structured_outline",
        isBackgroundRunning: false,
        lockedScopes: ["basic", "story_macro", "character", "outline", "structured"],
        reviewScope: null,
      },
    }),
    lastError: "章节标题结构过于集中：38/40 个标题都落在 A，B / 四字动作，四字结果 骨架上。请把标题改得更分散。",
    finishedAt: new Date("2026-04-13T12:00:00.000Z"),
    heartbeatAt: new Date("2026-04-13T12:00:00.000Z"),
    cancelRequestedAt: null,
    milestonesJson: null,
  };

  prisma.novelWorkflowTask.findUnique = async () => currentRow;
  prisma.novelWorkflowTask.update = async ({ data }) => {
    currentRow = {
      ...currentRow,
      status: data.status ?? currentRow.status,
      currentStage: data.currentStage ?? currentRow.currentStage,
      currentItemKey: data.currentItemKey ?? currentRow.currentItemKey,
      currentItemLabel: data.currentItemLabel ?? currentRow.currentItemLabel,
      checkpointType: Object.prototype.hasOwnProperty.call(data, "checkpointType")
        ? data.checkpointType
        : currentRow.checkpointType,
      checkpointSummary: Object.prototype.hasOwnProperty.call(data, "checkpointSummary")
        ? data.checkpointSummary
        : currentRow.checkpointSummary,
      resumeTargetJson: data.resumeTargetJson ?? currentRow.resumeTargetJson,
      seedPayloadJson: data.seedPayloadJson ?? currentRow.seedPayloadJson,
      heartbeatAt: data.heartbeatAt ?? currentRow.heartbeatAt,
      finishedAt: Object.prototype.hasOwnProperty.call(data, "finishedAt")
        ? data.finishedAt
        : currentRow.finishedAt,
      cancelRequestedAt: Object.prototype.hasOwnProperty.call(data, "cancelRequestedAt")
        ? data.cancelRequestedAt
        : currentRow.cancelRequestedAt,
      lastError: Object.prototype.hasOwnProperty.call(data, "lastError")
        ? data.lastError
        : currentRow.lastError,
    };
    return currentRow;
  };

  try {
    const service = new NovelWorkflowService();
    const healed = await service.healAutoDirectorTaskState("task_title_diversity");

    assert.equal(healed, true);
    assert.equal(currentRow.status, "waiting_approval");
    assert.equal(currentRow.currentItemKey, "chapter_list");
    assert.equal(currentRow.lastError, null);
    const seedPayload = JSON.parse(currentRow.seedPayloadJson);
    assert.equal(seedPayload.taskNotice.code, "CHAPTER_TITLE_DIVERSITY");
    assert.equal(seedPayload.taskNotice.action.label, "快速修复章节标题");
    assert.equal(seedPayload.taskNotice.action.volumeId, "volume-1");
  } finally {
    prisma.novelWorkflowTask.findUnique = originals.findUnique;
    prisma.novelWorkflowTask.update = originals.update;
  }
});
