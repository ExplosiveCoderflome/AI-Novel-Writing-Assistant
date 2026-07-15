const test = require("node:test");
const assert = require("node:assert/strict");

// Hijack prisma.js in require cache to prevent database module loading and initialization errors
const prismaPath = require.resolve("../dist/db/prisma.js");
require.cache[prismaPath] = {
  id: prismaPath,
  filename: prismaPath,
  loaded: true,
  exports: {
    prisma: {
      appSetting: {
        findMany: async () => [],
      },
      directorLlmUsageRecord: {
        create: async () => ({}),
      },
    },
  },
};

// Mock getStructuredFallbackSettings before importing connectivity to prevent querying settings table
const fallbackSettings = require("../dist/llm/structuredFallbackSettings.js");
fallbackSettings.getStructuredFallbackSettings = async () => ({
  enabled: false,
  provider: "deepseek",
  model: "deepseek-chat",
  temperature: 0.2,
  maxTokens: null,
});

const { llmConnectivityService } = require("../dist/llm/connectivity.js");

const deepseekKey = process.env.DEEPSEEK_API_KEY;
const openaiKey = process.env.OPENAI_API_KEY;

test("Deepseek Live LLM structured connection check", { skip: !deepseekKey }, async () => {
  const result = await llmConnectivityService.testConnection({
    provider: "deepseek",
    apiKey: deepseekKey,
    probeMode: "structured",
  });

  assert.equal(result.ok, true, `Deepseek connection failed: ${result.error}`);
  assert.ok(result.structured, "Expected structured result segment");
  assert.equal(result.structured.ok, true, `Structured response parsing failed: ${result.structured.error}`);
});

test("OpenAI Live LLM structured connection check", { skip: !openaiKey }, async () => {
  const result = await llmConnectivityService.testConnection({
    provider: "openai",
    apiKey: openaiKey,
    probeMode: "structured",
  });

  assert.equal(result.ok, true, `OpenAI connection failed: ${result.error}`);
  assert.ok(result.structured, "Expected structured result segment");
  assert.equal(result.structured.ok, true, `Structured response parsing failed: ${result.structured.error}`);
});
