const test = require("node:test");
const assert = require("node:assert/strict");

const { buildWorkflowTaskInitialData } = require("../dist/services/novel/workflow/taskCreation/index.js");

test("workflow task factory assembles shared persisted initial fields", () => {
  const seedPayload = { runMode: "auto_to_execution", source: "test" };
  const result = buildWorkflowTaskInitialData({
    lane: "auto_director",
    novelId: "novel-1",
    title: "测试小说",
    seedPayload,
    initialState: {
      stage: "structured_outline",
      itemKey: "chapter_list",
      itemLabel: "正在整理章节",
      progress: 0.42,
    },
  }, "测试小说");

  assert.equal(result.initialStage, "structured_outline");
  assert.deepEqual(result.data, {
    novelId: "novel-1",
    lane: "auto_director",
    title: "测试小说",
    status: "queued",
    progress: 0.42,
    currentStage: "节奏 / 拆章",
    currentItemKey: "chapter_list",
    currentItemLabel: "正在整理章节",
    seedPayloadJson: JSON.stringify(seedPayload),
  });
});
