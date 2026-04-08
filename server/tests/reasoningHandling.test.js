const test = require("node:test");
const assert = require("node:assert/strict");
const {
  ThinkTagStreamFilter,
  diffAccumulatedText,
  extractMiniMaxRawStreamData,
  extractReasoningTextFromChunk,
  isMiniMaxCompatibleProvider,
  resolveProviderReasoningBehavior,
} = require("../dist/llm/reasoning.js");

test("minimax provider behavior enables reasoning_split and raw response parsing", () => {
  const behavior = resolveProviderReasoningBehavior({
    provider: "minimax",
    baseURL: "https://api.minimax.io/v1",
    model: "MiniMax-M2.7",
    reasoningEnabled: false,
  });

  assert.equal(behavior.reasoningEnabled, false);
  assert.equal(behavior.includeRawResponse, true);
  assert.equal(behavior.usesAccumulatedStreamDeltas, true);
  assert.deepEqual(behavior.modelKwargs, { reasoning_split: true });
});

test("minimax detection works for provider id, baseURL and model name", () => {
  assert.equal(isMiniMaxCompatibleProvider("minimax", undefined, undefined), true);
  assert.equal(isMiniMaxCompatibleProvider("custom_gateway", "https://api.minimaxi.com/v1", undefined), true);
  assert.equal(isMiniMaxCompatibleProvider("custom_gateway", undefined, "MiniMax-M2.5-highspeed"), true);
  assert.equal(isMiniMaxCompatibleProvider("openai", "https://api.openai.com/v1", "gpt-5"), false);
});

test("diffAccumulatedText returns only the appended suffix", () => {
  assert.deepEqual(
    diffAccumulatedText("你好", "你好，世界"),
    {
      nextBuffer: "你好，世界",
      delta: "，世界",
    },
  );
  assert.deepEqual(
    diffAccumulatedText("你好，世界", "你好"),
    {
      nextBuffer: "你好",
      delta: "",
    },
  );
});

test("extractMiniMaxRawStreamData reads accumulated content and reasoning buffers", () => {
  const parsed = extractMiniMaxRawStreamData({
    choices: [{
      delta: {
        content: "最终正文",
        reasoning_details: [{
          text: "完整思考链",
        }],
      },
    }],
  });

  assert.deepEqual(parsed, {
    contentBuffer: "最终正文",
    reasoningBuffer: "完整思考链",
  });
});

test("ThinkTagStreamFilter strips think tags across split chunks", () => {
  const filter = new ThinkTagStreamFilter();
  const first = filter.push("<thi");
  const second = filter.push("nk>先思考</think>回答");
  const flushed = filter.flush();

  assert.deepEqual(first, { text: "", reasoning: "" });
  assert.deepEqual(second, { text: "", reasoning: "先思考" });
  assert.deepEqual(flushed, { text: "回答", reasoning: "" });
});

test("extractReasoningTextFromChunk supports generic reasoning payloads", () => {
  const text = extractReasoningTextFromChunk({
    content: [{
      type: "reasoning",
      reasoning: "内容里的思考",
    }],
    additional_kwargs: {
      reasoning_content: "附加字段思考",
      reasoning: {
        summary: [{
          text: "总结思考",
        }],
      },
    },
  });

  assert.equal(text, "附加字段思考总结思考内容里的思考");
});
