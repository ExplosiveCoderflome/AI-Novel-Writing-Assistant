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
    },
  },
};

const structuredInvoke = require("../dist/llm/structuredInvoke.js");
const { novelFramingSuggestionService } = require("../dist/services/novel/NovelFramingSuggestionService.js");
const { relaxGeneratedContentSchema } = require("../dist/llm/generatedContentSchema.js");
const { novelFramingSuggestionPrompt } = require("../dist/prompting/prompts/novel/framing.prompts.js");
const { preparePromptExecution } = require("../dist/prompting/core/promptRunner.js");

test("novel framing suggestion service returns structured framing output when structured prompt invocation succeeds", async (t) => {
  const originalInvokeStructured = structuredInvoke.invokeStructuredLlmDetailed;
  structuredInvoke.invokeStructuredLlmDetailed = async (input) => {
    assert.equal(input.label, "novel.framing.suggest@v1");
    return {
      data: {
        targetAudience: "爱看都市逆袭和关系拉扯的读者",
        commercialTags: ["都市逆袭", "强冲突", "关系拉扯"],
        competingFeel: "现实压迫感强，反击节奏快，关系推进有拉扯感",
        bookSellingPoint: "主角每次破局都会撬动更大的利益链和关系链",
        first30ChapterPromise: "前30章必须让读者看到主线启动、第一次强反击和核心对手浮出水面",
      },
      repairUsed: false,
      repairAttempts: 0,
      diagnostics: {},
    };
  };

  t.after(() => {
    structuredInvoke.invokeStructuredLlmDetailed = originalInvokeStructured;
  });

  const result = await novelFramingSuggestionService.suggest({
    title: "逆袭上位",
    description: "一个底层年轻人被卷入复杂利益局后开始反击。",
  });

  assert.equal(result.targetAudience, "爱看都市逆袭和关系拉扯的读者");
  assert.deepEqual(result.commercialTags, ["都市逆袭", "强冲突", "关系拉扯"]);
});

test("novel framing structured schema can be relaxed without crashing on array fields", () => {
  assert.doesNotThrow(() => relaxGeneratedContentSchema(novelFramingSuggestionPrompt.outputSchema));
});

test("novel framing prompt explicitly opts out of native json_schema hints", () => {
  const prepared = preparePromptExecution({
    asset: novelFramingSuggestionPrompt,
    promptInput: {
      inputSummary: "书名：逆袭上位\n一句话概述：一个底层年轻人被卷入复杂利益局后开始反击。",
    },
  });

  assert.equal(novelFramingSuggestionPrompt.structuredOutputHint?.mode, "off");
  assert.equal(prepared.messages.length, 2);
});
