const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveDirectorTakeoverAutoExecutionResetRange,
} = require("../dist/services/novel/director/novelDirectorTakeoverReset.js");

function buildTakeoverState() {
  return {
    latestAutoExecutionState: {
      enabled: true,
      mode: "front10",
      startOrder: 1,
      endOrder: 10,
      totalChapterCount: 10,
    },
    executableRange: {
      startOrder: 1,
      endOrder: 10,
    },
    activePipelineJob: null,
    latestCheckpoint: null,
  };
}

test("takeover reset range prefers requested chapter range over stale auto execution state", async () => {
  const range = await resolveDirectorTakeoverAutoExecutionResetRange({
    novelId: "novel-1",
    autoExecutionPlan: {
      mode: "chapter_range",
      startOrder: 11,
      endOrder: 190,
    },
    takeoverState: buildTakeoverState(),
    deps: {
      async getVolumeWorkspace() {
        throw new Error("chapter range does not need volume workspace");
      },
    },
  });

  assert.deepEqual(range, {
    startOrder: 11,
    endOrder: 190,
  });
});

test("takeover reset range resolves requested volume from current workspace chapters", async () => {
  const range = await resolveDirectorTakeoverAutoExecutionResetRange({
    novelId: "novel-1",
    autoExecutionPlan: {
      mode: "volume",
      volumeOrder: 2,
    },
    takeoverState: buildTakeoverState(),
    deps: {
      async getVolumeWorkspace() {
        return {
          volumes: [
            {
              sortOrder: 1,
              chapters: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((chapterOrder) => ({ chapterOrder })),
            },
            {
              sortOrder: 2,
              chapters: [11, 12, 13, 14, 15].map((chapterOrder) => ({ chapterOrder })),
            },
          ],
        };
      },
    },
  });

  assert.deepEqual(range, {
    startOrder: 11,
    endOrder: 15,
  });
});
