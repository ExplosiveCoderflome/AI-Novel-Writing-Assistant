const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveRequestedTakeoverRange,
  buildPreparedExecutableRange,
  doesCheckpointOverlapRange,
} = require("../dist/services/novel/director/novelDirectorTakeoverRange.js");

function createWorkspace() {
  return {
    volumes: [
      {
        id: "volume-1",
        sortOrder: 1,
        title: "卷一",
        chapters: Array.from({ length: 30 }, (_, index) => ({
          id: `chapter-${index + 1}`,
          chapterOrder: index + 1,
          purpose: `第${index + 1}章目标`,
          conflictLevel: 3,
          revealLevel: 2,
          targetWordCount: 2600,
          mustAvoid: "",
          payoffRefs: [],
          taskSheet: `第${index + 1}章任务单`,
        })),
      },
      {
        id: "volume-2",
        sortOrder: 2,
        title: "卷二",
        chapters: Array.from({ length: 30 }, (_, index) => ({
          id: `chapter-${index + 31}`,
          chapterOrder: index + 31,
          purpose: `第${index + 31}章目标`,
          conflictLevel: 3,
          revealLevel: 2,
          targetWordCount: 2600,
          mustAvoid: "",
          payoffRefs: [],
          taskSheet: `第${index + 31}章任务单`,
        })),
      },
    ],
    beatSheets: [],
    strategyPlan: null,
    critiqueReport: null,
    rebalanceDecisions: [],
  };
}

test("resolveRequestedTakeoverRange keeps the current chapter_range instead of stale front10 state", () => {
  const range = resolveRequestedTakeoverRange({
    autoExecutionPlan: {
      mode: "chapter_range",
      startOrder: 11,
      endOrder: 190,
    },
    workspace: createWorkspace(),
    chapterStates: Array.from({ length: 60 }, (_, index) => ({
      id: `chapter-${index + 1}`,
      order: index + 1,
      generationState: index < 10 ? "approved" : "planned",
    })),
  });

  assert.equal(range.startOrder, 11);
  assert.equal(range.endOrder, 190);
});

test("buildPreparedExecutableRange scans all prepared chapters instead of truncating to front10", () => {
  const range = buildPreparedExecutableRange({
    workspace: createWorkspace(),
    chapterStates: Array.from({ length: 60 }, (_, index) => ({
      id: `chapter-${index + 1}`,
      order: index + 1,
      generationState: "planned",
    })),
  });

  assert.deepEqual(range, {
    startOrder: 1,
    endOrder: 60,
    totalChapterCount: 60,
    nextChapterId: "chapter-1",
    nextChapterOrder: 1,
  });
});

test("doesCheckpointOverlapRange ignores old front10 checkpoints outside 11-190", () => {
  assert.equal(doesCheckpointOverlapRange(
    {
      checkpointType: "chapter_batch_ready",
      chapterId: "chapter-4",
      chapterOrder: 4,
      volumeId: "volume-1",
    },
    {
      startOrder: 11,
      endOrder: 190,
      totalChapterCount: 180,
      nextChapterId: "chapter-11",
      nextChapterOrder: 11,
    },
  ), false);
});
