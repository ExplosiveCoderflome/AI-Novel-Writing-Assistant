const test = require("node:test");
const assert = require("node:assert/strict");

const { prisma } = require("../dist/db/prisma.js");
const { secretStore } = require("../dist/services/settings/secretStore/index.js");
const { llmConnectivityService } = require("../dist/llm/connectivity.js");
const quickSetup = require("../dist/modules/setup/onboarding/application/QuickSetupService.js");
const firstNovel = require("../dist/modules/setup/onboarding/application/FirstNovelOnboardingService.js");

function restore(target, originals) {
  for (const [key, value] of Object.entries(originals)) {
    target[key] = value;
  }
}

test("quick setup applies a verified model to every core creative route without exposing the key", async () => {
  const secretOriginals = {
    getProvider: secretStore.getProvider,
    upsertProvider: secretStore.upsertProvider,
    listProviders: secretStore.listProviders,
  };
  const connectivityOriginal = llmConnectivityService.testConnection;
  const appSettingOriginals = {
    findUnique: prisma.appSetting.findUnique,
    upsert: prisma.appSetting.upsert,
  };
  const routeOriginals = {
    findUnique: prisma.modelRouteConfig.findUnique,
    upsert: prisma.modelRouteConfig.upsert,
  };
  const savedRoutes = new Map();
  let savedProvider = null;
  let selection = null;

  secretStore.getProvider = async () => null;
  secretStore.upsertProvider = async (provider, input) => {
    savedProvider = { provider, ...input };
    return {
      provider,
      displayName: input.displayName ?? null,
      key: input.key ?? null,
      model: input.model ?? null,
      baseURL: input.baseURL ?? null,
      isActive: true,
      reasoningEnabled: true,
      concurrencyLimit: 0,
      requestIntervalMs: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  };
  secretStore.listProviders = async () => savedProvider ? [{
    ...savedProvider,
    displayName: null,
    isActive: true,
    reasoningEnabled: true,
    concurrencyLimit: 0,
    requestIntervalMs: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  }] : [];
  llmConnectivityService.testConnection = async ({ provider, model }) => ({
    provider,
    model,
    ok: true,
    latency: 5,
    error: null,
    requestProtocol: "openai_compatible",
    plain: {
      ok: true,
      latency: 3,
      error: null,
      requestProtocol: "openai_compatible",
    },
    structured: {
      ok: true,
      latency: 5,
      error: null,
      requestProtocol: "openai_compatible",
      strategy: "json_object",
      reasoningForcedOff: false,
      fallbackAvailable: false,
      fallbackUsed: false,
      errorCategory: null,
      nativeJsonObject: true,
      nativeJsonSchema: false,
      profileFamily: "openai",
    },
  });
  prisma.appSetting.findUnique = async () => selection
    ? { key: "llm.currentSelection", value: selection }
    : null;
  prisma.appSetting.upsert = async ({ update }) => {
    selection = update.value;
    return { key: "llm.currentSelection", value: selection };
  };
  prisma.modelRouteConfig.findUnique = async ({ where }) => savedRoutes.get(where.taskType) ?? null;
  prisma.modelRouteConfig.upsert = async ({ where, create, update }) => {
    const value = { ...(savedRoutes.get(where.taskType) ? update : create) };
    savedRoutes.set(where.taskType, value);
    return value;
  };

  try {
    const result = await quickSetup.completeQuickSetup({
      providerKind: "builtin",
      provider: "deepseek",
      apiKey: "secret-test-key",
      baseURL: "https://api.deepseek.com/v1",
      model: "deepseek-chat",
    });
    assert.equal(result.status.readyForCreation, true);
    assert.equal(result.status.routeCoverage.configured, result.status.routeCoverage.total);
    assert.equal(savedRoutes.size, result.status.routeCoverage.total);
    assert.equal(result.provider, "deepseek");
    assert.equal(JSON.stringify(result).includes("secret-test-key"), false);
  } finally {
    restore(secretStore, secretOriginals);
    llmConnectivityService.testConnection = connectivityOriginal;
    restore(prisma.appSetting, appSettingOriginals);
    restore(prisma.modelRouteConfig, routeOriginals);
  }
});

test("first novel onboarding graduates only when a readable completed chapter exists", async () => {
  const chapterOriginal = prisma.chapter.findFirst;
  const taskOriginal = prisma.novelWorkflowTask.findFirst;
  const novelOriginal = prisma.novel.findFirst;
  const quickStatusOriginal = quickSetup.getQuickSetupStatus;

  quickSetup.getQuickSetupStatus = async () => ({
    readyForCreation: true,
    providers: [],
    selectedProvider: "deepseek",
    selectedModel: "deepseek-chat",
    routeCoverage: { configured: 11, total: 11, missingTaskTypes: [] },
    blockingReasons: [],
    recommendedAction: "start_creating",
  });
  prisma.chapter.findFirst = async () => ({
    id: "chapter-1",
    title: "第一章 来电",
    order: 1,
    novelId: "novel-1",
    novel: {
      id: "novel-1",
      title: "当我拨通死亡电话",
      creationExperience: "simple",
    },
  });
  prisma.novelWorkflowTask.findFirst = async () => ({
    id: "task-1",
    novelId: "novel-1",
    status: "running",
    checkpointType: null,
    currentStage: "chapter_execution",
    currentItemLabel: "生成第二章",
    lastError: null,
    novel: {
      id: "novel-1",
      title: "当我拨通死亡电话",
      creationExperience: "simple",
    },
  });
  prisma.novel.findFirst = async () => null;

  try {
    const projection = await firstNovel.getFirstNovelOnboardingProjection();
    assert.equal(projection.graduated, true);
    assert.equal(projection.completedCount, 5);
    assert.equal(projection.primaryAction.label, "阅读第一章");
    assert.ok(projection.milestones.every((milestone) => milestone.status === "completed"));
  } finally {
    prisma.chapter.findFirst = chapterOriginal;
    prisma.novelWorkflowTask.findFirst = taskOriginal;
    prisma.novel.findFirst = novelOriginal;
    quickSetup.getQuickSetupStatus = quickStatusOriginal;
  }
});

test("first novel onboarding exposes production handoff as the single next action", async () => {
  const chapterOriginal = prisma.chapter.findFirst;
  const taskOriginal = prisma.novelWorkflowTask.findFirst;
  const novelOriginal = prisma.novel.findFirst;
  const quickStatusOriginal = quickSetup.getQuickSetupStatus;

  quickSetup.getQuickSetupStatus = async () => ({
    readyForCreation: true,
    providers: [],
    selectedProvider: "deepseek",
    selectedModel: "deepseek-chat",
    routeCoverage: { configured: 11, total: 11, missingTaskTypes: [] },
    blockingReasons: [],
    recommendedAction: "start_creating",
  });
  prisma.chapter.findFirst = async () => null;
  prisma.novelWorkflowTask.findFirst = async () => ({
    id: "task-handoff",
    novelId: "novel-handoff",
    status: "waiting_approval",
    checkpointType: "production_experience_required",
    currentStage: "structured_outline",
    currentItemLabel: "等待选择生产方式",
    lastError: null,
    novel: {
      id: "novel-handoff",
      title: "新手的第一本书",
      creationExperience: "professional",
    },
  });
  prisma.novel.findFirst = async () => null;

  try {
    const projection = await firstNovel.getFirstNovelOnboardingProjection();
    assert.equal(projection.graduated, false);
    assert.equal(projection.currentMilestone, "production_choice");
    assert.equal(projection.primaryAction.label, "选择生产方式");
    assert.match(projection.primaryAction.route, /directorTaskId=task-handoff/);
    assert.equal(
      projection.milestones.find((milestone) => milestone.key === "production_choice").status,
      "current",
    );
  } finally {
    prisma.chapter.findFirst = chapterOriginal;
    prisma.novelWorkflowTask.findFirst = taskOriginal;
    prisma.novel.findFirst = novelOriginal;
    quickSetup.getQuickSetupStatus = quickStatusOriginal;
  }
});
