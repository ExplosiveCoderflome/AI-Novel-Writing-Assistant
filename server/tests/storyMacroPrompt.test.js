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
  storyMacroDecompositionPrompt,
} = require("../dist/prompting/prompts/novel/storyMacro.prompts.js");

test("story macro decomposition prompt explicitly opts out of native json_schema hints", () => {
  const prepared = preparePromptExecution({
    asset: storyMacroDecompositionPrompt,
    promptInput: {
      storyInput: "一个普通人被卷入都市地下规则系统。",
      projectContext: "项目标题：规则快递\n预计章节数：30",
    },
  });

  assert.equal(storyMacroDecompositionPrompt.structuredOutputHint?.mode, "off");
  assert.equal(prepared.messages.length, 2);
});
