const test = require("node:test");
const assert = require("node:assert/strict");

const {
  runStructuredPrompt,
  setPromptRunnerStructuredInvokerForTests,
} = require("../dist/prompting/core/promptRunner.js");
const {
  genreTreePrompt,
} = require("../dist/prompting/prompts/genre/genre.prompts.js");
const {
  createContextBlock,
} = require("../dist/prompting/core/contextBudget.js");

// #251: callers that ask for thinking off (PromptExecutionOptions.reasoningEnabled)
// must reach the structured invoker. The text runner already forwards the option;
// the structured runner used to drop it, so structured calls always ran with the
// vendor default (thinking on).
test("runStructuredPrompt forwards reasoningEnabled to the structured invoker", async () => {
  let captured = null;
  setPromptRunnerStructuredInvokerForTests(async (input) => {
    captured = input;
    return {
      data: { name: "都市", description: "现代高压世界下的异能成长", children: [] },
      repairUsed: false,
      repairAttempts: 0,
    };
  });
  try {
    await runStructuredPrompt({
      asset: genreTreePrompt,
      promptInput: { prompt: "都市异能", retry: false, forceJson: true },
      contextBlocks: [
        createContextBlock({
          id: "core-1",
          group: "core",
          priority: 100,
          required: true,
          content: "核心设定：高压都市异能成长。",
        }),
      ],
      options: { reasoningEnabled: false, maxTokens: 4096 },
    });
    assert.equal(captured.reasoningEnabled, false);
    assert.equal(captured.maxTokens, 4096);
  } finally {
    setPromptRunnerStructuredInvokerForTests();
  }
});

test("runStructuredPrompt leaves reasoningEnabled unset when the caller does not set it", async () => {
  let captured = null;
  setPromptRunnerStructuredInvokerForTests(async (input) => {
    captured = input;
    return {
      data: { name: "都市", description: "现代高压世界下的异能成长", children: [] },
      repairUsed: false,
      repairAttempts: 0,
    };
  });
  try {
    await runStructuredPrompt({
      asset: genreTreePrompt,
      promptInput: { prompt: "都市异能", retry: false, forceJson: true },
      contextBlocks: [
        createContextBlock({
          id: "core-1",
          group: "core",
          priority: 100,
          required: true,
          content: "核心设定：高压都市异能成长。",
        }),
      ],
    });
    assert.equal(captured.reasoningEnabled, undefined);
  } finally {
    setPromptRunnerStructuredInvokerForTests();
  }
});
