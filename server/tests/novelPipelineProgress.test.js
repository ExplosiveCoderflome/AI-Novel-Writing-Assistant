const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildPipelineStageProgress,
  buildPipelineCurrentItemLabel,
} = require("../dist/services/novel/novelCorePipelineService.js");

test("pipeline stage progress exposes non-zero chapter-in-flight progress", () => {
  const generating = buildPipelineStageProgress({
    completedCount: 0,
    totalCount: 10,
    stage: "generating_chapters",
  });
  const reviewing = buildPipelineStageProgress({
    completedCount: 0,
    totalCount: 10,
    stage: "reviewing",
  });
  const repairing = buildPipelineStageProgress({
    completedCount: 0,
    totalCount: 10,
    stage: "repairing",
  });

  assert.equal(generating > 0, true);
  assert.equal(reviewing > generating, true);
  assert.equal(repairing > reviewing, true);
});

test("pipeline current item label carries chapter index and title", () => {
  const label = buildPipelineCurrentItemLabel({
    completedCount: 2,
    totalCount: 10,
    title: "深宫寂，长夜寒",
  });

  assert.equal(label, "第 3/10 章 · 深宫寂，长夜寒");
});
