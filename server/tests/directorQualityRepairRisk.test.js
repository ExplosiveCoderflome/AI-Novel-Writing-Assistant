const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildDirectorQualityRepairRisk,
} = require("../dist/services/novel/director/phases/novelDirectorQualityRepairRisk.js");

test("buildDirectorQualityRepairRisk treats deferred quality debt as continuable regardless of count", () => {
  const risk = buildDirectorQualityRepairRisk({
    noticeCode: "PIPELINE_QUALITY_REVIEW",
    noticeSummary: "部分章节已记录质量债务",
    payload: JSON.stringify({
      repairMode: "heavy_repair",
      qualityAlertDetails: [
        "第3章（coherence=70）",
        "第4章（coherence=71）",
        "第5章（coherence=72）",
        "第6章（coherence=73）",
        "第7章（coherence=74）",
        "第8章（coherence=74）",
      ],
    }),
    remainingChapterCount: 2,
    totalChapterCount: 8,
  });

  assert.equal(risk.riskLevel, "low");
  assert.equal(risk.autoContinuable, true);
  assert.equal(risk.affectedChapterCount, 6);
  assert.match(risk.reason, /质量债务/);
});

test("buildDirectorQualityRepairRisk keeps replan notices blocking", () => {
  const risk = buildDirectorQualityRepairRisk({
    noticeCode: "PIPELINE_REPLAN_REQUIRED",
    noticeSummary: "第9章需要重规划",
    payload: JSON.stringify({
      replanAlertDetails: ["第9章需要重规划（原因=缺失比武环节）"],
    }),
    remainingChapterCount: 1,
    totalChapterCount: 8,
  });

  assert.equal(risk.riskLevel, "replan");
  assert.equal(risk.autoContinuable, false);
  assert.equal(risk.affectedChapterCount, 1);
});

test("buildDirectorQualityRepairRisk keeps unclassified heavy repair notices manual", () => {
  const risk = buildDirectorQualityRepairRisk({
    noticeSummary: "大范围修复需要确认",
    payload: JSON.stringify({ repairMode: "heavy_repair" }),
    remainingChapterCount: 3,
    totalChapterCount: 10,
  });

  assert.equal(risk.riskLevel, "large_scope");
  assert.equal(risk.autoContinuable, false);
});
