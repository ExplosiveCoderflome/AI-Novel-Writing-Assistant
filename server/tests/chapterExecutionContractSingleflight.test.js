const test = require("node:test");
const assert = require("node:assert/strict");

const {
  runChapterExecutionContractSingleflight,
} = require("../dist/services/novel/volume/ChapterExecutionContractService.js");

test("chapter execution contract shares one in-flight generation per chapter", async () => {
  let calls = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const work = async () => {
    calls += 1;
    await gate;
    return { taskSheet: "ready" };
  };

  const first = runChapterExecutionContractSingleflight("novel-1", "chapter-1", work);
  const second = runChapterExecutionContractSingleflight("novel-1", "chapter-1", work);
  release();

  assert.deepEqual(await Promise.all([first, second]), [{ taskSheet: "ready" }, { taskSheet: "ready" }]);
  assert.equal(calls, 1);
});
