const test = require("node:test");
const assert = require("node:assert/strict");
const { HumanMessage, SystemMessage } = require("@langchain/core/messages");
const { assertNonEmptyLLMInput } = require("../dist/llm/requestGuard.js");

const meta = {
  provider: "openai",
  model: "glm-5",
  taskType: "auto_director",
  promptMeta: {
    promptId: "novel.volume.chapter_list",
    promptVersion: "v7",
  },
};

test("LLM request guard rejects empty invoke message arrays before provider call", () => {
  assert.throws(
    () => assertNonEmptyLLMInput("invoke", [], meta),
    /empty LLM request.*provider=openai.*model=glm-5.*method=invoke/i,
  );
});

test("LLM request guard rejects all-blank invoke messages before provider call", () => {
  assert.throws(
    () => assertNonEmptyLLMInput("invoke", [
      new SystemMessage("   "),
      new HumanMessage([{ type: "text", text: "\n\t" }]),
    ], meta),
    /empty LLM request.*promptId=novel\.volume\.chapter_list/i,
  );
});

test("LLM request guard rejects blank entries inside batch calls", () => {
  assert.throws(
    () => assertNonEmptyLLMInput("batch", [
      [new HumanMessage("写一个章节规划。")],
      [new HumanMessage("  ")],
    ], meta),
    /batchIndex=1/i,
  );
});

test("LLM request guard accepts non-empty messages", () => {
  assert.doesNotThrow(() => assertNonEmptyLLMInput("stream", [
    new SystemMessage("你是小说规划助手。"),
    new HumanMessage([{ type: "text", text: "规划第 1 卷。" }]),
  ], meta));
});
