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
