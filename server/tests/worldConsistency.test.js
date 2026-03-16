const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildConsistencySummary,
  localizeConsistencyField,
  localizeConsistencyIssue,
} = require("../dist/services/world/worldConsistency.js");

test("buildConsistencySummary returns chinese summaries", () => {
  assert.equal(buildConsistencySummary("pass", 0, 0), "一致性检查通过，未发现明显硬冲突。");
  assert.equal(buildConsistencySummary("warn", 0, 2), "检测到 2 个警告项，建议继续修正。");
  assert.equal(buildConsistencySummary("error", 2, 1), "检测到 2 个严重冲突，1 个警告项。");
});

test("localizeConsistencyIssue rewrites known english issues into chinese", () => {
  const issue = localizeConsistencyIssue({
    severity: "error",
    code: "GENRE_MISMATCH",
    message: "Payload genre markers clash with the enforced historical realism",
    detail: "The RAG context and name suggest a strange-hero story.",
    source: "llm",
    targetField: "conflicts",
  });

  assert.equal(issue.message, "题材信号与当前世界观约束不一致。");
  assert.match(issue.detail ?? "", /题材预期/);
  assert.equal(localizeConsistencyField("conflicts"), "核心冲突");
});
