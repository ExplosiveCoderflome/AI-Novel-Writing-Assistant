const test = require("node:test");
const assert = require("node:assert/strict");
const { HumanMessage } = require("@langchain/core/messages");
const { attachLLMDebugLogging } = require("../dist/llm/debugLogging.js");

function createStubLlm(result) {
  return {
    invoke: async () => result,
    stream: async () => ({
      async *[Symbol.asyncIterator]() {
        yield result;
      },
    }),
    batch: async () => [result],
  };
}

function withPatchedConsole(run) {
  const originalWarn = console.warn;
  const originalInfo = console.info;
  const warnings = [];
  const infos = [];
  console.warn = (...args) => {
    warnings.push(args.map((value) => String(value)).join(" "));
  };
  console.info = (...args) => {
    infos.push(args.map((value) => String(value)).join(" "));
  };

  return Promise.resolve()
    .then(() => run({ warnings, infos }))
    .finally(() => {
      console.warn = originalWarn;
      console.info = originalInfo;
    });
}

function withPatchedEnv(overrides, run) {
  const previous = new Map();
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, Object.prototype.hasOwnProperty.call(process.env, key) ? process.env[key] : undefined);
    if (value == null) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  return Promise.resolve()
    .then(run)
    .finally(() => {
      for (const [key, value] of previous.entries()) {
        if (value == null) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    });
}

test("attachLLMDebugLogging warns on zero completion tokens even when debug logging is off", async () => {
  await withPatchedEnv({
    NODE_ENV: "production",
    LLM_DEBUG_LOG: "0",
    LLM_LOW_COMPLETION_TOKENS_THRESHOLD: "4",
    LLM_LOW_COMPLETION_INPUT_TOKENS_THRESHOLD: "64",
  }, async () => {
    await withPatchedConsole(async ({ warnings, infos }) => {
      const llm = createStubLlm({
        content: "返回正文正常，但 token 统计异常。",
        usage_metadata: {
          input_tokens: 0,
          output_tokens: 0,
          total_tokens: 0,
        },
        response_metadata: {
          stop_reason: "end_turn",
        },
      });

      const wrapped = attachLLMDebugLogging(llm, {
        provider: "openai",
        model: "tk/MiniMax-M2.7",
        temperature: 0.2,
        baseURL: "https://aiproxy.mircosoft.cn/v1",
      });

      await wrapped.invoke([
        new HumanMessage("请用一句话解释什么是小说中的留白。"),
      ]);

      assert.equal(infos.length, 0);
      assert.equal(warnings.length, 1);
      assert.match(warnings[0], /event=low_completion_tokens/);
      assert.match(warnings[0], /completionTokens=0/);
      assert.match(warnings[0], /----- input -----/);
      assert.match(warnings[0], /----- output -----/);
      assert.match(warnings[0], /返回正文正常，但 token 统计异常。/);
    });
  });
});

test("attachLLMDebugLogging warns on suspiciously low completion tokens for long inputs", async () => {
  await withPatchedEnv({
    NODE_ENV: "production",
    LLM_DEBUG_LOG: "0",
    LLM_LOW_COMPLETION_TOKENS_THRESHOLD: "4",
    LLM_LOW_COMPLETION_INPUT_TOKENS_THRESHOLD: "64",
  }, async () => {
    await withPatchedConsole(async ({ warnings, infos }) => {
      const llm = createStubLlm({
        content: "只返回了很短的一句。",
        usage_metadata: {
          input_tokens: 400,
          output_tokens: 2,
          total_tokens: 402,
        },
        response_metadata: {
          stop_reason: "end_turn",
        },
      });

      const wrapped = attachLLMDebugLogging(llm, {
        provider: "openai",
        model: "tk/GLM-5.1",
        temperature: 0.2,
        baseURL: "https://aiproxy.mircosoft.cn/v1",
      });

      await wrapped.invoke([
        new HumanMessage(`请总结以下长文本的核心冲突：${"小说素材".repeat(200)}`),
      ]);

      assert.equal(infos.length, 0);
      assert.equal(warnings.length, 1);
      assert.match(warnings[0], /completionTokens=2/);
      assert.match(warnings[0], /inputTokens=400/);
      assert.match(warnings[0], /小说素材/);
    });
  });
});

test("attachLLMDebugLogging skips low-token anomaly warnings for short requests", async () => {
  await withPatchedEnv({
    NODE_ENV: "production",
    LLM_DEBUG_LOG: "0",
    LLM_LOW_COMPLETION_TOKENS_THRESHOLD: "4",
    LLM_LOW_COMPLETION_INPUT_TOKENS_THRESHOLD: "256",
  }, async () => {
    await withPatchedConsole(async ({ warnings, infos }) => {
      const llm = createStubLlm({
        content: "简短回答。",
        usage_metadata: {
          input_tokens: 18,
          output_tokens: 2,
          total_tokens: 20,
        },
        response_metadata: {
          stop_reason: "end_turn",
        },
      });

      const wrapped = attachLLMDebugLogging(llm, {
        provider: "openai",
        model: "tk/DeepSeek-V3.2",
        temperature: 0.2,
        baseURL: "https://aiproxy.mircosoft.cn/v1",
      });

      await wrapped.invoke([
        new HumanMessage("一句话解释留白。"),
      ]);

      assert.equal(infos.length, 0);
      assert.equal(warnings.length, 0);
    });
  });
});

test("attachLLMDebugLogging warns on low completion tokens for stream responses", async () => {
  await withPatchedEnv({
    NODE_ENV: "production",
    LLM_DEBUG_LOG: "0",
    LLM_LOW_COMPLETION_TOKENS_THRESHOLD: "4",
    LLM_LOW_COMPLETION_INPUT_TOKENS_THRESHOLD: "64",
  }, async () => {
    await withPatchedConsole(async ({ warnings, infos }) => {
      const llm = {
        invoke: async () => {
          throw new Error("not used");
        },
        stream: async () => ({
          async *[Symbol.asyncIterator]() {
            yield {
              content: "流式异常短答。",
              usage_metadata: {
                input_tokens: 512,
                output_tokens: 1,
                total_tokens: 513,
              },
              response_metadata: {
                stop_reason: "end_turn",
              },
            };
          },
        }),
        batch: async () => {
          throw new Error("not used");
        },
      };

      const wrapped = attachLLMDebugLogging(llm, {
        provider: "openai",
        model: "tk/MiniMax-M2.7",
        temperature: 0.2,
        baseURL: "https://aiproxy.mircosoft.cn/v1",
      });

      const stream = await wrapped.stream([
        new HumanMessage(`请总结以下长文本：${"章节内容".repeat(200)}`),
      ]);
      for await (const _chunk of stream) {
        // consume stream
      }

      assert.equal(infos.length, 0);
      assert.equal(warnings.length, 1);
      assert.match(warnings[0], /event=low_completion_tokens/);
      assert.match(warnings[0], /completionTokens=1/);
      assert.match(warnings[0], /流式异常短答/);
    });
  });
});
