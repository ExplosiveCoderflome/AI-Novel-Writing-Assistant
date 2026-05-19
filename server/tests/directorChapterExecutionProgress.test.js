const test = require("node:test");
const assert = require("node:assert/strict");

const { prisma } = require("../dist/db/prisma.js");
const {
  ChapterExecutionProgressInspector,
} = require("../dist/services/novel/director/runtime/ChapterExecutionProgressInspector.js");

test("chapter execution progress treats needs_repair as a local recoverable state", async (t) => {
  const originalFindMany = prisma.chapter.findMany;
  prisma.chapter.findMany = async () => [
    {
      id: "chapter-5",
      order: 5,
      title: "Chapter 5",
      content: "Draft body",
      taskSheet: "Task sheet",
      sceneCards: null,
      expectation: null,
      generationState: "reviewed",
      chapterStatus: "needs_repair",
      repairHistory: null,
      qualityReports: [],
      auditReports: [
        {
          issues: [
            {
              status: "open",
              severity: "critical",
            },
          ],
        },
      ],
      storyStateSnapshots: [],
      canonicalStateVersions: [],
    },
    {
      id: "chapter-6",
      order: 6,
      title: "Chapter 6",
      content: "",
      taskSheet: "Task sheet",
      sceneCards: null,
      expectation: null,
      generationState: "planned",
      chapterStatus: "ready",
      repairHistory: null,
      qualityReports: [],
      auditReports: [],
      storyStateSnapshots: [],
      canonicalStateVersions: [],
    },
  ];
  t.after(() => {
    prisma.chapter.findMany = originalFindMany;
  });

  const summary = await new ChapterExecutionProgressInspector().inspectNovel("novel-1");
  const chapter5 = summary.chapters.find((item) => item.chapterOrder === 5);
  const chapter6 = summary.chapters.find((item) => item.chapterOrder === 6);

  assert.equal(summary.totalChapters, 2);
  assert.equal(summary.draftedChapterCount, 1);
  assert.equal(summary.approvedChapterCount, 0);
  assert.equal(summary.needsRepairChapters, 1);
  assert.equal(summary.recoverableRange.startOrder, 5);
  assert.equal(chapter5.status, "needs_repair");
  assert.equal(chapter5.recoverable, true);
  assert.equal(chapter5.nextAction, "repair_chapter");
  assert.ok(chapter5.completedStages.includes("draft_saved"));
  assert.ok(chapter5.missingStages.includes("repair_completed_or_not_needed"));
  assert.equal(chapter6.status, "not_started");
  assert.equal(chapter6.currentStage, "draft_started");
});

test("chapter execution progress treats terminal deferred quality issues as continue-next-chapter", async (t) => {
  const originalFindMany = prisma.chapter.findMany;
  prisma.chapter.findMany = async () => [
    {
      id: "chapter-8",
      order: 8,
      title: "Chapter 8",
      content: "Draft body",
      taskSheet: "Task sheet",
      sceneCards: null,
      expectation: null,
      generationState: "reviewed",
      chapterStatus: "pending_review",
      riskFlags: JSON.stringify({
        qualityLoop: {
          overallStatus: "risk",
          recommendedAction: "patch_repair",
          terminalAction: "defer_and_continue",
        },
      }),
      repairHistory: null,
      qualityReports: [],
      auditReports: [
        {
          issues: [
            {
              status: "open",
              severity: "critical",
            },
          ],
        },
      ],
      storyStateSnapshots: [],
      canonicalStateVersions: [],
    },
  ];
  t.after(() => {
    prisma.chapter.findMany = originalFindMany;
  });

  const summary = await new ChapterExecutionProgressInspector().inspectNovel("novel-1");
  const chapter8 = summary.chapters.find((item) => item.chapterOrder === 8);

  assert.equal(summary.needsRepairChapters, 0);
  assert.equal(chapter8.status, "reviewable");
  assert.equal(chapter8.recoverable, false);
  assert.equal(chapter8.nextAction, "continue_next_chapter");
  assert.ok(chapter8.completedStages.includes("repair_completed_or_not_needed"));
});
