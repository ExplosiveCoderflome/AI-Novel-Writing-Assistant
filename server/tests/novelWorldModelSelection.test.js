const test = require("node:test");
const assert = require("node:assert/strict");

const { prisma } = require("../dist/db/prisma.js");
const { setPromptRunnerStructuredInvokerForTests } = require("../dist/prompting/core/promptRunner.js");
const { NovelWorldInstanceService } = require("../dist/services/novel/worldContext/NovelWorldInstanceService.js");
const { novelThemeWorldGenerationPrompt } = require("../dist/prompting/prompts/world/world.prompts.js");

test("generating a novel world keeps the selected model instead of forcing DeepSeek", async () => {
  const originalNovel = prisma.novel;
  const captured = [];
  prisma.novel = {
    findUnique: async () => ({
      id: "novel-1",
      title: "测试小说",
      description: null,
      targetAudience: null,
      bookSellingPoint: null,
      first30ChapterPromise: null,
      commercialTagsJson: null,
      genre: null,
      primaryStoryMode: null,
      secondaryStoryMode: null,
    }),
  };
  setPromptRunnerStructuredInvokerForTests(async (input) => {
    captured.push(input);
    throw new Error("stop after capturing model selection");
  });

  try {
    const service = new NovelWorldInstanceService();
    await assert.rejects(
      () => service.generateFromNovelTheme({
        novelId: "novel-1",
        provider: "ollama",
        model: "qwen3:8b",
        temperature: 0.35,
      }),
      /stop after capturing model selection/,
    );

    assert.equal(captured[0].provider, "ollama");
    assert.equal(captured[0].model, "qwen3:8b");
    assert.equal(captured[0].temperature, 0.35);
    assert.equal(captured[0].maxTokens, 4_800);
    assert.equal(captured[0].timeoutMs, 120_000);
    assert.equal(captured[0].maxRepairAttempts, 0);
  } finally {
    prisma.novel = originalNovel;
    setPromptRunnerStructuredInvokerForTests();
  }
});

test("novel theme world prompt stays within a one-shot JSON budget", () => {
  const messages = novelThemeWorldGenerationPrompt.render({
    novelTitle: "测试小说",
    description: "都市调查故事",
    targetAudience: "成年读者",
    bookSellingPoint: "高压反转",
    first30ChapterPromise: "主角进入事件核心",
    commercialTags: ["都市", "悬疑"],
    genreName: "都市",
    primaryStoryModeName: "悬疑",
    secondaryStoryModeName: "成长",
  }, {
    blocks: [],
    selectedBlockIds: [],
    droppedBlockIds: [],
    summarizedBlockIds: [],
    estimatedInputTokens: 0,
  });

  assert.equal(novelThemeWorldGenerationPrompt.version, "v2");
  assert.equal(novelThemeWorldGenerationPrompt.repairPolicy.maxAttempts, 0);
  assert.match(String(messages[0].content), /输出容量硬约束/);
  assert.match(String(messages[0].content), /1,800 个汉字以内/);
});
