const test = require("node:test");
const assert = require("node:assert/strict");

const { NovelWorkflowService } = require("../dist/services/novel/workflow/NovelWorkflowService.js");
const { prisma } = require("../dist/db/prisma.js");

function createDetailedChapter(id, chapterOrder) {
  return {
    id,
    chapterOrder,
    purpose: `chapter ${chapterOrder} purpose`,
    conflictLevel: 3,
    revealLevel: 2,
    targetWordCount: 2500,
    mustAvoid: `chapter ${chapterOrder} avoid`,
    taskSheet: `chapter ${chapterOrder} task sheet`,
    payoffRefsJson: "[]",
  };
}

function createEmptyChapter(id, chapterOrder) {
  return {
    id,
    chapterOrder,
    purpose: null,
    conflictLevel: null,
    revealLevel: null,
    targetWordCount: null,
    mustAvoid: null,
    taskSheet: null,
    payoffRefsJson: "[]",
  };
}

test("healStaleAutoDirectorStructuredOutlineProgress advances stale chapter list status to next incomplete chapter", async () => {
  const originals = {
    findUnique: prisma.novelWorkflowTask.findUnique,
    update: prisma.novelWorkflowTask.update,
    volumeFindMany: prisma.volumePlan.findMany,
  };

  let updatedPayload = null;
  prisma.novelWorkflowTask.findUnique = async () => ({
    id: "task-outline-stale",
    novelId: "novel-demo",
    lane: "auto_director",
    status: "running",
    progress: 0.78,
    currentStage: "节奏 / 拆章",
    currentItemKey: "chapter_list",
    currentItemLabel: "正在生成第 1 卷章节列表（已等待 5m15s）",
    checkpointType: null,
    checkpointSummary: null,
    seedPayloadJson: JSON.stringify({
      runMode: "auto_to_execution",
      autoExecutionPlan: { mode: "front10" },
      directorInput: { runMode: "auto_to_execution" },
    }),
    cancelRequestedAt: null,
  });
  prisma.volumePlan.findMany = async () => [
    {
      id: "volume-1",
      sortOrder: 1,
      title: "Volume 1",
      chapters: [
        createDetailedChapter("chapter-1", 1),
        createDetailedChapter("chapter-2", 2),
        createDetailedChapter("chapter-3", 3),
        createDetailedChapter("chapter-4", 4),
        createEmptyChapter("chapter-5", 5),
        createEmptyChapter("chapter-6", 6),
        createEmptyChapter("chapter-7", 7),
        createEmptyChapter("chapter-8", 8),
        createEmptyChapter("chapter-9", 9),
        createEmptyChapter("chapter-10", 10),
      ],
    },
  ];
  prisma.novelWorkflowTask.update = async ({ data }) => {
    updatedPayload = data;
    return data;
  };

  try {
    const service = new NovelWorkflowService();
    const healed = await service.healStaleAutoDirectorStructuredOutlineProgress("task-outline-stale");
    assert.equal(healed, true);
    assert.equal(updatedPayload.currentItemKey, "chapter_detail_bundle");
    assert.match(updatedPayload.currentItemLabel, /5\/10/);
    assert.ok(updatedPayload.progress > 0.82);
  } finally {
    prisma.novelWorkflowTask.findUnique = originals.findUnique;
    prisma.novelWorkflowTask.update = originals.update;
    prisma.volumePlan.findMany = originals.volumeFindMany;
  }
});
