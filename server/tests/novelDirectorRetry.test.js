const test = require("node:test");
const assert = require("node:assert/strict");
require("../dist/app.js");
const {
  applyDirectorLlmOverride,
  getDirectorLlmOptionsFromSeedPayload,
} = require("../dist/services/novel/director/novelDirectorHelpers.js");
const { NovelDirectorService } = require("../dist/services/novel/director/NovelDirectorService.js");
const {
  runDirectorStructuredOutlinePhase,
} = require("../dist/services/novel/director/novelDirectorPipelinePhases.js");
const {
  buildVolumeWorkspaceDocument,
} = require("../dist/services/novel/volume/volumeWorkspaceDocument.js");

function buildDirectorInput(overrides = {}) {
  return {
    idea: "A courier discovers a hidden rule-bound city underworld.",
    batchId: "batch_1",
    round: 1,
    candidate: {
      id: "candidate_1",
      workingTitle: "Rulebound Courier",
      logline: "A courier is dragged into a hidden network of rules, debts and urban anomalies.",
      positioning: "Urban rule-based growth thriller",
      sellingPoint: "Rule anomalies + grassroots climb",
      coreConflict: "To survive she must exploit the same rules that are hunting her.",
      protagonistPath: "From self-preserving courier to rule-breaking operator.",
      endingDirection: "Costly breakthrough with room for escalation.",
      hookStrategy: "Every delivery exposes one deeper rule and one stronger predator.",
      progressionLoop: "Discover rule, pay cost, gain leverage, strike back.",
      whyItFits: "Strong serialized pressure and fast beginner-friendly drive.",
      toneKeywords: ["urban", "rules", "growth"],
      targetChapterCount: 30,
    },
    workflowTaskId: "task_retry_demo",
    provider: "deepseek",
    model: "deepseek-chat",
    temperature: 0.7,
    runMode: "auto_to_ready",
    writingMode: "original",
    projectMode: "ai_led",
    narrativePov: "third_person",
    pacePreference: "balanced",
    emotionIntensity: "medium",
    aiFreedom: "medium",
    estimatedChapterCount: 30,
    ...overrides,
  };
}

function createVolumeChapter(input) {
  return {
    id: input.id,
    volumeId: input.volumeId,
    chapterOrder: input.chapterOrder,
    beatKey: input.beatKey ?? null,
    title: input.title ?? `第${input.chapterOrder}章`,
    summary: input.summary ?? `第${input.chapterOrder}章摘要`,
    purpose: input.purpose ?? null,
    conflictLevel: input.conflictLevel ?? null,
    revealLevel: input.revealLevel ?? null,
    targetWordCount: input.targetWordCount ?? null,
    mustAvoid: input.mustAvoid ?? null,
    taskSheet: input.taskSheet ?? null,
    sceneCards: input.sceneCards ?? null,
    payoffRefs: input.payoffRefs ?? [],
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

function createStructuredOutlineWorkspace() {
  return buildVolumeWorkspaceDocument({
    novelId: "novel_resume_outline",
    volumes: [
      {
        id: "volume-1",
        novelId: "novel_resume_outline",
        sortOrder: 1,
        title: "第一卷",
        summary: "第一卷摘要",
        openingHook: "开卷抓手",
        mainPromise: "主承诺",
        primaryPressureSource: "压力源",
        coreSellingPoint: "核心卖点",
        escalationMode: "升级方式",
        protagonistChange: "主角变化",
        midVolumeRisk: "中段风险",
        climax: "高潮",
        payoffType: "兑现类型",
        nextVolumeHook: "下卷钩子",
        resetPoint: null,
        openPayoffs: [],
        status: "active",
        sourceVersionId: null,
        chapters: [
          createVolumeChapter({
            id: "volume-1-chapter-1",
            volumeId: "volume-1",
            chapterOrder: 1,
            beatKey: "v1_open",
            purpose: "已完成",
            conflictLevel: 2,
            revealLevel: 1,
            targetWordCount: 2400,
            mustAvoid: "避免跑题",
            taskSheet: "执行任务单",
          }),
        ],
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
      },
      {
        id: "volume-2",
        novelId: "novel_resume_outline",
        sortOrder: 2,
        title: "第二卷",
        summary: "第二卷摘要",
        openingHook: "第二卷开卷抓手",
        mainPromise: "第二卷主承诺",
        primaryPressureSource: "第二卷压力源",
        coreSellingPoint: "第二卷核心卖点",
        escalationMode: "第二卷升级方式",
        protagonistChange: "第二卷主角变化",
        midVolumeRisk: "第二卷中段风险",
        climax: "第二卷高潮",
        payoffType: "第二卷兑现类型",
        nextVolumeHook: "第二卷下卷钩子",
        resetPoint: null,
        openPayoffs: [],
        status: "active",
        sourceVersionId: null,
        chapters: [],
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
      },
    ],
    beatSheets: [
      {
        volumeId: "volume-1",
        volumeSortOrder: 1,
        status: "generated",
        beats: [
          {
            key: "v1_open",
            label: "第一卷开局",
            summary: "第一卷先立住局面。",
            chapterSpanHint: "1-1章",
            mustDeliver: ["立住局面"],
          },
        ],
      },
      {
        volumeId: "volume-2",
        volumeSortOrder: 2,
        status: "generated",
        beats: [
          {
            key: "v2_open",
            label: "第二卷开局",
            summary: "第二卷重新点火。",
            chapterSpanHint: "1-1章",
            mustDeliver: ["重新点火"],
          },
        ],
      },
    ],
    strategyPlan: null,
    critiqueReport: null,
    rebalanceDecisions: [],
    source: "volume",
    activeVersionId: null,
  });
}

test("applyDirectorLlmOverride rewrites persisted auto director model selection", () => {
  const nextSeedPayload = applyDirectorLlmOverride({
    novelId: "novel_retry_demo",
    directorInput: buildDirectorInput(),
  }, {
    provider: "openai",
    model: "gpt-5-mini",
    temperature: 1,
  });

  assert.ok(nextSeedPayload);
  assert.equal(nextSeedPayload.directorInput.provider, "openai");
  assert.equal(nextSeedPayload.directorInput.model, "gpt-5-mini");
  assert.equal(nextSeedPayload.directorInput.temperature, 1);
  assert.equal(nextSeedPayload.directorInput.candidate.workingTitle, "Rulebound Courier");
});

test("applyDirectorLlmOverride also rewrites candidate-stage seed payload before directorInput exists", () => {
  const nextSeedPayload = applyDirectorLlmOverride({
    idea: "A courier discovers a hidden rule-bound city underworld.",
    provider: "custom_coding_plan",
    model: "kimi-k2.5",
    temperature: 0.8,
    candidateStage: {
      mode: "generate",
    },
  }, {
    provider: "glm",
    model: "glm-5",
    temperature: 0.6,
  });

  assert.ok(nextSeedPayload);
  assert.equal(nextSeedPayload.provider, "glm");
  assert.equal(nextSeedPayload.model, "glm-5");
  assert.equal(nextSeedPayload.temperature, 0.6);
  assert.deepEqual(getDirectorLlmOptionsFromSeedPayload(nextSeedPayload), {
    provider: "glm",
    model: "glm-5",
    temperature: 0.6,
  });
});

test("generateCandidates marks workflow task failed when candidate-stage generation throws", async () => {
  const service = new NovelDirectorService();
  const originalGenerate = service.candidateStageService.generateCandidates;
  const originalMarkTaskFailed = service.workflowService.markTaskFailed;
  const failures = [];

  service.candidateStageService.generateCandidates = async () => {
    throw new Error("结构化输出解析失败");
  };
  service.workflowService.markTaskFailed = async (taskId, message) => {
    failures.push([taskId, message]);
    return null;
  };

  try {
    await assert.rejects(
      service.generateCandidates({
        idea: "A courier discovers a hidden rule-bound city underworld.",
        workflowTaskId: "task_candidate_failed",
      }),
      /结构化输出解析失败/,
    );
    assert.deepEqual(failures, [
      ["task_candidate_failed", "结构化输出解析失败"],
    ]);
  } finally {
    service.candidateStageService.generateCandidates = originalGenerate;
    service.workflowService.markTaskFailed = originalMarkTaskFailed;
  }
});

test("continueTask resumes queued candidate-stage tasks before novel creation", async () => {
  const service = new NovelDirectorService();
  const originalGetTaskById = service.workflowService.getTaskById;
  const originalGetTaskByIdWithoutHealing = service.workflowService.getTaskByIdWithoutHealing;
  const originalScheduleBackgroundRun = service.scheduleBackgroundRun;
  const originalGenerate = service.candidateStageService.generateCandidates;
  const resumed = [];

  service.workflowService.getTaskById = async () => ({
    id: "task_candidate_resume",
    lane: "auto_director",
    status: "running",
    novelId: null,
    checkpointType: null,
    currentItemKey: "candidate_direction_batch",
    seedPayloadJson: JSON.stringify({
      idea: "A courier discovers a hidden rule-bound city underworld.",
      provider: "custom_coding_plan",
      model: "kimi-k2.5",
      temperature: 0.8,
      runMode: "auto_to_ready",
      candidateStage: {
        mode: "generate",
      },
    }),
  });
  service.workflowService.getTaskByIdWithoutHealing = async () => ({
    id: "task_candidate_resume",
    lane: "auto_director",
    status: "queued",
    novelId: null,
    checkpointType: null,
    currentItemKey: "candidate_direction_batch",
    seedPayloadJson: JSON.stringify({
      idea: "A courier discovers a hidden rule-bound city underworld.",
      provider: "custom_coding_plan",
      model: "kimi-k2.5",
      temperature: 0.8,
      runMode: "auto_to_ready",
      candidateStage: {
        mode: "generate",
      },
    }),
  });
  service.scheduleBackgroundRun = (taskId, runner) => {
    void runner();
  };
  service.candidateStageService.generateCandidates = async (input) => {
    resumed.push(input);
    return { batch: { id: "batch_resume" } };
  };

  try {
    await service.continueTask("task_candidate_resume");
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(resumed.length, 1);
    assert.equal(resumed[0].workflowTaskId, "task_candidate_resume");
    assert.equal(resumed[0].provider, "custom_coding_plan");
    assert.equal(resumed[0].model, "kimi-k2.5");
    assert.equal(resumed[0].temperature, 0.8);
  } finally {
    service.workflowService.getTaskById = originalGetTaskById;
    service.workflowService.getTaskByIdWithoutHealing = originalGetTaskByIdWithoutHealing;
    service.scheduleBackgroundRun = originalScheduleBackgroundRun;
    service.candidateStageService.generateCandidates = originalGenerate;
  }
});

test("continueTask ignores stale candidate-stage state after the workflow has entered story macro", async () => {
  const service = new NovelDirectorService();
  const originalGetTaskByIdWithoutHealing = service.workflowService.getTaskByIdWithoutHealing;
  const originalBootstrapTask = service.workflowService.bootstrapTask;
  const originalMarkTaskRunning = service.workflowService.markTaskRunning;
  const originalScheduleBackgroundRun = service.scheduleBackgroundRun;
  const originalGenerate = service.candidateStageService.generateCandidates;
  const originalRunDirectorPipeline = service.runDirectorPipeline;
  const bootstrapCalls = [];
  const runningCalls = [];
  const scheduledRuns = [];
  const pipelineRuns = [];
  let candidateResumeCount = 0;

  service.workflowService.getTaskByIdWithoutHealing = async () => ({
    id: "task_story_macro_resume",
    lane: "auto_director",
    status: "queued",
    novelId: "novel_story_macro_resume",
    checkpointType: null,
    currentItemKey: "story_macro",
    seedPayloadJson: JSON.stringify({
      idea: "A courier discovers a hidden rule-bound city underworld.",
      provider: "custom_coding_plan",
      model: "kimi-k2.5",
      temperature: 0.8,
      runMode: "auto_to_ready",
      candidateStage: {
        mode: "generate",
      },
      directorInput: buildDirectorInput({
        workflowTaskId: "task_story_macro_resume",
      }),
      directorSession: {
        runMode: "auto_to_ready",
        phase: "story_macro",
        isBackgroundRunning: true,
        lockedScopes: ["basic", "story_macro", "character", "outline", "structured", "chapter", "pipeline"],
        reviewScope: null,
      },
    }),
  });
  service.workflowService.bootstrapTask = async (input) => {
    bootstrapCalls.push(input);
    return {
      id: "task_story_macro_resume",
    };
  };
  service.workflowService.markTaskRunning = async (taskId, input) => {
    runningCalls.push({ taskId, ...input });
    return null;
  };
  service.scheduleBackgroundRun = (taskId, runner) => {
    scheduledRuns.push(taskId);
    void runner();
  };
  service.candidateStageService.generateCandidates = async () => {
    candidateResumeCount += 1;
    return { batch: { id: "batch_should_not_resume" } };
  };
  service.runDirectorPipeline = async (input) => {
    pipelineRuns.push(input);
  };

  try {
    await service.continueTask("task_story_macro_resume");
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(candidateResumeCount, 0);
    assert.equal(bootstrapCalls.length, 1);
    assert.equal(bootstrapCalls[0].novelId, "novel_story_macro_resume");
    assert.equal(bootstrapCalls[0].seedPayload.candidateStage, null);
    assert.equal(runningCalls.length, 1);
    assert.equal(runningCalls[0].stage, "story_macro");
    assert.equal(runningCalls[0].itemKey, "book_contract");
    assert.equal(scheduledRuns.length, 1);
    assert.equal(pipelineRuns.length, 1);
    assert.equal(pipelineRuns[0].startPhase, "story_macro");
  } finally {
    service.workflowService.getTaskByIdWithoutHealing = originalGetTaskByIdWithoutHealing;
    service.workflowService.bootstrapTask = originalBootstrapTask;
    service.workflowService.markTaskRunning = originalMarkTaskRunning;
    service.scheduleBackgroundRun = originalScheduleBackgroundRun;
    service.candidateStageService.generateCandidates = originalGenerate;
    service.runDirectorPipeline = originalRunDirectorPipeline;
  }
});

test("continueTask resumes auto-director tasks that are still marked running after manual-recovery pause", async () => {
  const service = new NovelDirectorService();
  const originalContinueCandidateStageTask = service.continueCandidateStageTask;
  const originalGetTaskByIdWithoutHealing = service.workflowService.getTaskByIdWithoutHealing;
  const originalBootstrapTask = service.workflowService.bootstrapTask;
  const originalMarkTaskRunning = service.workflowService.markTaskRunning;
  const originalScheduleBackgroundRun = service.scheduleBackgroundRun;
  const originalRunDirectorPipeline = service.runDirectorPipeline;
  const bootstrapCalls = [];
  const runningCalls = [];
  const scheduledRuns = [];
  const pipelineRuns = [];

  service.continueCandidateStageTask = async () => false;
  service.workflowService.getTaskByIdWithoutHealing = async () => ({
    id: "task_recovery_resume",
    lane: "auto_director",
    status: "running",
    pendingManualRecovery: true,
    novelId: "novel_recovery_resume",
    checkpointType: null,
    currentItemKey: "chapter_detail_bundle",
    seedPayloadJson: JSON.stringify({
      directorInput: buildDirectorInput({
        workflowTaskId: "task_recovery_resume",
      }),
      directorSession: {
        runMode: "auto_to_execution",
        phase: "structured_outline",
        isBackgroundRunning: false,
        lockedScopes: ["basic", "story_macro", "character", "outline", "structured", "chapter", "pipeline"],
        reviewScope: null,
      },
    }),
  });
  service.workflowService.bootstrapTask = async (input) => {
    bootstrapCalls.push(input);
    return { id: "task_recovery_resume" };
  };
  service.workflowService.markTaskRunning = async (taskId, input) => {
    runningCalls.push({ taskId, ...input });
    return null;
  };
  service.scheduleBackgroundRun = (taskId, runner) => {
    scheduledRuns.push(taskId);
    void runner();
  };
  service.runDirectorPipeline = async (input) => {
    pipelineRuns.push(input);
  };

  try {
    await service.continueTask("task_recovery_resume");
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(bootstrapCalls.length, 1);
    assert.equal(runningCalls.length, 1);
    assert.equal(runningCalls[0].stage, "structured_outline");
    assert.equal(scheduledRuns.length, 1);
    assert.equal(pipelineRuns.length, 1);
    assert.equal(pipelineRuns[0].startPhase, "structured_outline");
  } finally {
    service.continueCandidateStageTask = originalContinueCandidateStageTask;
    service.workflowService.getTaskByIdWithoutHealing = originalGetTaskByIdWithoutHealing;
    service.workflowService.bootstrapTask = originalBootstrapTask;
    service.workflowService.markTaskRunning = originalMarkTaskRunning;
    service.scheduleBackgroundRun = originalScheduleBackgroundRun;
    service.runDirectorPipeline = originalRunDirectorPipeline;
  }
});

test("continueTask resumes auto execution in the background instead of blocking the request", async () => {
  const service = new NovelDirectorService();
  const originalContinueCandidateStageTask = service.continueCandidateStageTask;
  const originalGetTaskByIdWithoutHealing = service.workflowService.getTaskByIdWithoutHealing;
  const originalMarkTaskRunning = service.workflowService.markTaskRunning;
  const originalScheduleBackgroundRun = service.scheduleBackgroundRun;
  const originalRunFromReady = service.autoExecutionRuntime.runFromReady;
  const runningCalls = [];
  const scheduledRuns = [];
  const runtimeCalls = [];

  service.continueCandidateStageTask = async () => false;
  service.workflowService.getTaskByIdWithoutHealing = async () => ({
    id: "task_auto_execution_resume",
    lane: "auto_director",
    status: "failed",
    pendingManualRecovery: false,
    novelId: "novel_auto_execution_resume",
    checkpointType: "chapter_batch_ready",
    currentItemKey: "quality_repair",
    resumeTargetJson: JSON.stringify({
      stage: "pipeline",
      chapterId: "chapter_2",
    }),
    lastError: "Chapter generation is blocked until review is resolved.",
    seedPayloadJson: JSON.stringify({
      directorInput: buildDirectorInput({
        workflowTaskId: "task_auto_execution_resume",
        runMode: "auto_to_execution",
      }),
      directorSession: {
        runMode: "auto_to_execution",
        phase: "front10_ready",
        isBackgroundRunning: false,
        lockedScopes: ["basic", "story_macro", "character", "outline", "structured", "chapter", "pipeline"],
        reviewScope: null,
      },
      autoExecution: {
        enabled: true,
        mode: "chapter_range",
        scopeLabel: "第 2-10 章",
        startOrder: 2,
        endOrder: 10,
        totalChapterCount: 9,
        nextChapterId: "chapter_2",
        nextChapterOrder: 2,
        remainingChapterCount: 9,
        remainingChapterIds: ["chapter_2"],
        remainingChapterOrders: [2, 3, 4, 5, 6, 7, 8, 9, 10],
        pipelineJobId: "pipeline_existing",
        pipelineStatus: "failed",
      },
    }),
  });
  service.workflowService.markTaskRunning = async (taskId, input) => {
    runningCalls.push({ taskId, ...input });
    return null;
  };
  service.scheduleBackgroundRun = (taskId, runner) => {
    scheduledRuns.push({ taskId, runner });
  };
  service.autoExecutionRuntime.runFromReady = async (input) => {
    runtimeCalls.push(input);
  };

  try {
    await service.continueTask("task_auto_execution_resume", {
      continuationMode: "auto_execute_range",
    });
    assert.equal(runningCalls.length, 1);
    assert.equal(runningCalls[0].taskId, "task_auto_execution_resume");
    assert.equal(runningCalls[0].stage, "chapter_execution");
    assert.equal(runningCalls[0].itemKey, "chapter_execution");
    assert.equal(runningCalls[0].clearCheckpoint, true);
    assert.equal(scheduledRuns.length, 1);
    assert.equal(runtimeCalls.length, 0);

    await scheduledRuns[0].runner();

    assert.equal(runtimeCalls.length, 1);
    assert.equal(runtimeCalls[0].taskId, "task_auto_execution_resume");
    assert.equal(runtimeCalls[0].novelId, "novel_auto_execution_resume");
    assert.equal(runtimeCalls[0].resumeCheckpointType, "chapter_batch_ready");
    assert.equal(runtimeCalls[0].allowSkipReviewBlockedChapter, true);
  } finally {
    service.continueCandidateStageTask = originalContinueCandidateStageTask;
    service.workflowService.getTaskByIdWithoutHealing = originalGetTaskByIdWithoutHealing;
    service.workflowService.markTaskRunning = originalMarkTaskRunning;
    service.scheduleBackgroundRun = originalScheduleBackgroundRun;
    service.autoExecutionRuntime.runFromReady = originalRunFromReady;
  }
});

test("runDirectorStructuredOutlinePhase resumes from the first incomplete beat and missing detail mode", async () => {
  const baseWorkspace = createStructuredOutlineWorkspace();
  const chapterListCompletedWorkspace = buildVolumeWorkspaceDocument({
    ...baseWorkspace,
    volumes: baseWorkspace.volumes.map((volume) => (
      volume.id === "volume-2"
        ? {
          ...volume,
          chapters: [
            createVolumeChapter({
              id: "volume-2-chapter-1",
              volumeId: "volume-2",
              chapterOrder: 1,
              beatKey: "v2_open",
              purpose: "第二卷章节目标",
              conflictLevel: 3,
              revealLevel: 2,
              targetWordCount: 2600,
              mustAvoid: "不要提前透底",
              taskSheet: null,
            }),
          ],
        }
        : volume
    )),
  });
  const detailCompletedWorkspace = buildVolumeWorkspaceDocument({
    ...chapterListCompletedWorkspace,
    volumes: chapterListCompletedWorkspace.volumes.map((volume) => (
      volume.id === "volume-2"
        ? {
          ...volume,
          chapters: volume.chapters.map((chapter) => ({
            ...chapter,
            taskSheet: "第二卷章节任务单",
          })),
        }
        : volume
    )),
  });

  const generateCalls = [];
  const persistCalls = [];
  const runningUpdates = [];
  const workflowRunningCalls = [];
  const checkpointCalls = [];

  await runDirectorStructuredOutlinePhase({
    taskId: "task_structured_resume",
    novelId: "novel_resume_outline",
    request: buildDirectorInput({
      workflowTaskId: "task_structured_resume",
      runMode: "auto_to_execution",
      autoExecutionPlan: {
        mode: "volume",
        volumeOrder: 2,
      },
    }),
    baseWorkspace,
    dependencies: {
      workflowService: {
        bootstrapTask: async () => ({ id: "task_structured_resume" }),
        markTaskRunning: async (taskId, input) => {
          workflowRunningCalls.push({ taskId, ...input });
          return null;
        },
        recordCheckpoint: async (taskId, input) => {
          checkpointCalls.push({ taskId, ...input });
          return null;
        },
      },
      novelContextService: {
        listChapters: async () => [
          {
            id: "volume-2-chapter-1",
            order: 1,
            generationState: "planned",
          },
        ],
        updateNovel: async () => null,
      },
      characterDynamicsService: {
        rebuildDynamics: async () => null,
      },
      characterPreparationService: {},
      volumeService: {
        generateVolumes: async (novelId, options) => {
          generateCalls.push({ novelId, ...options });
          if (options.scope === "chapter_list") {
            return chapterListCompletedWorkspace;
          }
          if (options.scope === "chapter_detail") {
            return detailCompletedWorkspace;
          }
          throw new Error(`unexpected scope: ${options.scope}`);
        },
        updateVolumes: async (novelId, workspace) => {
          persistCalls.push({ novelId, workspace });
          return workspace;
        },
        syncVolumeChapters: async () => ({ preview: [] }),
      },
    },
    callbacks: {
      buildDirectorSeedPayload: (request, novelId, extra = {}) => ({
        directorInput: request,
        novelId,
        ...extra,
      }),
      markDirectorTaskRunning: async (taskId, stage, itemKey, itemLabel, progress, options) => {
        runningUpdates.push({
          taskId,
          stage,
          itemKey,
          itemLabel,
          progress,
          options,
        });
      },
    },
  });

  assert.deepEqual(
    generateCalls.map((call) => ({
      scope: call.scope,
      targetVolumeId: call.targetVolumeId ?? null,
      targetChapterId: call.targetChapterId ?? null,
      detailMode: call.detailMode ?? null,
    })),
    [
      {
        scope: "chapter_list",
        targetVolumeId: "volume-2",
        targetChapterId: null,
        detailMode: null,
      },
      {
        scope: "chapter_detail",
        targetVolumeId: "volume-2",
        targetChapterId: "volume-2-chapter-1",
        detailMode: "task_sheet",
      },
    ],
  );
  assert.equal(persistCalls.length, 3);
  assert.ok(runningUpdates.some((update) => (
    update.itemKey === "chapter_detail_bundle"
    && update.options?.chapterId === "volume-2-chapter-1"
    && update.options?.volumeId === "volume-2"
  )));
  assert.ok(workflowRunningCalls.some((call) => call.itemKey === "chapter_list" && call.volumeId === "volume-2"));
  assert.equal(checkpointCalls.length, 1);
  assert.equal(checkpointCalls[0].volumeId, "volume-2");
  assert.equal(checkpointCalls[0].chapterId, "volume-2-chapter-1");
});
