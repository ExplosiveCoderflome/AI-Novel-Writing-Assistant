const test = require("node:test");
const assert = require("node:assert/strict");

const { formatPromptLiveLabel } = require("../dist/prompting/promptCatalog.js");

test("live prompt labels use the catalog name and retain the stable identifier", () => {
  assert.equal(
    formatPromptLiveLabel({ promptId: "novel.volume.chapter_execution_contract", promptVersion: "v3", taskType: "planner" }),
    "章节执行合同 · novel.volume.chapter_execution_contract@v3",
  );
});
