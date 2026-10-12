const {DirectorCommandService} = require("../../../../dist/services/novel/director/commands/DirectorCommandService.js");
const {prisma} = require("../../../../dist/db/prisma.js");

function createTask(overrides = {}) {
  return {
    id: "task-1",
    novelId: "novel-1",
    lane: "auto_director",
    status: "waiting_approval",
    updatedAt: new Date("2026-04-29T12:00:00.000Z"),
    seedPayloadJson: JSON.stringify({
      issueGovernanceVersion: 1,
      issuePolicy: { maxAutomaticRetries: 1, issueActions: {} },
      issuePolicySource: "global",
      runMode: "auto_to_execution",
    }),
    ...overrides,
  };
}

function createConfirmRequest(overrides = {}) {
  return {
    idea: "A college girl accidentally enters a supernatural organization.",
    title: "Neon Archive",
    narrativePov: "third_person",
    pacePreference: "balanced",
    emotionIntensity: "medium",
    aiFreedom: "medium",
    projectMode: "ai_led",
    writingMode: "original",
    estimatedChapterCount: 30,
    runMode: "auto_to_execution",
    workflowTaskId: "task-1",
    candidate: {
      id: "candidate-1",
      workingTitle: "Neon Archive",
      logline: "A college girl enters a hidden power network.",
      positioning: "Urban supernatural growth thriller.",
      sellingPoint: "An ordinary girl levels up inside a dangerous secret organization.",
      coreConflict: "The organization pushes back as she gets closer to the truth.",
      protagonistPath: "She grows from cautious student into an active operator.",
      endingDirection: "Hopeful victory with a meaningful cost.",
      hookStrategy: "Each arc reveals a deeper layer of the conspiracy.",
      progressionLoop: "Find clue, face pressure, pay cost, gain leverage.",
      whyItFits: "It keeps the urban premise clear and easy to continue.",
      toneKeywords: ["urban", "thriller"],
      targetChapterCount: 30,
    },
    ...overrides,
  };
}

function createCandidatesRequest(overrides = {}) {
  return {
    idea: "A college girl accidentally enters a supernatural organization.",
    title: "Neon Archive",
    narrativePov: "third_person",
    pacePreference: "balanced",
    emotionIntensity: "medium",
    aiFreedom: "medium",
    projectMode: "ai_led",
    writingMode: "original",
    estimatedChapterCount: 30,
    runMode: "auto_to_execution",
    ...overrides,
  };
}

function createHarness(task = createTask(), pipelineJob = null, options = {}) {
  const commands = [...(options.commands ?? [])];
  const harnessOptions = options;
  const bootstraps = [];
  const starts = [];
  const requeued = [];
  const stepUpdates = [];
  const jobUpdates = [];
  const directorEvents = [];
  const taskUpdates = [];
  const originalDirectorRunCommand = {
    findFirst: prisma.directorRunCommand.findFirst,
    create: prisma.directorRunCommand.create,
    findUnique: prisma.directorRunCommand.findUnique,
    updateMany: prisma.directorRunCommand.updateMany,
    findMany: prisma.directorRunCommand.findMany,
  };
  const originalNovelWorkflowTask = {
    findUnique: prisma.novelWorkflowTask.findUnique,
    update: prisma.novelWorkflowTask.update,
    updateMany: prisma.novelWorkflowTask.updateMany,
  };
  const originalNovel={findUnique:prisma.novel.findUnique,update:prisma.novel.update};
  prisma.novel.findUnique=async()=>({directorVersion:'v1',directorEpoch:0,narrativeForm:'long_novel'});
  prisma.novel.update=async()=>({directorVersion:'v1',directorEpoch:0});
  prisma.novelWorkflowTask.update=async({data})=>Object.assign(task,data);
  const originalDirectorStepRun = {
    updateMany: prisma.directorStepRun.updateMany,
  };
  const originalGenerationJob = {
    findUnique: prisma.generationJob.findUnique,
    findMany: prisma.generationJob.findMany,
    updateMany: prisma.generationJob.updateMany,
  };
  const originalDirectorRun = {
    findUnique: prisma.directorRun.findUnique,
  };
  const originalDirectorEvent = {
    create: prisma.directorEvent.create,
    upsert: prisma.directorEvent.upsert,
  };
  const originalTransaction = prisma.$transaction;
  const workflowService = {
    async getTaskById(taskId) {
      return taskId === task.id ? task : null;
    },
    async getTaskByIdWithoutHealing(taskId) {
      return taskId === task.id ? task : null;
    },
    async updateTaskManyWithRetry(args, transaction) {
      return (transaction ?? prisma).novelWorkflowTask.updateMany(args);
    },
    async retryTask() {
      task.status = "queued";
      task.updatedAt = new Date(task.updatedAt.getTime() + 1);
      return task;
    },
    async applyAutoDirectorLlmOverride() {},
    async cancelTask() {
      task.status = "cancelled";
      task.cancelRequestedAt = new Date();
      task.updatedAt = new Date(task.updatedAt.getTime() + 1);
      return task;
    },
    async requeueTaskForRecovery(taskId, message) {
      requeued.push({ taskId, message });
      task.status = "queued";
      task.pendingManualRecovery = true;
      task.lastError = message;
      task.heartbeatAt = null;
      task.updatedAt = new Date(task.updatedAt.getTime() + 1);
      return task;
    },
    async markTaskFailed(taskId, message) {
      task.status = "failed";
      task.pendingManualRecovery = false;
      task.lastError = message;
      task.updatedAt = new Date(task.updatedAt.getTime() + 1);
      return task;
    },
    async bootstrapTask(input) {
      bootstraps.push(input);
      task.id = input.workflowTaskId?.trim() || (input.novelId ? `takeover-task-${commands.length + 1}` : task.id);
      task.novelId = input.novelId ?? null;
      task.lane = input.lane;
      task.seedPayloadJson = JSON.stringify(input.seedPayload ?? {});
      task.status = "queued";
      task.updatedAt = new Date(task.updatedAt.getTime() + 1);
      return task;
    },
    async startDirectorTaskForNovel(input, options) {
      starts.push({ input, options });
      if (
        options.whenActive === "reject"
        && task.novelId === input.novelId
        && ["queued", "running", "waiting_approval"].includes(task.status)
      ) {
        throw new Error("这本书已有进行中的 AI 任务，请先继续或取消当前任务。");
      }
      task.id = `takeover-task-${starts.length}`;
      task.novelId = input.novelId;
      task.lane = "auto_director";
      task.status = "queued";
      task.updatedAt = new Date(task.updatedAt.getTime() + 1);
      harnessOptions.afterStart?.(task);
      return task;
    },
  };

  prisma.directorRunCommand.findFirst = async ({ where }) => {
    let rows = commands;
    if (where?.novelId) {
      rows = rows.filter((row) => row.novelId === where.novelId);
    }
    if (where?.taskId) {
      rows = rows.filter((row) => row.taskId === where.taskId);
    }
    if (where?.commandType) {
      if (typeof where.commandType === "string") {
        rows = rows.filter((row) => row.commandType === where.commandType);
      } else if (Array.isArray(where.commandType.in)) {
        rows = rows.filter((row) => where.commandType.in.includes(row.commandType));
      }
    }
    if (where?.status) {
      if (typeof where.status === "string") {
        rows = rows.filter((row) => row.status === where.status);
      } else if (Array.isArray(where.status.in)) {
        rows = rows.filter((row) => where.status.in.includes(row.status));
      }
    }
    if (where?.runAfter?.lte) {
      rows = rows.filter((row) => row.runAfter <= where.runAfter.lte);
    }
    return rows[0] ?? null;
  };
  prisma.directorRunCommand.create = async ({ data }) => {
    const row = {
      id: `command-${commands.length + 1}`,
      novelId: data.novelId ?? null,
      leaseOwner: null,
      leaseExpiresAt: null,
      attempt: 0,
      runAfter: new Date(),
      errorMessage: null,
      startedAt: null,
      finishedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...data,
      novelId: data.novelId ?? null,
    };
    commands.push(row);
    harnessOptions.afterCommandCreate?.({ task, command: row });
    return row;
  };
  prisma.directorRunCommand.findUnique = async ({ where }) => (
    commands.find((row) => row.id === where.id) ?? null
  );
  prisma.directorRunCommand.findMany = async ({ where }) => {
    let rows = commands;
    if (typeof where?.status === "string") rows = rows.filter(row=>row.status===where.status);
    if (where?.taskId) {
      rows = rows.filter((row) => row.taskId === where.taskId);
    }
    if (where?.status?.in) {
      rows = rows.filter((row) => where.status.in.includes(row.status));
    }
    if (where?.leaseExpiresAt?.lt) {
      rows = rows.filter((row) => row.leaseExpiresAt && row.leaseExpiresAt < where.leaseExpiresAt.lt);
    }
    return rows.map((row) => ({
      ...row,
      id: row.id,
      taskId: row.taskId,
      commandType: row.commandType,
      attempt: row.attempt,
      payloadJson: row.payloadJson,
    }));
  };
  prisma.directorRunCommand.updateMany = async ({ where, data }) => {
    let count = 0;
    for (const row of commands) {
      if (where?.id) {
        if (typeof where.id === "string" && row.id !== where.id) {
          continue;
        }
        if (Array.isArray(where.id.in) && !where.id.in.includes(row.id)) {
          continue;
        }
      }
      if (where?.taskId && row.taskId !== where.taskId) {
        continue;
      }
      if (where?.leaseOwner && row.leaseOwner !== where.leaseOwner) {
        continue;
      }
      if (where?.status) {
        if (typeof where.status === "string" && row.status !== where.status) {
          continue;
        }
        if (Array.isArray(where.status.in) && !where.status.in.includes(row.status)) {
          continue;
        }
      }
      if (data?.attempt?.increment) {
        row.attempt += data.attempt.increment;
      }
      for (const [key, value] of Object.entries(data ?? {})) {
        if (key !== "attempt") {
          row[key] = value;
        }
      }
      row.updatedAt = new Date();
      count += 1;
    }
    return { count };
  };
  prisma.novelWorkflowTask.findUnique = async ({ where }) => where.id === task.id
    ? {
        novelId: task.novelId,
        lane: task.lane,
        pendingManualRecovery: task.pendingManualRecovery ?? false,
        seedPayloadJson: task.seedPayloadJson ?? null,
      }
    : null;
  prisma.novelWorkflowTask.updateMany = async (args) => {
    taskUpdates.push(args);
    if (args?.where?.id) {
      if (typeof args.where.id === "string" && args.where.id !== task.id) {
        return { count: 0 };
      }
      if (Array.isArray(args.where.id.in) && !args.where.id.in.includes(task.id)) {
        return { count: 0 };
      }
    }
    if (typeof args?.where?.status === "string" && args.where.status !== task.status) {
      return { count: 0 };
    }
    if (Array.isArray(args?.where?.status?.in) && !args.where.status.in.includes(task.status)) {
      return { count: 0 };
    }
    if (args?.where?.pendingManualRecovery === false && task.pendingManualRecovery === true) {
      return { count: 0 };
    }
    if (Array.isArray(args?.where?.OR)) {
      const matchesBranch = args.where.OR.some((branch) => (
        (typeof branch.status === "string" && branch.status === task.status)
        || (Array.isArray(branch.status?.in) && branch.status.in.includes(task.status))
        || (branch.pendingManualRecovery === true && task.pendingManualRecovery === true)
      ));
      if (!matchesBranch) {
        return { count: 0 };
      }
    }
    Object.assign(task, args?.data ?? {});
    task.updatedAt = new Date(task.updatedAt.getTime() + 1);
    return { count: 1 };
  };
  prisma.$transaction = async (callback) => {
    const before = { ...task };
    const commandCount = commands.length;
    try {
      return await callback(prisma);
    } catch (error) {
      commands.length = commandCount;
      Object.assign(task, before);
      if (harnessOptions.preserveConcurrentPause) task.pendingManualRecovery = true;
      throw error;
    }
  };
  prisma.directorStepRun.updateMany = async (args) => {
    stepUpdates.push(args);
    return { count: 1 };
  };
  prisma.generationJob.updateMany = async (args) => {
    jobUpdates.push(args);
    return { count: 1 };
  };
  prisma.generationJob.findUnique = async ({ where }) => (
    pipelineJob && where.id === pipelineJob.id ? pipelineJob : null
  );
  prisma.generationJob.findMany=async()=>harnessOptions.generationJobs??[];
  prisma.directorRun.findUnique = async ({ where }) => (
    where.taskId === task.id
      ? { id: "run-1", novelId: task.novelId }
      : null
  );
  prisma.directorEvent.create = async ({ data }) => {
    directorEvents.push(data);
    return data;
  };
  prisma.directorEvent.upsert = async ({ create }) => {
    directorEvents.push(create);
    return create;
  };

  return {
    commands,
    bootstraps,
    starts,
    requeued,
    task,
    stepUpdates,
    jobUpdates,
    directorEvents,
    taskUpdates,
    service: new DirectorCommandService(workflowService),
    restore() {
      Object.assign(prisma.novel,originalNovel);
      Object.assign(prisma.directorRunCommand, originalDirectorRunCommand);
      Object.assign(prisma.novelWorkflowTask, originalNovelWorkflowTask);
      Object.assign(prisma.directorStepRun, originalDirectorStepRun);
      Object.assign(prisma.generationJob, originalGenerationJob);
      Object.assign(prisma.directorRun, originalDirectorRun);
      Object.assign(prisma.directorEvent, originalDirectorEvent);
      prisma.$transaction = originalTransaction;
    },
  };
}

module.exports = {createTask, createConfirmRequest, createCandidatesRequest, createHarness};
