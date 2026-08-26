const test = require("node:test");
const assert = require("node:assert/strict");

const { prisma } = require("../dist/db/prisma.js");
const { novelEventBus } = require("../dist/events/index.js");
const {
  ChapterContentPersistenceError,
  ChapterLifecycleService,
} = require("../dist/services/novel/runtime/lifecycle/ChapterLifecycleService.js");
const {
  NovelPipelineExecutor,
} = require("../dist/services/novel/production/NovelPipelineExecutor.js");

test("saveWorkingContent exposes uncertain正文 persistence as a safety error", async () => {
  const originalUpdate = prisma.chapter.update;
  prisma.chapter.update = async () => {
    throw new Error("database write unavailable");
  };

  try {
    const service = new ChapterLifecycleService();
    await assert.rejects(
      () => service.saveWorkingContent({
        novelId: "novel-1",
        chapterId: "chapter-1",
        content: "可保存的章节正文。",
        generationState: "drafted",
      }),
      (error) => {
        assert.equal(error instanceof ChapterContentPersistenceError, true);
        assert.equal(error.chapterId, "chapter-1");
        assert.match(error.message, /正文保存失败/);
        return true;
      },
    );
  } finally {
    prisma.chapter.update = originalUpdate;
  }
});

test("pipeline does not regenerate a chapter when正文 persistence is uncertain", async () => {
  const originals = {
    generationFindUnique: prisma.generationJob.findUnique,
    generationUpdate: prisma.generationJob.update,
    novelFindUnique: prisma.novel.findUnique,
    chapterFindMany: prisma.chapter.findMany,
    emit: novelEventBus.emit,
  };
  const updates = [];
  let generationCalls = 0;

  prisma.generationJob.findUnique = async (input) => {
    if (input.select?.startedAt) {
      return {
        startedAt: null,
        completedCount: 0,
        totalCount: 1,
        retryCount: 0,
        payload: JSON.stringify({
          provider: "deepseek",
          model: "deepseek-chat",
          maxRetries: 1,
          runMode: "fast",
          autoReview: true,
          autoRepair: true,
          skipCompleted: true,
          qualityThreshold: 75,
          repairMode: "light_repair",
          controlPolicy: { advanceMode: "full_book_autopilot" },
        }),
      };
    }
    if (input.select?.status) {
      return { status: "running", cancelRequestedAt: null };
    }
    throw new Error(`Unexpected generationJob lookup: ${JSON.stringify(input)}`);
  };
  prisma.generationJob.update = async (input) => {
    updates.push(input);
    return input;
  };
  prisma.novel.findUnique = async () => ({
    id: "novel-1",
    title: "测试小说",
    estimatedChapterCount: 1,
  });
  prisma.chapter.findMany = async () => [{
    id: "chapter-1",
    order: 1,
    title: "第一章",
    content: "",
  }];
  novelEventBus.emit = async () => undefined;

  const executor = new NovelPipelineExecutor({
    async runPipelineChapter() {
      generationCalls += 1;
      throw new ChapterContentPersistenceError("chapter-1", "正文保存失败：database write unavailable");
    },
  });

  try {
    await executor.execute("job-1", "novel-1", {
      startOrder: 1,
      endOrder: 1,
      provider: "deepseek",
      model: "deepseek-chat",
      temperature: 0.7,
      maxRetries: 1,
      runMode: "fast",
      autoReview: true,
      autoRepair: true,
      skipCompleted: true,
      qualityThreshold: 75,
      repairMode: "light_repair",
      controlPolicy: { advanceMode: "full_book_autopilot" },
    });

    assert.equal(generationCalls, 1);
    const finalUpdate = updates.at(-1);
    assert.equal(finalUpdate.data.status, "failed");
    assert.match(finalUpdate.data.error, /正文保存失败/);
  } finally {
    prisma.generationJob.findUnique = originals.generationFindUnique;
    prisma.generationJob.update = originals.generationUpdate;
    prisma.novel.findUnique = originals.novelFindUnique;
    prisma.chapter.findMany = originals.chapterFindMany;
    novelEventBus.emit = originals.emit;
  }
});
