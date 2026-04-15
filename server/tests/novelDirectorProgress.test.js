const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildChapterDetailBundleLabel,
} = require("../dist/services/novel/director/novelDirectorProgress.js");
const {
  formatChapterDetailModeLabel,
} = require("../dist/services/novel/volume/chapterDetailModeLabel.js");

test("chapter detail mode labels are localized for user-facing progress", () => {
  assert.equal(formatChapterDetailModeLabel("purpose"), "章节目标");
  assert.equal(formatChapterDetailModeLabel("boundary"), "执行边界");
  assert.equal(formatChapterDetailModeLabel("task_sheet"), "任务单");
});

test("director chapter detail progress uses localized mode labels", () => {
  assert.equal(
    buildChapterDetailBundleLabel(1, 10, "task_sheet"),
    "正在细化第 1/10 章 · 任务单",
  );
});
