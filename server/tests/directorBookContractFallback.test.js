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
const {
  runDirectorBookContractPhase,
} = require("../dist/services/novel/director/novelDirectorStoryMacroPhase.js");

function buildConfirmRequest(overrides = {}) {
  return {
    idea: "A courier discovers a hidden rule-bound city underworld.",
    title: "Rulebound Courier",
    narrativePov: "third_person",
    pacePreference: "balanced",
    emotionIntensity: "medium",
    aiFreedom: "medium",
    projectMode: "ai_led",
    writingMode: "original",
    estimatedChapterCount: 30,
    runMode: "auto_to_execution",
    provider: "openai",
    model: "gpt-5.4",
    workflowTaskId: "task-book-contract-fallback",
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
    ...overrides,
  };
}

test("director book contract phase falls back to direct chat completion on transport_error", async (t) => {
  let persistedDraft = null;
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
                readingPromise: "持续兑现规则压迫下的反压快感。",
                protagonistFantasy: "主角能把压在自己身上的规则转成反击他人的杠杆。",
                coreSellingPoint: "底层跑腿者在都市暗规则系统里越挫越强。",
                chapter3Payoff: "前三章必须让主角吃到第一轮规则反杀的回报。",
                chapter10Payoff: "十章左右形成第一阶段站稳脚跟并看见更深黑幕。",
                chapter30Payoff: "三十章左右完成一次足以改写主角位置的大跃迁。",
                escalationLadder: "从保命跑腿到借规则上位，再到反制规则制定者。",
                relationshipMainline: "主角与规则掌控层之间的互相试探与反制持续推动全书。",
                absoluteRedLines: [
                  "不能把规则系统写成随时改口的万能外挂。",
                  "不能让主角长时间只被动挨打而没有策略性反压。",
                  "不能为了堆设定牺牲都市压迫感和底层生存质感。",
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
    global.fetch = originalFetch;
  });

  await assert.doesNotReject(async () => {
    await runDirectorBookContractPhase({
      taskId: "task-book-contract-fallback",
      novelId: "novel-book-contract-fallback",
      request: buildConfirmRequest(),
      dependencies: {
        storyMacroService: {
          async getPlan() {
            return null;
          },
        },
        bookContractService: {
          async upsert(_novelId, draft) {
            persistedDraft = draft;
            return { id: "contract-1", novelId: _novelId, ...draft };
          },
        },
      },
      callbacks: {
        async markDirectorTaskRunning() {},
      },
    });
  });

  assert.ok(fetchCalls >= 1);
  assert.ok(persistedDraft);
  assert.equal(persistedDraft.readingPromise, "持续兑现规则压迫下的反压快感。");
  assert.deepEqual(persistedDraft.absoluteRedLines, [
    "不能把规则系统写成随时改口的万能外挂。",
    "不能让主角长时间只被动挨打而没有策略性反压。",
    "不能为了堆设定牺牲都市压迫感和底层生存质感。",
  ]);
});
