const test = require("node:test");
const assert = require("node:assert/strict");

const { NovelExportService } = require("../dist/services/novel/NovelExportService.js");
const { prisma } = require("../dist/db/prisma.js");

test("buildExportContent uses novel title plus timestamp as export filename", async () => {
  const originalFindUnique = prisma.novel.findUnique;

  prisma.novel.findUnique = async () => ({
    title: "霓虹档案 / Neon Archive",
    description: "都市异能悬疑",
    chapters: [
      {
        order: 1,
        title: "误入局中",
        content: "第一章正文",
      },
    ],
  });

  try {
    const service = new NovelExportService();
    const result = await service.buildExportContent("novel_export_demo", "txt");

    assert.match(result.fileName, /^霓虹档案 _ Neon Archive-\d{8}-\d{6}\.txt$/);
    assert.equal(result.contentType, "text/plain; charset=utf-8");
    assert.match(result.content, /第一章正文/);
  } finally {
    prisma.novel.findUnique = originalFindUnique;
  }
});

test("buildExportContent can export the portable novel setup bundle", async () => {
  const service = new NovelExportService();
  service.buildExportBundle = async () => ({
    metadata: {
      exportedAt: "2026-05-18T00:00:00.000Z",
      novelId: "novel_setup_demo",
      novelTitle: "可搬走的设定",
    },
    sections: {
      basic: {
        novel: {
          id: "novel_setup_demo",
          title: "可搬走的设定",
          writingMode: "ai_assisted",
          projectMode: null,
          genre: null,
          primaryStoryMode: null,
          secondaryStoryMode: null,
          world: null,
          estimatedChapterCount: 60,
          commercialTags: [],
          description: "一个能带去别处继续写的项目。",
          outline: "后期卷规划不应进入初期设定导出。",
          structuredOutline: "后期拆章不应进入初期设定导出。",
          chapters: [
            {
              id: "chapter_1",
              title: "第一章",
              order: 1,
              content: "已经生成的正文不应进入初期设定导出。",
              novelId: "novel_setup_demo",
              createdAt: "2026-05-18T00:00:00.000Z",
              updatedAt: "2026-05-18T00:00:00.000Z",
            },
          ],
          characters: [],
        },
        worldSlice: null,
      },
      story_macro: {
        storyMacroPlan: {
          storyInput: "少年进入雾城。",
          expansion: null,
          decomposition: null,
        },
        bookContract: null,
      },
      character: {
        characters: [
          {
            id: "char_1",
            name: "林川",
            role: "主角",
            castRole: "protagonist",
          },
        ],
        relations: [],
        castOptions: [],
        timelines: [
          {
            characterId: "char_1",
            characterName: "林川",
            events: [
              {
                id: "timeline_1",
                novelId: "novel_setup_demo",
                characterId: "char_1",
                chapterId: "chapter_1",
                chapterOrder: 1,
                title: "正文后的变化",
                content: "后期角色状态不应进入初期设定导出。",
                source: "chapter",
                createdAt: "2026-05-18T00:00:00.000Z",
                updatedAt: "2026-05-18T00:00:00.000Z",
              },
            ],
          },
        ],
      },
      outline: { workspace: null },
      structured: { workspace: null },
      chapter: {
        chapters: [],
        chapterPlans: [],
        latestStateSnapshot: null,
      },
      pipeline: {
        latestPipelineJob: null,
        qualityReport: {
          summary: { overall: 0 },
          totalReports: 0,
          chapterReports: [],
        },
        bible: null,
        plotBeats: [],
        payoffLedger: null,
        latestStateSnapshot: null,
        chapterAuditReports: [],
      },
    },
  });

  const result = await service.buildExportContent("novel_setup_demo", "markdown", "setup_bundle");

  assert.match(result.fileName, /^可搬走的设定-setup_bundle-\d{8}-\d{6}\.md$/);
  assert.match(result.content, /导出范围：小说设定/);
  assert.match(result.content, /## 项目设定/);
  assert.match(result.content, /## 故事宏观规划/);
  assert.match(result.content, /## 角色准备/);
  assert.doesNotMatch(result.content, /## 卷战略 \/ 卷骨架/);
  assert.doesNotMatch(result.content, /## 章节执行/);
  assert.doesNotMatch(result.content, /完整数据/);
  assert.doesNotMatch(result.content, /已经生成的正文不应进入初期设定导出/);
  assert.doesNotMatch(result.content, /后期角色状态不应进入初期设定导出/);

  const jsonResult = await service.buildExportContent("novel_setup_demo", "json", "setup_bundle");
  const jsonPayload = JSON.parse(jsonResult.content);
  assert.equal(jsonPayload.metadata.scope, "setup_bundle");
  assert.deepEqual(Object.keys(jsonPayload.data), ["basic", "story_macro", "character"]);
  assert.equal(jsonPayload.data.basic.novel.chapters, undefined);
  assert.equal(jsonPayload.data.basic.novel.outline, undefined);
  assert.equal(jsonPayload.data.basic.novel.structuredOutline, undefined);
  assert.equal(jsonPayload.data.character.timelines, undefined);
});
