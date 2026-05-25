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

test("chapter execution progress ignores stale needs_repair status when blocking issues are resolved", async (t) => {
  const originalFindMany = prisma.chapter.findMany;
  prisma.chapter.findMany = async () => [
    {
      id: "chapter-9",
      order: 9,
      title: "Chapter 9",
      content: "Draft body",
      taskSheet: "Task sheet",
      sceneCards: null,
      expectation: null,
      generationState: "reviewed",
      chapterStatus: "needs_repair",
      riskFlags: null,
      repairHistory: null,
      qualityReports: [],
      auditReports: [
        {
          issues: [
            {
              status: "resolved",
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
  const chapter9 = summary.chapters.find((item) => item.chapterOrder === 9);

  assert.equal(summary.needsRepairChapters, 0);
  assert.equal(chapter9.status, "reviewable");
  assert.equal(chapter9.recoverable, false);
  assert.equal(chapter9.evidence.needsRepair, false);
  assert.equal(chapter9.evidence.hasOpenBlockingIssue, false);
  assert.equal(chapter9.nextAction, "commit_state");
  assert.ok(chapter9.completedStages.includes("repair_completed_or_not_needed"));
});

test("chapter execution progress does not treat stale completed status as approval", async (t) => {
  const originalFindMany = prisma.chapter.findMany;
  prisma.chapter.findMany = async () => [
    {
      id: "chapter-10",
      order: 10,
      title: "Chapter 10",
      content: "",
      taskSheet: "Task sheet",
      sceneCards: null,
      expectation: null,
      generationState: "reviewed",
      chapterStatus: "completed",
      riskFlags: null,
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
  const chapter10 = summary.chapters.find((item) => item.chapterOrder === 10);

  assert.equal(summary.approvedChapterCount, 0);
  assert.equal(summary.completedChapters, 0);
  assert.equal(chapter10.status, "not_started");
  assert.equal(chapter10.nextAction, "write_draft");
  assert.ok(chapter10.missingStages.includes("draft_saved"));
  assert.ok(chapter10.missingStages.includes("reviewable_or_approved"));
});

test("chapter execution progress does not treat generating status without draft as running", async (t) => {
  const originalFindMany = prisma.chapter.findMany;
  prisma.chapter.findMany = async () => [
    {
      id: "chapter-11",
      order: 11,
      title: "Chapter 11",
      content: "",
      taskSheet: "Task sheet",
      sceneCards: null,
      expectation: null,
      generationState: "drafting",
      chapterStatus: "generating",
      riskFlags: null,
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
  const chapter11 = summary.chapters.find((item) => item.chapterOrder === 11);

  assert.equal(summary.draftedChapterCount, 0);
  assert.equal(chapter11.status, "not_started");
  assert.equal(chapter11.nextAction, "write_draft");
  assert.ok(chapter11.completedStages.includes("draft_started"));
  assert.ok(chapter11.missingStages.includes("draft_saved"));
});
