const test = require("node:test");
const assert = require("node:assert/strict");

const { NovelCoreCrudService } = require("../dist/services/novel/novelCoreCrudService.js");
const { prisma } = require("../dist/db/prisma.js");

test("listNovels attaches latest visible auto director summary and skips archived tasks", async () => {
  const originals = {
    novelFindMany: prisma.novel.findMany,
    novelCount: prisma.novel.count,
    workflowFindMany: prisma.novelWorkflowTask.findMany,
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
      novelId: "novel_1",
      status: "waiting_approval",
      progress: 0.9,
      currentStage: "chapter_execution",
      currentItemLabel: "前 10 章可进入章节执行",
      checkpointType: "front10_ready",
      checkpointSummary: "这条任务应该被归档过滤。",
      updatedAt: new Date("2026-04-02T09:30:00.000Z"),
    },
    {
      id: "task_visible",
      novelId: "novel_1",
      status: "running",
      progress: 0.45,
      currentStage: "character_setup",
      currentItemLabel: "正在生成角色阵容",
      checkpointType: "character_setup_required",
      checkpointSummary: "当前正在处理角色准备。",
      updatedAt: new Date("2026-04-02T09:20:00.000Z"),
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
    assert.equal(result.items[0].latestAutoDirectorTask.nextActionLabel, "查看当前进度");
    assert.equal(result.items[1].latestAutoDirectorTask, null);
  } finally {
    prisma.novel.findMany = originals.novelFindMany;
    prisma.novel.count = originals.novelCount;
    prisma.novelWorkflowTask.findMany = originals.workflowFindMany;
    prisma.taskCenterArchive.findMany = originals.archiveFindMany;
  }
});
