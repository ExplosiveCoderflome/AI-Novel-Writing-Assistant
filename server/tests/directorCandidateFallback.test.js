const test = require("node:test");
const assert = require("node:assert/strict");

const prismaModulePath = require.resolve("../dist/db/prisma.js");
require.cache[prismaModulePath] = {
  id: prismaModulePath,
  filename: prismaModulePath,
  loaded: true,
  exports: {
    prisma: {
      aPIKey: {
        findUnique: async ({ where } = {}) => ({
          id: `key-${where?.provider ?? "openai"}`,
          provider: where?.provider ?? "openai",
          key: "test-openai-key",
          model: "gpt-5.4",
          baseURL: "https://example.invalid/v1",
          isActive: true,
          reasoningEnabled: true,
        }),
        findMany: async () => [],
      },
      llmModelRoute: {
        findMany: async () => [],
      },
      appSetting: {
        findMany: async () => [],
      },
    },
  },
};

const promptRunner = require("../dist/prompting/core/promptRunner.js");
const { titleGenerationService } = require("../dist/services/title/TitleGenerationService.js");
const {
  NovelDirectorCandidateStageService,
} = require("../dist/services/novel/director/novelDirectorCandidateStage.js");

function createWorkflowServiceStub() {
  return {
    async bootstrapTask(input) {
      return {
        id: input.workflowTaskId ?? "task-director-candidate-fallback",
      };
    },
    async markTaskRunning() {},
    async recordCandidateSelectionRequired() {},
  };
}

function buildGenerateRequest(overrides = {}) {
  return {
    idea: "一个底层跑腿员发现城市地下存在会吞人的隐形规则系统。",
    workflowTaskId: "task-director-candidate-generate",
    provider: "openai",
    model: "gpt-5.4",
    temperature: 0.45,
    title: "规则快递",
    description: "底层跑腿员被卷入看不见的都市规则网络，只能借规则反压更高位的人。",
    targetAudience: "爱看都市高压、规则反杀和持续升级的读者",
    bookSellingPoint: "规则压迫下的底层反压",
    competingFeel: "高压都市感，反击节奏快",
    first30ChapterPromise: "前三十章持续兑现压迫、反压和更深黑幕",
    commercialTags: ["规则怪谈", "都市逆袭", "持续反压"],
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

function buildPatchRequest(previousBatches, overrides = {}) {
  return {
    ...buildGenerateRequest({
      workflowTaskId: "task-director-candidate-patch",
    }),
    previousBatches,
    batchId: previousBatches[0].id,
    candidateId: previousBatches[0].candidates[0].id,
    feedback: "保持规则反压主轴，但把都市现实感再压得更实一点。",
    presets: ["more_grounded"],
    ...overrides,
  };
}

function buildFallbackBatch() {
  return [
    {
      id: "batch-existing",
      round: 1,
      roundLabel: "第 1 轮",
      idea: "一个底层跑腿员发现城市地下存在会吞人的隐形规则系统。",
      refinementSummary: null,
      presets: [],
      createdAt: "2026-05-10T00:00:00.000Z",
      candidates: [
        {
          id: "candidate-existing",
          workingTitle: "规则快递员",
          titleOptions: [],
          logline: "底层跑腿员误入隐形规则网络，为了活命只能边学边反压制定规则的人。",
          positioning: "都市规则反杀成长文",
          sellingPoint: "都市高压规则系统下的底层反压升级",
          coreConflict: "主角越想脱身，越必须利用追杀自己的规则。",
          protagonistPath: "从只会保命的跑腿员变成敢于反制规则制定者的人。",
          endingDirection: "代价沉重但撕开更高层黑幕。",
          hookStrategy: "每次跑单都撞上一条更凶的规则和更高位的敌人。",
          progressionLoop: "发现规则，试图借力破局，引来更强反噬，再逼出更深真相。",
          whyItFits: "兼顾都市压迫、规则钩子和持续升级。",
          toneKeywords: ["都市", "规则", "反压"],
          targetChapterCount: 30,
        },
      ],
    },
  ];
}

test("director candidate generation falls back to direct chat completion on transport_error", async (t) => {
  let fetchCalls = 0;
  const originalFetch = global.fetch;
  const originalGenerateTitleIdeas = titleGenerationService.generateTitleIdeas;

  promptRunner.setPromptRunnerStructuredInvokerForTests(async () => {
    throw new Error("[STRUCTURED_OUTPUT:transport_error] Cannot read properties of undefined (reading 'map')");
  });
  titleGenerationService.generateTitleIdeas = async () => ({
    titles: [
      {
        title: "地铁规则快递员",
        clickRate: 81,
        style: "high_concept",
        angle: "规则都市",
        reason: "把都市规则感和主角职业直接打在封面上。",
      },
    ],
  });
  global.fetch = async () => {
    fetchCalls += 1;
    return {
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                candidates: [
                  {
                    workingTitle: "规则快递员",
                    logline: "底层跑腿员误入隐形规则网络，为了活命只能边学边反压制定规则的人。",
                    positioning: "都市规则反杀成长文",
                    sellingPoint: "都市高压规则系统下的底层反压升级",
                    coreConflict: "主角越想脱身，越必须利用追杀自己的规则。",
                    protagonistPath: "从只会保命的跑腿员变成敢于反制规则制定者的人。",
                    endingDirection: "代价沉重但撕开更高层黑幕。",
                    hookStrategy: "每次跑单都撞上一条更凶的规则和更高位的敌人。",
                    progressionLoop: "发现规则，试图借力破局，引来更强反噬，再逼出更深真相。",
                    whyItFits: "兼顾都市压迫、规则钩子和持续升级。",
                    toneKeywords: ["都市", "规则", "反压"],
                    targetChapterCount: 30,
                  },
                  {
                    workingTitle: "夜单禁区",
                    logline: "夜班配送员被迫进入只在凌晨开启的禁区线路，每完成一次配送都得替更高层承担代价。",
                    positioning: "都市禁区规则悬压文",
                    sellingPoint: "每单都像闯关，每次通关都把主角推向更危险的上层视野。",
                    coreConflict: "主角必须在保命接单和借单逆袭之间做越来越危险的选择。",
                    protagonistPath: "从被线路驱赶的夜班工具人，成长为能反向操盘禁区线路的人。",
                    endingDirection: "拿到向上撕开的资格，但也正式踏入更黑的规则核心。",
                    hookStrategy: "每条禁区夜单都先给主角一个回报，再立刻加码更大的追杀。",
                    progressionLoop: "接到异常夜单，完成代价任务，吃到短期回报，引来更大压迫，逼出更深规则。",
                    whyItFits: "保留都市高压和持续升级，同时加强连载型任务驱动。",
                    toneKeywords: ["都市", "禁区", "高压"],
                    targetChapterCount: 32,
                  },
                ],
              }),
            },
          },
        ],
      }),
    };
  };

  t.after(() => {
    promptRunner.setPromptRunnerStructuredInvokerForTests();
    titleGenerationService.generateTitleIdeas = originalGenerateTitleIdeas;
    global.fetch = originalFetch;
  });

  const service = new NovelDirectorCandidateStageService(createWorkflowServiceStub());
  const result = await service.generateCandidates(buildGenerateRequest());

  assert.ok(fetchCalls >= 1);
  assert.equal(result.batch.candidates.length, 2);
  assert.equal(result.batch.candidates[0].workingTitle, "地铁规则快递员");
  assert.equal(result.batch.candidates[1].titleOptions[0].title, "地铁规则快递员");
});

test("director candidate patch falls back to direct chat completion on transport_error", async (t) => {
  let fetchCalls = 0;
  const originalFetch = global.fetch;
  const originalGenerateTitleIdeas = titleGenerationService.generateTitleIdeas;
  const previousBatches = buildFallbackBatch();

  promptRunner.setPromptRunnerStructuredInvokerForTests(async () => {
    throw new Error("[STRUCTURED_OUTPUT:transport_error] Cannot read properties of undefined (reading 'map')");
  });
  titleGenerationService.generateTitleIdeas = async () => ({
    titles: [
      {
        title: "规则地铁跑单人",
        clickRate: 84,
        style: "conflict",
        angle: "职业压迫",
        reason: "把规则压迫和跑单职业并在一个标题里。",
      },
    ],
  });
  global.fetch = async () => {
    fetchCalls += 1;
    return {
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                workingTitle: "地铁规则跑单人",
                logline: "地铁跑单员被城市规则系统盯上后，只能在更真实的都市缝隙里一边讨生活一边反压上层节点。",
                positioning: "更贴地都市规则反压文",
                sellingPoint: "把都市底层生存质感和规则反杀钩子绑在同一条主线里。",
                coreConflict: "主角每想守住现实生活，就必须更深入地利用吞人的规则体系。",
                protagonistPath: "从只求少赔少死的跑单员，成长为敢拿现实秩序反卡规则网络的人。",
                endingDirection: "先守住自己的现实位置，再撬开更高层规则入口。",
                hookStrategy: "每次现实生活里的小喘息，都会被下一条更狠的规则立刻打断。",
                progressionLoop: "现实跑单求生，撞上异常规则，借都市经验临时反杀，再被卷入更深节点。",
                whyItFits: "保留规则反压主轴，同时把都市生活压力和现实感落得更实。",
                toneKeywords: ["都市", "现实", "反压"],
                targetChapterCount: 30,
              }),
            },
          },
        ],
      }),
    };
  };

  t.after(() => {
    promptRunner.setPromptRunnerStructuredInvokerForTests();
    titleGenerationService.generateTitleIdeas = originalGenerateTitleIdeas;
    global.fetch = originalFetch;
  });

  const service = new NovelDirectorCandidateStageService(createWorkflowServiceStub());
  const result = await service.patchCandidate(buildPatchRequest(previousBatches));

  assert.ok(fetchCalls >= 1);
  assert.equal(result.candidate.workingTitle, "规则地铁跑单人");
  assert.equal(result.candidate.positioning, "更贴地都市规则反压文");
  assert.equal(result.batch.candidates[0].id, "candidate-existing");
  assert.equal(result.batch.candidates[0].titleOptions[0].title, "规则地铁跑单人");
});
