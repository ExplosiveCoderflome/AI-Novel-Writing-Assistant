const test = require("node:test");
const assert = require("node:assert/strict");

const {
  preparePromptExecution,
} = require("../dist/prompting/core/promptRunner.js");
const {
  createVolumeChapterListPrompt,
} = require("../dist/prompting/prompts/novel/volume/chapterList.prompts.js");

test("auto structured output hint preserves array fields in the example skeleton", () => {
  const prepared = preparePromptExecution({
    asset: createVolumeChapterListPrompt(4),
    promptInput: {
      targetChapterCount: 4,
    },
  });

  assert.equal(prepared.messages.length, 3);
  assert.match(String(prepared.messages[2].content), /"chapters": \[/);
});
