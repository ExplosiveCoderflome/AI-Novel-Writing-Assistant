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
        findUnique: async () => null,
        findMany: async () => [],
      },
      appSetting: {
        findMany: async () => [],
      },
    },
  },
};

const { preparePromptExecution } = require("../dist/prompting/core/promptRunner.js");
const {
  directorBookContractPrompt,
} = require("../dist/prompting/prompts/novel/directorPlanning.prompts.js");

test("director book contract prompt explicitly opts out of native json_schema hints", () => {
  const prepared = preparePromptExecution({
    asset: directorBookContractPrompt,
    promptInput: {
      idea: "示例灵感",
      context: {
        title: "示例书名",
        narrativePov: "third_person",
        pacePreference: "balanced",
        emotionIntensity: "medium",
        aiFreedom: "medium",
        projectMode: "ai_led",
        writingMode: "original",
        estimatedChapterCount: 30,
        candidate: undefined,
      },
      candidate: {
        id: "candidate_1",
        workingTitle: "示例书名",
        logline: "示例 logline",
        positioning: "示例定位",
        sellingPoint: "示例卖点",
        coreConflict: "示例冲突",
        protagonistPath: "示例成长路径",
        endingDirection: "示例结局方向",
        hookStrategy: "示例钩子",
        progressionLoop: "示例推进循环",
        whyItFits: "示例适配原因",
        toneKeywords: ["都市", "成长"],
        targetChapterCount: 30,
      },
      storyMacroPlan: null,
      targetChapterCount: 30,
    },
  });

  assert.equal(directorBookContractPrompt.structuredOutputHint?.mode, "off");
  assert.equal(prepared.messages.length, 2);
});
