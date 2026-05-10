const test = require("node:test");
const assert = require("node:assert/strict");

const prismaModulePath = require.resolve("../dist/db/prisma.js");
require.cache[prismaModulePath] = {
  id: prismaModulePath,
  filename: prismaModulePath,
  loaded: true,
  exports: {
    prisma: {
      novel: {
        findUnique: async () => ({
          id: "novel-story-macro-fallback",
          title: "规则快递",
          targetAudience: "爱看都市高压、规则反杀和持续升级的读者",
          bookSellingPoint: "规则系统压迫下的底层反压",
          competingFeel: "高压都市感，反击节奏快",
          first30ChapterPromise: "前三十章持续兑现压迫、反压和更深黑幕",
          commercialTagsJson: JSON.stringify(["规则怪谈", "都市逆袭", "持续反压"]),
          styleTone: "冷硬、压迫、快节奏",
          narrativePov: "third_person",
          pacePreference: "balanced",
          emotionIntensity: "medium",
          estimatedChapterCount: 30,
          genre: { name: "都市异能" },
          primaryStoryMode: null,
          secondaryStoryMode: null,
        }),
      },
      storyMacroPlan: {
        findUnique: async () => null,
        upsert: async ({ where, create }) => ({
          id: "story-macro-row-1",
          novelId: where.novelId,
          storyInput: create.storyInput,
          expansionJson: create.expansionJson,
          decompositionJson: create.decompositionJson,
          issuesJson: create.issuesJson,
          lockedFieldsJson: create.lockedFieldsJson,
          constraintEngineJson: create.constraintEngineJson,
          stateJson: create.stateJson,
          createdAt: new Date("2026-05-10T00:00:00.000Z"),
          updatedAt: new Date("2026-05-10T00:00:00.000Z"),
        }),
      },
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
const { StoryMacroPlanService } = require("../dist/services/novel/storyMacro/StoryMacroPlanService.js");

test("story macro decomposition falls back to direct chat completion on transport_error", async (t) => {
  let fetchCalls = 0;
  const originalFetch = global.fetch;

  promptRunner.setPromptRunnerStructuredInvokerForTests(async () => {
    throw new Error("[STRUCTURED_OUTPUT:transport_error] Cannot read properties of undefined (reading 'map')");
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
                expansion: {
                  expanded_premise: "主角被卷入一座被隐形规则统治的都市地下系统，越想脱身越被规则反咬，只能学会借规则反压更高位的掌控者。",
                  protagonist_core: "主角是被城市系统边缘化的普通跑腿者，外在被规则困死，内在既怕失控又不甘继续任人拿捏，具备从保命到反制的变化空间。",
                  conflict_engine: "每次主角破解一条局部规则，都会暴露更高层的收割机制，引来更强压迫，同时逼他付出更大代价。",
                  conflict_layers: {
                    external: "城市地下规则网络持续追杀和收编主角。",
                    internal: "主角必须在保命本能与夺回主动权之间不断撕裂。",
                    relational: "主角与利用他、观察他、试图收编他的人之间持续博弈。",
                  },
                  mystery_box: "这座城市真正制定规则的人为什么要层层筛选和逼迫像主角这样的人。",
                  emotional_line: "从高压求生到试探反压，再到发现自己也可能成为规则一部分的恐惧与反击。",
                  setpiece_seeds: [
                    "主角第一次在深夜配送中触发规则反噬，被迫用一条禁忌规则反杀追捕者。",
                    "主角在公开场合被规则系统钉上标记，只能在众目睽睽下完成一次反压逆转。",
                  ],
                  tone_reference: "都市高压、冷硬规则、持续反压、真相越挖越危险。",
                },
                decomposition: {
                  selling_point: "底层跑腿者在都市暗规则系统里一路反压上位。",
                  core_conflict: "主角越想活下去，就越要利用并破坏追杀自己的规则系统。",
                  main_hook: "主角究竟为何会被这套城市规则盯上，而规则尽头又在筛选什么人。",
                  progression_loop: "发现一条新规则，试图利用它破局，引来更高层反噬，再逼出更深一层规则真相。",
                  growth_path: "从只想保命的普通人，成长为敢于反向操控规则并挑战制定者的行动者。",
                  major_payoffs: [
                    "主角第一次完成规则反杀并拿到能撬动局势的线索。",
                    "主角发现自己并非偶然入局，而是早被某个高层节点盯上。",
                  ],
                  ending_flavor: "代价沉重但带着向上撕开的突破感。",
                },
                constraints: [
                  "规则必须始终具备清晰代价，不能变成万能外挂。",
                  "每次主角反压都必须伴随更强反噬或更深层真相暴露。",
                ],
                issues: [],
              }),
            },
          },
        ],
      }),
    };
  };

  t.after(() => {
    promptRunner.setPromptRunnerStructuredInvokerForTests();
    global.fetch = originalFetch;
  });

  const service = new StoryMacroPlanService();
  const plan = await service.decompose(
    "novel-story-macro-fallback",
    "一个底层跑腿者发现城市地下存在一套会吞人的隐形规则系统。",
    { provider: "openai", model: "gpt-5.4", temperature: 0.3 },
  );

  assert.ok(fetchCalls >= 1);
  assert.equal(plan.expansion?.expanded_premise.includes("隐形规则统治"), true);
  assert.equal(plan.decomposition?.selling_point, "底层跑腿者在都市暗规则系统里一路反压上位。");
  assert.deepEqual(plan.constraints, [
    "规则必须始终具备清晰代价，不能变成万能外挂。",
    "每次主角反压都必须伴随更强反噬或更深层真相暴露。",
  ]);
});
