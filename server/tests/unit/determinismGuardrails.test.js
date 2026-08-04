const test = require("node:test");
const assert = require("node:assert/strict");
const { z } = require("zod");
const { parseStructuredLlmRawContentDetailed } = require("../../dist/llm/structuredInvokeParser.js");

test("Determinism-First Guardrails: pure-code syntactic repair and type coercion", async (t) => {
  await t.test("fixes trailing commas, markdown fences, and smart quotes via pure code", async () => {
    const rawContent = `
\`\`\`json
{
  "title": “第一章 破晓”,
  "chapterIndex": 1,
  "isFinished": true,
}
\`\`\`
    `;

    const schema = z.object({
      title: z.string(),
      chapterIndex: z.number(),
      isFinished: z.boolean(),
    });

    const result = await parseStructuredLlmRawContentDetailed({
      rawContent,
      schema,
      label: "test.deterministic.fix",
      strategy: "prompt_json",
      profile: {
        nativeJsonSchema: true,
        nativeJsonObject: true,
      },
    });

    assert.equal(result.repairUsed, false);
    assert.deepEqual(result.data, {
      title: "第一章 破晓",
      chapterIndex: 1,
      isFinished: true,
    });
  });

  await t.test("performs pure-code type coercion for string numbers and string booleans", async () => {
    const rawContent = JSON.stringify({
      title: "第二章 暗流",
      chapterIndex: "2",
      isFinished: "true",
      tags: ["fantasy", "adventure"],
    });

    const schema = z.object({
      title: z.string(),
      chapterIndex: z.number(),
      isFinished: z.boolean(),
      tags: z.array(z.string()),
    });

    const result = await parseStructuredLlmRawContentDetailed({
      rawContent,
      schema,
      label: "test.deterministic.coercion",
      strategy: "prompt_json",
      profile: {
        nativeJsonSchema: true,
        nativeJsonObject: true,
      },
    });

    assert.equal(result.repairUsed, false);
    assert.deepEqual(result.data, {
      title: "第二章 暗流",
      chapterIndex: 2,
      isFinished: true,
      tags: ["fantasy", "adventure"],
    });
  });
});
