const test = require("node:test");
const assert = require("node:assert/strict");

const {
  extractDirectorTaskSeedPayloadFromMeta,
  mergeDirectorCandidateBatches,
} = require("@ai-novel/shared/types/novelDirector");

function buildCandidate(id, workingTitle) {
  return {
    id,
    workingTitle,
    titleOptions: [],
    logline: `${workingTitle} logline`,
    positioning: `${workingTitle} positioning`,
    sellingPoint: `${workingTitle} selling point`,
    coreConflict: `${workingTitle} core conflict`,
    protagonistPath: `${workingTitle} protagonist path`,
    endingDirection: `${workingTitle} ending`,
    hookStrategy: `${workingTitle} hook`,
    progressionLoop: `${workingTitle} loop`,
    whyItFits: `${workingTitle} fit`,
    toneKeywords: ["都市", "悬疑"],
    targetChapterCount: 80,
  };
}

function buildBatch(id, round, workingTitle) {
  return {
    id,
    round,
    roundLabel: `第 ${round} 轮`,
    idea: "拾荒者的赛博人生",
    refinementSummary: round === 1 ? "初始方案" : "继续修正",
    presets: [],
    candidates: [buildCandidate(`${id}-candidate`, workingTitle)],
    createdAt: "2026-04-10T00:00:00.000Z",
  };
}

test("extractDirectorTaskSeedPayloadFromMeta returns candidate-stage batches from task meta", () => {
  const firstBatch = buildBatch("batch-1", 1, "我在赛博废墟捡神装");
  const result = extractDirectorTaskSeedPayloadFromMeta({
    seedPayload: {
      idea: "拾荒者的赛博人生",
      runMode: "stage_review",
      batches: [firstBatch],
      autoExecutionPlan: {
        mode: "front10",
      },
    },
  });

  assert.equal(result?.idea, "拾荒者的赛博人生");
  assert.equal(result?.runMode, "stage_review");
  assert.equal(result?.autoExecutionPlan?.mode, "front10");
  assert.deepEqual(result?.batches, [firstBatch]);
});

test("mergeDirectorCandidateBatches preserves local edits and only appends missing batches", () => {
  const localBatch = buildBatch("batch-1", 1, "本地已切换的书名");
  const remoteVersionOfSameBatch = buildBatch("batch-1", 1, "任务里原始书名");
  const missingSecondBatch = buildBatch("batch-2", 2, "当废品价值连城：赛博回收战争");

  const merged = mergeDirectorCandidateBatches(
    [localBatch],
    [remoteVersionOfSameBatch, missingSecondBatch],
  );

  assert.equal(merged.length, 2);
  assert.equal(merged[0], localBatch);
  assert.equal(merged[0].candidates[0].workingTitle, "本地已切换的书名");
  assert.deepEqual(merged[1], missingSecondBatch);
});
