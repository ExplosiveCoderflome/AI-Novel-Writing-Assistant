const { describe, test } = require("node:test");
const assert = require("node:assert/strict");

const { prisma } = require("../dist/db/prisma.js");
const { setPromptRunnerStructuredInvokerForTests } = require("../dist/prompting/core/promptRunner.js");
const { generateWorldSkeleton } = require("../dist/services/world/worldSkeletonGeneration.js");
const { NovelWorldInstanceService } = require("../dist/services/novel/worldContext/NovelWorldInstanceService.js");
const { STYLE_EXTRACTION_TIMEOUT_MS_KEY } = require("../dist/services/settings/StyleEngineRuntimeSettingsService.js");
const {
  DEFAULT_WORLD_GENERATION_TIMEOUT_MS,
  MAX_WORLD_GENERATION_TIMEOUT_MS,
  MIN_WORLD_GENERATION_TIMEOUT_MS,
  WORLD_GENERATION_TIMEOUT_MS_KEY,
  getWorldGenerationTimeoutSettings,
  saveWorldGenerationTimeoutSettings,
  setWorldGenerationTimeoutForTests,
} = require("../dist/services/settings/worldGeneration/timeoutSettings.js");

function novelRecord() {
  return {
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
  };
}

async function restoreSetting(key, original) {
  if (original) {
    await prisma.appSetting.upsert({
      where: { key },
      update: { value: original.value },
      create: { key, value: original.value },
    });
    return;
  }
  await prisma.appSetting.deleteMany({ where: { key } });
}

describe("world generation timeout", { concurrency: 1 }, () => {
  test("defaults to 120 seconds and rejects values outside 2 to 10 minutes", async () => {
    const original = await prisma.appSetting.findUnique({
      where: { key: WORLD_GENERATION_TIMEOUT_MS_KEY },
    });
    const styleBefore = await prisma.appSetting.findUnique({
      where: { key: STYLE_EXTRACTION_TIMEOUT_MS_KEY },
    });
    setWorldGenerationTimeoutForTests();
    try {
      await prisma.appSetting.deleteMany({ where: { key: WORLD_GENERATION_TIMEOUT_MS_KEY } });
      const settings = await getWorldGenerationTimeoutSettings();
      assert.equal(settings.timeoutMs, DEFAULT_WORLD_GENERATION_TIMEOUT_MS);
      assert.equal(settings.defaultTimeoutMs, 120_000);
      assert.equal(settings.minTimeoutMs, MIN_WORLD_GENERATION_TIMEOUT_MS);
      assert.equal(settings.maxTimeoutMs, MAX_WORLD_GENERATION_TIMEOUT_MS);

      await assert.rejects(
        () => saveWorldGenerationTimeoutSettings({ timeoutMs: 60_000 }),
        /2 到 10 分钟/,
      );
      await assert.rejects(
        () => saveWorldGenerationTimeoutSettings({ timeoutMs: 660_000 }),
        /2 到 10 分钟/,
      );
      const styleAfter = await prisma.appSetting.findUnique({
        where: { key: STYLE_EXTRACTION_TIMEOUT_MS_KEY },
      });
      assert.equal(styleAfter?.value ?? null, styleBefore?.value ?? null);
    } finally {
      await restoreSetting(WORLD_GENERATION_TIMEOUT_MS_KEY, original);
    }
  });

  test("saved timeout is used by theme world and skeleton generation", async () => {
    const original = await prisma.appSetting.findUnique({
      where: { key: WORLD_GENERATION_TIMEOUT_MS_KEY },
    });
    const styleBefore = await prisma.appSetting.findUnique({
      where: { key: STYLE_EXTRACTION_TIMEOUT_MS_KEY },
    });
    const originalNovel = prisma.novel;
    const captured = [];
    prisma.novel = { findUnique: async () => novelRecord() };
    setWorldGenerationTimeoutForTests();
    setPromptRunnerStructuredInvokerForTests(async (input) => {
      captured.push(input);
      throw new Error("stop after capturing timeout");
    });
    try {
      await saveWorldGenerationTimeoutSettings({ timeoutMs: 600_000 });
      const service = new NovelWorldInstanceService();
      await assert.rejects(
        () => service.generateFromNovelTheme({
          novelId: "novel-1",
          provider: "ollama",
          model: "qwen3:8b",
        }),
        /stop after capturing timeout/,
      );
      await assert.rejects(
        () => generateWorldSkeleton({ idea: "一座雨城" }),
        /stop after capturing timeout/,
      );
      assert.equal(captured[0].timeoutMs, 600_000);
      assert.equal(captured[1].timeoutMs, 600_000);
      const styleAfter = await prisma.appSetting.findUnique({
        where: { key: STYLE_EXTRACTION_TIMEOUT_MS_KEY },
      });
      assert.equal(styleAfter?.value ?? null, styleBefore?.value ?? null);
    } finally {
      prisma.novel = originalNovel;
      setPromptRunnerStructuredInvokerForTests();
      setWorldGenerationTimeoutForTests();
      await restoreSetting(WORLD_GENERATION_TIMEOUT_MS_KEY, original);
    }
  });

  test("timeout failures tell the user where to raise the wait", async () => {
    const originalNovel = prisma.novel;
    prisma.novel = { findUnique: async () => novelRecord() };
    setWorldGenerationTimeoutForTests(120_000);
    setPromptRunnerStructuredInvokerForTests(async () => {
      throw new Error("[novel.world.generate_from_theme@v3] Request timed out after 120000ms.");
    });
    try {
      const service = new NovelWorldInstanceService();
      await assert.rejects(
        () => service.generateFromNovelTheme({ novelId: "novel-1" }),
        /模型与厂商/,
      );
      await assert.rejects(
        () => generateWorldSkeleton({ idea: "一座雨城" }),
        /模型与厂商/,
      );
      setPromptRunnerStructuredInvokerForTests(async () => {
        throw new Error("schema mismatch");
      });
      await assert.rejects(
        () => generateWorldSkeleton({ idea: "一座雨城" }),
        (error) => {
          assert.equal(error.message, "schema mismatch");
          return true;
        },
      );
    } finally {
      prisma.novel = originalNovel;
      setPromptRunnerStructuredInvokerForTests();
      setWorldGenerationTimeoutForTests();
    }
  });
});
