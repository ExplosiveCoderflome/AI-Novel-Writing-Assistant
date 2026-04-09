const test = require("node:test");
const assert = require("node:assert/strict");

const { NovelCoreCrudService } = require("../dist/services/novel/novelCoreCrudService.js");
const { prisma } = require("../dist/db/prisma.js");

test("listNovels attaches latest visible auto director summary, skips archived tasks, and exposes deduplicated token usage", async () => {
  const originals = {
    novelFindMany: prisma.novel.findMany,
    novelCount: prisma.novel.count,
    workflowFindMany: prisma.novelWorkflowTask.findMany,
    workflowGroupBy: prisma.novelWorkflowTask.groupBy,
    generationJobFindMany: prisma.generationJob.findMany,
    archiveFindMany: prisma.taskCenterArchive.findMany,
  };

  prisma.novel.findMany = async () => ([
    {
      id: "novel_1",
      title: "自动导演中的小说",
      description: "测试列表页导演摘要",
      targetAudience: null,
      bookSellingPoint: null,
      competingFeel: null,
      first30ChapterPromise: null,
      commercialTagsJson: null,
      status: "draft",
      writingMode: "original",
      projectMode: null,
      narrativePov: null,
      pacePreference: null,
      styleTone: null,
      emotionIntensity: null,
      aiFreedom: null,
      defaultChapterLength: null,
      estimatedChapterCount: null,
      projectStatus: "in_progress",
      storylineStatus: "not_started",
      outlineStatus: "not_started",
      resourceReadyScore: 25,
      sourceNovelId: null,
      sourceKnowledgeDocumentId: null,
      continuationBookAnalysisId: null,
      continuationBookAnalysisSections: null,
      outline: null,
      structuredOutline: null,
      genreId: null,
      primaryStoryModeId: null,
      secondaryStoryModeId: null,
      worldId: null,
      createdAt: new Date("2026-04-02T08:00:00.000Z"),
      updatedAt: new Date("2026-04-02T09:00:00.000Z"),
      genre: null,
      primaryStoryMode: null,
      secondaryStoryMode: null,
      world: null,
      bible: null,
      bookContract: null,
      _count: {
        chapters: 0,
        characters: 0,
        plotBeats: 0,
      },
    },
    {
      id: "novel_2",
      title: "普通草稿",
      description: null,
      targetAudience: null,
      bookSellingPoint: null,
      competingFeel: null,
      first30ChapterPromise: null,
      commercialTagsJson: null,
      status: "draft",
      writingMode: "original",
      projectMode: null,
      narrativePov: null,
      pacePreference: null,
      styleTone: null,
      emotionIntensity: null,
      aiFreedom: null,
      defaultChapterLength: null,
      estimatedChapterCount: null,
      projectStatus: "not_started",
      storylineStatus: "not_started",
      outlineStatus: "not_started",
      resourceReadyScore: 0,
      sourceNovelId: null,
      sourceKnowledgeDocumentId: null,
      continuationBookAnalysisId: null,
      continuationBookAnalysisSections: null,
      outline: null,
      structuredOutline: null,
      genreId: null,
      primaryStoryModeId: null,
      secondaryStoryModeId: null,
      worldId: null,
      createdAt: new Date("2026-04-02T07:00:00.000Z"),
      updatedAt: new Date("2026-04-02T07:30:00.000Z"),
      genre: null,
      primaryStoryMode: null,
      secondaryStoryMode: null,
      world: null,
      bible: null,
      bookContract: null,
      _count: {
        chapters: 1,
        characters: 1,
        plotBeats: 0,
      },
    },
  ]);

  prisma.novel.count = async () => 2;

  prisma.novelWorkflowTask.findMany = async () => ([
    {
      id: "task_archived",
      title: "自动导演中的小说",
      novelId: "novel_1",
      lane: "auto_director",
      status: "waiting_approval",
      progress: 0.9,
      currentStage: "chapter_execution",
      currentItemKey: "chapter_execution",
      currentItemLabel: "前 10 章可进入章节执行",
      checkpointType: "front10_ready",
      checkpointSummary: "这条任务应该被归档过滤。",
      resumeTargetJson: null,
      seedPayloadJson: null,
      updatedAt: new Date("2026-04-02T09:30:00.000Z"),
      heartbeatAt: new Date("2026-04-02T09:30:00.000Z"),
      finishedAt: null,
      milestonesJson: null,
      lastError: null,
    },
    {
      id: "task_visible",
      title: "自动导演中的小说",
      novelId: "novel_1",
      lane: "auto_director",
      status: "running",
      progress: 0.45,
      currentStage: "character_setup",
      currentItemKey: "character_setup",
      currentItemLabel: "正在生成角色阵容",
      checkpointType: "character_setup_required",
      checkpointSummary: "当前正在处理角色准备。",
      resumeTargetJson: null,
      seedPayloadJson: null,
      heartbeatAt: new Date("2026-04-02T09:20:00.000Z"),
      finishedAt: null,
      milestonesJson: null,
      lastError: null,
      updatedAt: new Date("2026-04-02T09:20:00.000Z"),
    },
  ]);

  prisma.novelWorkflowTask.groupBy = async () => ([
    {
      novelId: "novel_1",
      _sum: {
        promptTokens: 1200,
        completionTokens: 600,
        totalTokens: 1800,
        llmCallCount: 4,
      },
      _max: {
        lastTokenRecordedAt: new Date("2026-04-02T09:25:00.000Z"),
      },
    },
  ]);

  prisma.generationJob.findMany = async () => ([
    {
      novelId: "novel_1",
      promptTokens: 300,
      completionTokens: 200,
      totalTokens: 500,
      llmCallCount: 1,
      lastTokenRecordedAt: new Date("2026-04-02T09:28:00.000Z"),
      payload: JSON.stringify({ workflowTaskId: "task_visible" }),
    },
    {
      novelId: "novel_1",
      promptTokens: 90,
      completionTokens: 60,
      totalTokens: 150,
      llmCallCount: 1,
      lastTokenRecordedAt: new Date("2026-04-02T09:27:00.000Z"),
      payload: JSON.stringify({ startOrder: 1, endOrder: 1 }),
    },
    {
      novelId: "novel_2",
      promptTokens: 40,
      completionTokens: 20,
      totalTokens: 60,
      llmCallCount: 1,
      lastTokenRecordedAt: new Date("2026-04-02T07:20:00.000Z"),
      payload: null,
    },
  ]);

  prisma.taskCenterArchive.findMany = async () => ([
    {
      taskId: "task_archived",
    },
  ]);

  try {
    const service = new NovelCoreCrudService();
    const result = await service.listNovels({ page: 1, limit: 20 });

    assert.equal(result.items.length, 2);
    assert.equal(result.items[0].latestAutoDirectorTask.id, "task_visible");
    assert.equal(result.items[0].latestAutoDirectorTask.status, "running");
    assert.equal(result.items[0].latestAutoDirectorTask.currentItemLabel, "正在生成角色阵容");
    assert.equal(result.items[0].latestAutoDirectorTask.displayStatus, "角色准备进行中");
    assert.equal(result.items[0].latestAutoDirectorTask.resumeAction, "查看当前进度");
    assert.equal(result.items[0].latestAutoDirectorTask.lastHealthyStage, "角色准备");
    assert.equal(result.items[0].latestAutoDirectorTask.nextActionLabel, "查看当前进度");
    assert.equal(result.items[0].tokenUsage.totalTokens, 1950);
    assert.equal(result.items[0].tokenUsage.promptTokens, 1290);
    assert.equal(result.items[0].tokenUsage.completionTokens, 660);
    assert.equal(result.items[0].tokenUsage.llmCallCount, 5);
    assert.equal(result.items[0].tokenUsage.lastRecordedAt, "2026-04-02T09:27:00.000Z");
    assert.equal(result.items[1].latestAutoDirectorTask, null);
    assert.equal(result.items[1].tokenUsage.totalTokens, 60);
  } finally {
    prisma.novel.findMany = originals.novelFindMany;
    prisma.novel.count = originals.novelCount;
    prisma.novelWorkflowTask.findMany = originals.workflowFindMany;
    prisma.novelWorkflowTask.groupBy = originals.workflowGroupBy;
    prisma.generationJob.findMany = originals.generationJobFindMany;
    prisma.taskCenterArchive.findMany = originals.archiveFindMany;
  }
});
